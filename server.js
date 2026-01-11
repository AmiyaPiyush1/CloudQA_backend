require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send("✅ Server is Running!"));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash",
    generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.1,
    }
});

function parseGeminiResponse(text) {
    try {
        let cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("❌ JSON Parse Error:", text);
        return { error: "Invalid JSON", raw: text };
    }
}

app.post('/api/agent/decide', async (req, res) => {
  const start = Date.now();
  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;
    console.log("\n⬇️ ⬇️ ⬇️ ⬇️ ⬇️ INCOMING REQUEST ⬇️ ⬇️ ⬇️ ⬇️ ⬇️");
    console.log(`🎯 GOAL: "${userIntent}"`);
    console.log(`🔗 URL: ${currentUrl}`);
    
    if (domSnapshot) {
        console.log(`📦 DOM SIZE: ${domSnapshot.length} chars`);
    } else {
        console.error("❌ ERROR: DOM Snapshot is EMPTY!");
        return res.status(400).json({ error: "DOM Snapshot required" });
    }
    const prompt = `
    You are an intelligent QA Automation Agent.
    
    TASK: Analyze the provided DOM Snapshot and map the USER INTENT to a sequence of actionable steps.
    OUTPUT: Return a STRICT JSON ARRAY of objects.
    
    USER INTENT: "${userIntent}"
    CURRENT URL: "${currentUrl}"
    
    DOM SNAPSHOT:
    ${domSnapshot}

    ---------------------------------------------------
    ⚠️ RULES FOR SELECTORS:
    1. Look for 'id', 'name', 'data-test', 'data-testid', or unique 'class' attributes.
    2. If the user wants to OPEN a URL, the first step must be type: "open".
    3. If the user wants to TYPE, include the 'value' field.
    4. If the user wants to CLICK, 'value' is not needed.
    RULES:
    1. ANALYZE ONLY THE PROVIDED DOM. Do not hallucinate elements that "should" be there.
    2. ONE PAGE AT A TIME. If a user wants to "Book a Hotel", but you are on the Search Page, your ONLY job is to fill the search form and click "Search". Do NOT try to select a room yet.
    3. STOP ON NAVIGATION. If an action (like clicking "Search" or "Login") will cause a page reload, that MUST be the LAST action in your array.
    4. NO FUTURE PLANNING. Do not return steps for the next page.
    
    RESPONSE FORMAT (JSON ARRAY):
    [
      {
        "name": "Short human-readable name of element",
        "type": "click" | "type" | "open",
        "selector": "CSS Selector (e.g. #username, .btn-primary)",
        "value": "Text to type (only if type is 'type') or URL (if type is 'open')"
      }
    ]
    ---------------------------------------------------
    `;

    const result = await model.generateContent(prompt);
    const duration = (Date.now() - start)/1000;
    
    const responseText = result.response.text();
    const actionPlan = parseGeminiResponse(responseText);

    console.log(`\n✅ AI GENERATED IN ${duration}s`);
    console.log("🤖 ACTION PLAN:");
    console.log(JSON.stringify(actionPlan, null, 2));
    console.log("⬆️ ⬆️ ⬆️ ⬆️ ⬆️ END OF TURN ⬆️ ⬆️ ⬆️ ⬆️ ⬆️\n");

    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 SERVER ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
