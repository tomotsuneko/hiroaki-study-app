import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set in environment variables");
}

export const genAI = new GoogleGenerativeAI(apiKey || "");

// 指定された最新の高速モデル（Flash系）を使用
export const aiModel = genAI.getGenerativeModel({ 
  model: "gemini-3.8-flash",
  systemInstruction: "あなたは千葉県立我孫子高校2年生（理系）の生徒を指導する、優秀で優しい塾講師AIです。目標は日東駒専レベルの理系学部への現役合格です。生徒の成績は中の下なので、基礎から丁寧に、時にはモチベーションを上げるように褒めながら指導してください。回答はマークダウン形式で分かりやすく書いてください。"
});
