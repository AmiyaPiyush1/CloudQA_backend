require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 1. HEALTH CHECK
app.get('/', (req, res) => res.send("✅ Server is Running!"));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. SPEED CONFIGURATION
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite", 
    generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.0,      
        maxOutputTokens: 2000 
    }
});

function parseGeminiResponse(text) {
    try {
        let cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        try {
            const fixed = text.replace(/(?<=: ")([\s\S]*?)(?=")/g, (match) => match.replace(/\n/g, "\\n"));
            return JSON.parse(fixed);
        } catch (e2) {
            console.error("❌ FATAL JSON Error:", text);
            return { error: "Invalid JSON", raw: text };
        }
    }
}

app.post('/api/agent/decide', async (req, res) => {
  const start = Date.now();
  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;

    // ============================================================
    // 🔍 DEEP INSPECTION LOGGING
    // ============================================================
    console.log("\n⬇️ ⬇️ ⬇️ ⬇️ ⬇️ INCOMING REQUEST ⬇️ ⬇️ ⬇️ ⬇️ ⬇️");
    console.log(`🎯 GOAL: "${userIntent}"`);
    console.log(`🔗 URL: ${currentUrl}`);
    
    if (domSnapshot) {
        console.log(`📦 TOTAL DOM SIZE: ${domSnapshot.length} characters`);
        
        // Split by newlines to give you exactly 100 lines
        const domLines = domSnapshot.split('\n');
        const previewLines = domLines.slice(0, 100).join('\n');
        
        console.log("\n📄 DOM SNAPSHOT (First 100 Lines):");
        console.log("--------------------------------------------------");
        console.log(previewLines);
        console.log("--------------------------------------------------");
        
        if (domLines.length > 100) {
            console.log(`... (${domLines.length - 100} more lines hidden) ...`);
        }
    } else {
        console.error("❌ ERROR: DOM Snapshot is EMPTY or UNDEFINED!");
    }
    // ============================================================

    const prompt = `
      CONTEXT: User wants to "${userIntent}" on URL "${currentUrl}".
      DOM: ${domSnapshot}

      TASK: Return a JSON object with a JavaScript IIFE to execute this.
      RULES:
      1. Use (async function(){ ... })(); format.
      2. Dropdowns: Type text -> Poll for .select2-results__option -> Click result.
      3. Input: Dispatch 'input', 'keydown', 'keyup' events.
      4. Selectors: Use IDs (#tab-flights) or Names (name='from').
      5. NO EXPLANATIONS. ONLY JSON.

      SCHEMA: { "script": "string", "thought": "string" }
    `;

    const result = await model.generateContent(prompt);
    const duration = (Date.now() - start)/1000;
    
    const responseText = result.response.text();
    
    // ============================================================
    // 🔍 AI RESPONSE LOGGING
    // ============================================================
    console.log(`\n✅ AI GENERATED IN ${duration}s`);
    console.log("🤖 RAW RESPONSE FROM AI:");
    console.log("--------------------------------------------------");
    console.log(responseText);
    console.log("--------------------------------------------------");
    console.log("⬆️ ⬆️ ⬆️ ⬆️ ⬆️ END OF TURN ⬆️ ⬆️ ⬆️ ⬆️ ⬆️\n");
    // ============================================================

    const actionPlan = parseGeminiResponse(responseText);
    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));