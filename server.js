require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => res.send("✅ CloudQA Agent Server is Running!"));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash", 
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
    
    console.log("\n--- INCOMING REQUEST ---");
    console.log(`🎯 INTENT: ${userIntent}`);
    console.log(`🔗 URL: ${currentUrl}`);

    if (!domSnapshot) {
        return res.status(400).json({ error: "DOM Snapshot is required" });
    }

    const prompt = `
    You are a CloudQA Test Recorder emulator. 
    Analyze the provided DOM Snapshot and map the USER INTENT to actionable steps.
    
    CRITICAL RULES:
    1. ANALYZE ONLY THE PROVIDED DOM. 
    2. NAVIGATION RULE: If an action (like "Search") causes a page reload, it MUST be the last step in this JSON array.
    3. SCHEMA: Return a STRICT JSON ARRAY following the CloudQA Recording Schema exactly.

    USER INTENT: "${userIntent}"
    CURRENT URL: "${currentUrl}"
    DOM SNAPSHOT:
    ${domSnapshot}

    RESPONSE FORMAT (JSON ARRAY):
    [
      {
        "type": "click" | "type" | "open" | "assert",
        "isFrame": false,
        "frameSelector": "",
        "target": "Robust XPATH",
        "cssPath": "Unique CSS selector",
        "name": "Friendly Name",
        "value": "Action Value",
        "currentUrl": "${currentUrl}",
        "isdeleted": false,
        "pageTitle": "CloudQA Sandbox",
        "pageHeader": "",
        "htmltag": "The exact raw HTML tag of the element",
        "hideCommand": false,
        "text": "The value to type (if type is 'type')"
      }
    ]`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const actionPlan = parseGeminiResponse(responseText);

    const duration = (Date.now() - start) / 1000;
    
    console.log(`\n✅ AI RESPONSE GENERATED (${duration}s):`);
    console.log(JSON.stringify(actionPlan, null, 2)); 
    console.log("-------------------------------------------\n");
    
    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 SERVER ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
