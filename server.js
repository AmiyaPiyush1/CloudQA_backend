require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.0-flash", 
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
});

app.post('/api/agent/decide', async (req, res) => {
  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;
    
    const prompt = `
    You are a CloudQA Test Automation Architect. 
    Analyze the DOM and URL to fulfill the USER INTENT.

    LOGIC RULES:
    1. OBSTRUCTIONS: If a Cookie Banner, Modal, or "Accept/Allow" button is present, your ONLY priority is to click it to clear the view.
    2. LOGIN GATE: If the URL/DOM indicates a Login Page and the INTENT requires being logged in, generate login steps first.
    3. RELEVANCE CHECK: If the current site (URL/DOM) is irrelevant to the intent (e.g., Intent is "buy shirt" but site is "OrangeHRM"), look for a Search bar to find the item. If no search exists and it is impossible to fulfill the intent on this site, return an empty array [] and a "log" field explaining the mismatch.
    4. REDIRECTS: If an action causes a page reload, it MUST be the last step in the array.
    5. DOM LIMIT: Only suggest actions for elements present in the current DOM.

    USER INTENT: "${userIntent}"
    CURRENT URL: "${currentUrl}"
    DOM: ${domSnapshot}

    RESPONSE (JSON ARRAY ONLY):
    [{
      "type": "click" | "type",
      "target": "XPATH",
      "cssPath": "Unique CSS Selector",
      "name": "Friendly Name",
      "value": "Text to type",
      "log": "Explanation of reasoning or relevance mismatch"
    }]`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().replace(/```json|```/g, '').trim();
    const actionPlan = JSON.parse(textResponse);
    
    if (actionPlan.length > 0 && actionPlan[0].log) {
        console.log(`[AGENT LOG]: ${actionPlan[0].log}`);
    }

    console.log(`✅ Plan for ${currentUrl}:`, actionPlan);
    res.json(actionPlan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => console.log(`🚀 Backend Live on 5000`));
