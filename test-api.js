require('dotenv').config({ path: '.env.local' });
const { GoogleGenerativeAI } = require("@google/generativeAI");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function run() {
  const modelName = "gemini-1.5-flash"; // A model we know exists
  try {
    const model = genAI.getGenerativeModel({ 
      model: modelName,
      systemInstruction: "あなたはAIチューターです。以下のデータを分析しJSONで返してください。",
      generationConfig: { 
        responseMimeType: "application/json",
        maxOutputTokens: 8192
      }
    });

    console.log("Calling model...");
    const result = await model.generateContent("test data");
    console.log("Success:", await result.response.text());
  } catch (err) {
    console.error("Error from Gemini:", err.message);
  }
}
run();
