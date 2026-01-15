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
    1. MULTI-STEP PLAN: If the page has both an obstruction (Cookie Banner/Modal) AND the target action (Login/Signup/Search), return BOTH in the array. Place the obstruction-clearing step FIRST.
    2. OBSTRUCTIONS: Identify elements like "Accept All", "Allow Cookies", or "Close Modal". Clearing these is the highest priority.
    3. LOGIN GATE: If the intent requires authentication and login fields are visible, generate the typing and clicking steps for login.
    4. REDIRECTS: If an action causes a page reload (like clicking 'Submit' or 'Search'), it MUST be the final step in the array.
    5. RELEVANCE: If the site cannot fulfill the intent (e.g., buying a shirt on an HR site), prioritize finding a Search bar. If impossible, return [] with a log.

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
      "log": "Brief reasoning for this step (e.g., 'Clearing cookie banner before login')"
    }]`;

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().replace(/```json|```/g, '').trim();
    const actionPlan = JSON.parse(textResponse);
    
    console.log(`✅ Plan for ${currentUrl}:`, actionPlan);
    res.json(actionPlan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => console.log(`🚀 Backend Live on 5000`));
