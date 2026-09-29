import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';

export async function GET() {
  const profile = { targetSchools: ['東大'], weakSubjects: ['英語'] };
  
  const systemInstruction = `あなたはAIです。本日の分析レポートをJSON形式で返してください。
{ "test": 123 }`;

  const modelsToTry = await getActiveModels('syllabus');
  let errLogs = [];
  
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: systemInstruction,
        generationConfig: { 
          responseMimeType: "application/json",
          maxOutputTokens: 8192
        }
      });
      const result = await model.generateContent("hello");
      return NextResponse.json({ success: true, text: (await result.response).text() });
    } catch (e: any) {
      errLogs.push({ model: modelName, error: e.message, name: e.name });
    }
  }
  
  return NextResponse.json({ success: false, errors: errLogs });
}
