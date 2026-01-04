require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());

app.use(express.json({ limit: '50mb' }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0 
    }
});

function parseGeminiResponse(text) {
    try {
        const cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("Failed to parse JSON:", text);
        return { error: "Invalid JSON from AI", raw: text };
    }
}

app.post('/api/agent/decide', async (req, res) => {
  try {
    const { userIntent, domSnapshot, currentUrl, previousActions } = req.body;

    console.log(`\n--- NEW TURN ---`);
    console.log(`[Goal]: "${userIntent}"`);
    console.log(`[URL]: ${currentUrl}`);

    const prompt = `
      You are an autonomous browser agent. Your job is to achieve the user's GOAL.
      
      === CONTEXT ===
      GOAL: "${userIntent}"
      CURRENT URL: "${currentUrl}"
      PREVIOUS ACTIONS: ${JSON.stringify(previousActions || [])}
      
      === HTML SNAPSHOT ===
      ${domSnapshot}

      === RULES ===
      1. ANALYZE: Look at the HTML. Does it match the Goal?
      2. HISTORY: Do not repeat the exact same action from PREVIOUS ACTIONS if it didn't work.
      3. POPUPS: If a popup obscures the view, close it first.
      4. FINISH: If the goal is achieved, return action: "completed".
      5. SELECTORS: Use resilient selectors (aria-label, placeholder, text content).

      === OUTPUT FORMAT (JSON ONLY) ===
      Return a JSON object with these fields:
      {
        "thought": "Reasoning for the action", 
        "action": "click" | "type" | "wait" | "completed",
        "selector": "CSS selector (null if completed)",
        "value": "Text to type (only for type action)",
        "description": "Short description for human approval"
      }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const actionPlan = parseGeminiResponse(responseText);
    
    console.log(`[AI Plan]: ${actionPlan.thought}`);
    console.log(`[Action]: ${actionPlan.action} -> ${actionPlan.selector}`);

    res.json(actionPlan);

  } catch (error) {
    console.error("SERVER ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}