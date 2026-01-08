require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 1. HEALTH CHECK
app.get('/', (req, res) => {
    res.send("✅ Server is Running!");
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-001", 
    generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.0,      
        maxOutputTokens: 2000 
    }
});

// ✅ FIX 1: Robust JSON Parser (Fixes Newlines)
function parseGeminiResponse(text) {
    try {
        // 1. Remove Markdown code blocks
        let cleaned = text.replace(/```json|```/g, '').trim();
        
        // 2. Attempt basic parse
        return JSON.parse(cleaned);
    } catch (e) {
        // 3. FALLBACK: If standard parse fails, try to fix newlines
        // This regex looks for newlines inside quotes and escapes them
        try {
            console.warn("⚠️ JSON Parse failed. Attempting newline repair...");
            const fixed = text.replace(/(?<=: ")([\s\S]*?)(?=")/g, (match) => {
                return match.replace(/\n/g, "\\n");
            });
            return JSON.parse(fixed);
        } catch (e2) {
            console.error("❌ FATAL JSON Error:", text);
            return { error: "Invalid JSON from AI", raw: text };
        }
    }
}

app.post('/api/agent/decide', async (req, res) => {
  const start = Date.now();
  
  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;

    // ✅ FIX 2: Log the Input Data
    console.log("------------------------------------------------");
    console.log(`⏱️ Request Received`);
    console.log(`🎯 Goal: "${userIntent.substring(0, 50)}..."`);
    console.log(`📦 DOM Size Received: ${domSnapshot ? domSnapshot.length : 0} chars`);
    console.log("------------------------------------------------");

    if (!domSnapshot) throw new Error("DOM Snapshot is missing!");

    const prompt = `
      CONTEXT: User wants to "${userIntent}" on URL "${currentUrl}".
      DOM: ${domSnapshot}

      TASK: Return a JSON object with a JavaScript IIFE to execute this.
      
      RULES:
      1. Use (async function(){ ... })(); format.
      2. Dropdowns: Type text -> Poll for .select2-results__option -> Click result.
      3. Input: Dispatch 'input', 'keydown', 'keyup' events.
      4. Selectors: Use IDs (#tab-flights) or Names (name='from').
      5. NO EXPLANATIONS. ONLY JSON. DO NOT USE REAL NEWLINES IN STRINGS.

      SCHEMA: { "script": "string", "thought": "string" }
    `;

    const resultPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Gemini took too long")), 9000)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    console.log(`✅ AI Responded in ${(Date.now() - start)/1000}s`);

    const responseText = result.response.text();
    const actionPlan = parseGeminiResponse(responseText);

    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));