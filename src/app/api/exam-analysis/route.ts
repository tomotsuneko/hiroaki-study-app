import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    const systemInstruction = `あなたは優秀な進路指導担当のAIチューターです。
アップロードされた模試の成績表画像を分析し、以下のJSONフォーマットで返答してください。
{
  "analyzedSubjects": ["成績が振るわなかった科目や分野名1", "科目2"],
  "analysisText": "成績表全体を見た総合的な分析と、次に向けての学習アドバイス（マークダウン可）"
}`;

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");

    const modelsToTry = await getActiveModels('chat');

    let text = "";
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            responseMimeType: "application/json",
          }
        });

        const result = await model.generateContent([
          {
            inlineData: {
              data: base64Data,
              mimeType: "image/jpeg"
            }
          },
          "この成績表を分析してください。"
        ]);

        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Exam Analysis model ${modelName} failed.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error("All Gemini models failed for Exam Analysis.");
    }
    
    const analysisData = JSON.parse(text);

    import('@/lib/db').then(async ({ addLog }) => {
      await addLog('exam', analysisData);
    });

    return NextResponse.json(analysisData);
  } catch (error: any) {
    console.error('Exam Analysis API Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze exam image.' },
      { status: 500 }
    );
  }
}
