import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { addLog, recordLearningFeedback } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { imageBase64 } = await req.json();

    const systemInstruction = `あなたは優秀な進路指導担当のAIチューターです。
アップロードされた模試の成績表画像を分析し、以下のJSONフォーマットで返答してください。
{
  "analyzedSubjects": ["成績が振るわなかった科目や分野名1", "科目2"],
  "analysisText": "成績表全体を見た総合的な分析と、次に向けての学習アドバイス（マークダウン可）"
}`;

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');

    const modelsToTry = await getActiveModels('chat');

    let text = '';
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            responseMimeType: 'application/json',
          },
        });

        const result = await model.generateContent([
          {
            inlineData: {
              data: base64Data,
              mimeType: 'image/jpeg',
            },
          },
          'この成績表を分析してください。',
        ]);

        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Exam Analysis model ${modelName} failed.`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error('All Gemini models failed for Exam Analysis.');
    }

    const analysisData = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());

    // 確実にDBへ模試ログを保存し、検出された弱点分野を次回学習の重点復習キューへ自動フィードバック
    await addLog('exam', {
      ...analysisData,
      message: `📈 模試成績表を解析しました（重点補強分野: ${(analysisData.analyzedSubjects || []).join('・')}）`,
    });

    if (Array.isArray(analysisData.analyzedSubjects)) {
      for (const weakTopic of analysisData.analyzedSubjects.slice(0, 5)) {
        await recordLearningFeedback({
          topic: weakTopic,
          subject: weakTopic,
          scorePercent: 45, // Flag as priority review
          totalQuestions: 5,
          source: 'ai_drill',
        });
      }
    }

    return NextResponse.json(analysisData);
  } catch (error: any) {
    console.error('Exam Analysis API Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze exam image.' },
      { status: 500 }
    );
  }
}
