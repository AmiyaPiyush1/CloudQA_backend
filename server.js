require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 1. HEALTH CHECK (Ping this to see if Vercel is alive)
app.get('/', (req, res) => {
    res.send("✅ Server is Running! Send POST requests to /api/agent/decide");
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 2. SPEED CONFIGURATION (Crucial for Vercel Free Tier)
const model = genAI.getGenerativeModel({ 
    model: "gemini-2.5-flash-lite", // Faster than Pro/2.0
    generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.1,      // Precise code
    }
});

function parseGeminiResponse(text) {
    try {
        const cleaned = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error("JSON Parse Error:", text);
        return { error: "Invalid JSON", raw: text };
    }
}

app.post('/api/agent/decide', async (req, res) => {
  console.log("⏱️ Request Received");
  const start = Date.now();

  try {
    const { userIntent, domSnapshot, currentUrl } = req.body;

    // 3. THE "SENIOR ENGINEER" PROMPT
    const prompt = `
      You are a Senior Frontend Automation Engineer. 
      Your goal is to write a ROBUST, SELF-CONTAINED JavaScript function to accomplish the user's request on the provided DOM.

      === USER CONTEXT ===
      GOAL: "${userIntent}"
      URL: "${currentUrl}"
      
      === DOM SNAPSHOT (Cleaned) ===
      ${domSnapshot}

      === CODING GUIDELINES (STRICT) ===
      1. **Output Format:** Return a valid JSON object with a "script" field containing the code.
      2. **Structure:** The code MUST be an IIFE: (async function() { ... })();
      3. **Robustness:** - NEVER just set .value directly. You MUST dispatch 'input', 'keydown', and 'keyup' events to trigger listeners.
         - Use resilient selectors (IDs, Names). Avoid generic classes.
      4. **Select2 / Dropdowns:** - Type the text letter-by-letter.
         - POLL (wait loop) for the results container (.select2-results__option) to appear.
         - Click the specific result element.
      5. **Error Handling:** Log "✅ Success" or "❌ Error" to the console.

      === RESPONSE SCHEMA ===
      {
        "thought": "Reasoning...",
        "script": "The Javascript code string...",
        "description": "Short summary"
      }
    `;

    // 4. TIMEOUT RACE (Fails gracefully after 9s instead of crashing)
    const resultPromise = model.generateContent(prompt);
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Gemini took too long")), 9000)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);
    console.log(`✅ AI Responded in ${(Date.now() - start)/1000}s`);

    const responseText = result.response.text();
    const actionPlan = parseGeminiResponse(responseText);

    res.json(actionPlan);

  } catch (error) {
    console.error("🔥 ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));