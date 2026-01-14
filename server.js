require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Note: Ensure your environment supports gemini-2.0-flash or 1.5-flash
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
    1. LOGIN GATE: If the URL/DOM indicates a Login Page and the INTENT requires being logged in, your ONLY priority is to generate login steps first.
    2. REDIRECTS: If an action (click/submit) causes a page reload, it MUST be the last step in the array.
    3. DOM LIMIT: Only suggest actions for elements present in the current DOM.

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
      "text": "Text to type",
      "htmltag": "Tag name"
    }]`;

    const result = await model.generateContent(prompt);
    const actionPlan = JSON.parse(result.response.text().replace(/```json|```/g, '').trim());
    
    console.log(`✅ Plan for ${currentUrl}:`, actionPlan);
    res.json(actionPlan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => console.log(`🚀 Backend Live on 5000`));