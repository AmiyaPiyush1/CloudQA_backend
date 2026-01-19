require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash", 
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
});

app.post('/api/agent/decide', async (req, res) => {
  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;
    
    const prompt = `
    You are a CloudQA Test Automation Architect. 
    Analyze the DOM and URL to fulfill the USER INTENT.

    LOGIC RULES:
    1. NO EMPTY RESPONSES: You must ALWAYS return at least one object. If no action is possible, return an object with type: "log".
    2. MULTI-LAYER RESOLUTION: If a Cookie Banner (like Cookiebot in the DOM) or Modal is visible, your FIRST action must be to click "Allow all", "Accept", or "Close" along with other relevant options like login or sign up if the intent is something but to achieve that first we need to login in.
    3. GOAL PRIORITY: After clearing obstructions, look for elements matching the INTENT (e.g., "30 Day Free Trial" or "Login").
    4. RELEVANCE FALLBACK: If the site is irrelevant (e.g., "buy shirt" on OrangeHRM), look for a SEARCH bar. If no search exists, return: [{"type": "log", "message": "Site mismatch: Cannot find intent items or search bar on this domain."}]
    5. DOM LIMIT: Work only with the provided DOM.

    USER INTENT: "${userIntent}"
    CURRENT URL: "${currentUrl}"
    DOM: ${domSnapshot}

    RESPONSE (JSON ARRAY ONLY):
    [{
      "type": "click" | "type" | "log",
      "target": "XPATH",
      "cssPath": "CSS Selector",
      "name": "Element Name",
      "value": "Value to type",
      "message": "Reasoning for the action or failure"
    }]`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().replace(/```json|```/g, '').trim();
    
    // Safety check for empty JSON
    let actionPlan = JSON.parse(textResponse);
    if (!Array.isArray(actionPlan) || actionPlan.length === 0) {
        actionPlan = [{ type: "log", message: "AI generated an empty plan. Check site relevance." }];
    }
    
    console.log(`✅ Final Plan for ${currentUrl}:`, actionPlan);
    res.json(actionPlan);
  } catch (error) {
    console.error("❌ API Error:", error.message);
    res.status(500).json([{ type: "log", message: error.message }]);
  }
});

app.listen(5000, () => console.log(`🚀 Backend Live on 5000`));
