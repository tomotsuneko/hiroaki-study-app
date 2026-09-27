import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set in environment variables");
}

export const genAI = new GoogleGenerativeAI(apiKey || "");

// 指定された最新の高速モデル（Flash系）を使用
export const aiModel = genAI.getGenerativeModel({ 
  model: "gemini-1.5-flash", // 実際の最新モデルに修正
  systemInstruction: "あなたは生徒を指導する、優秀で優しい塾講師AIです。目標は日東駒専レベルの理系学部への現役合格です。基礎から丁寧に、時にはモチベーションを上げるように褒めながら指導してください。回答はマークダウン形式で分かりやすく書いてください。"
});
