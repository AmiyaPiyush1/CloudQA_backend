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

// 2. CONFIGURATION (Fixed Model Name)
// "gemini-2.5-flash-lite" does not exist yet. Using the stable Flash model.
const model = genAI.getGenerativeModel({ 
    model: "gemini-3-flash", 
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
            // Fix newlines inside strings if the AI added them
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
    // 🔍 DEEP INSPECTION: DOM LOGGING
    // ============================================================
    console.log("\n⬇️ ⬇️ ⬇️ ⬇️ ⬇️ INCOMING REQUEST ⬇️ ⬇️ ⬇️ ⬇️ ⬇️");
    console.log(`🎯 GOAL: "${userIntent}"`);
    console.log(`🔗 URL: ${currentUrl}`);
    
    if (domSnapshot) {
        console.log(`📦 TOTAL DOM SIZE: ${domSnapshot.length} characters`);
        
        // Print exactly the first 100 lines so you can see the structure
        const domLines = domSnapshot.split('\n');
        const previewLines = domLines.slice(0, 100).join('\n');
        
        console.log("\n📄 DOM SNAPSHOT (Top 100 Lines):");
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

    // ⚠️ STRICT PROMPT RE-APPLIED
    // (Prevents the 'require is not defined' error)
    const prompt = `
      CONTEXT: User wants to "${userIntent}" on URL "${currentUrl}".
      DOM: ${domSnapshot}

      TASK: Return a JSON object with a JavaScript IIFE to execute this.
      
      ⚠️ STRICT CONSTRAINTS (MUST FOLLOW):
      1. USE ONLY VANILLA JAVASCRIPT (No 'require', No 'import', No Cypress/Playwright/Selenium).
      2. USE DOM APIs: document.querySelector, dispatchEvent, click(), value = "".
      3. EVENT DISPATCHING: When typing, you MUST dispatch 'keydown', 'input', and 'keyup' for every character.
      4. POLLING: Use 'await new Promise' with 'setInterval' to wait for dropdowns.
      5. SELECTORS: Prioritize IDs (#flights-search) and Name attributes (name='from').
      6. OUTPUT FORMAT: Single line JSON.

      SCHEMA: { "script": "string", "thought": "string" }
    `;

    const result = await model.generateContent(prompt);
    const duration = (Date.now() - start)/1000;
    
    const responseText = result.response.text();
    
    // ============================================================
    // 🔍 DEEP INSPECTION: RESPONSE LOGGING
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