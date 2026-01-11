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
    // We accept 'systemPrompt' from the frontend now
    const { userIntent, domSnapshot, currentUrl, systemPrompt } = req.body;

    console.log(`\n🎯 INTENT: "${userIntent}"`);
    console.log(`🔗 URL: ${currentUrl}`);

    // ============================================================
    // 🧠 THE NEW BRAIN: "Hybrid Command Mode"
    // ============================================================
    const prompt = `
      CONTEXT: User wants to "${userIntent}" on URL "${currentUrl}".
      
      SYSTEM NOTES: ${systemPrompt || "None"}

      DOM SNAPSHOT (Truncated):
      ${domSnapshot ? domSnapshot.substring(0, 25000) : "No DOM provided"}

      TASK: 
      Return a JSON object with a JavaScript execution plan.
      
      ⚠️ CRITICAL INSTRUCTION:
      The frontend has a built-in "Hybrid Helper" library. 
      You do NOT need to write complex event logic (no dispatchEvent, no input.value=...).
      Simply return the async function calls using the provided helpers.

      AVAILABLE HELPERS (Use these exclusively):
      - await typeText(selector, text)  // Handles focus, clearing, typing, and React events automatically.
      - await clickElement(selector)    // Handles waiting, scrolling, and clicking safely.

      RULES:
      1. Analyze the DOM to find the best CSS selectors (IDs preferred).
      2. Return ONLY the sequence of helper calls.
      3. Do NOT define the helpers yourself. They are already there.
      4. OUTPUT FORMAT: Single line JSON.

      SCHEMA: { "script": "string", "thought": "string" }
    `;

    const result = await model.generateContent(prompt);
    const duration = (Date.now() - start)/1000;
    
    const responseText = result.response.text();
    console.log(`✅ AI Replied in ${duration}s`);

    const actionPlan = parseGeminiResponse(responseText);
    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));