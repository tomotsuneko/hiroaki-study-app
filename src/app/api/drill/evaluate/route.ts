import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { addLog, recordLearningFeedback } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { subject, topic, unitCode, mode, questions, answers, profile } = await req.json();

    const userName = profile?.name || '生徒';
    const label = topic ? `${subject}（${topic}）` : subject;

    const systemInstruction = `あなたは優秀なAI家庭教師です。生徒（${userName}）が「${label}」のテスト・演習ドリルを解きました。
問題文、模範解答、そして生徒の解答が渡されます。
各問題に対して、生徒の解答が合っているか（部分点や考え方が合っているかも考慮）、どこで間違えたかを分析し、具体的な改善アドバイスとともにフィードバックを生成してください。
フォーマットは必ず以下のJSON形式にしてください。

[
  {
    "id": 1,
    "isCorrect": true/false,
    "feedback": "フィードバック文（マークダウン可、数式は$や$$）"
  }
]`;

    const prompt = JSON.stringify({
      questions: questions,
      studentAnswers: answers,
    });

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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Drill Evaluate model ${modelName} failed.`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error('All Gemini models failed for Drill Evaluate.');
    }

    const analysisData = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    const correctCount = Array.isArray(analysisData)
      ? analysisData.filter((a: any) => a.isCorrect).length
      : 0;
    const totalCount = Array.isArray(analysisData) && analysisData.length > 0 ? analysisData.length : 5;
    const scorePercent = Math.round((correctCount / totalCount) * 100);

    // 確実にDBへログ保存 & 次回学習へのフィードバック（習得認定 / 弱点補強キュー登録）を実行
    await addLog('drill', {
      subject,
      topic: topic || '',
      unitCode: unitCode || '',
      mode: mode || 'unit',
      score: `${correctCount}/${totalCount}`,
      scorePercent,
      total: totalCount,
      message: `【AI演習】「${label}」: ${totalCount}問中${correctCount}問正解 (${scorePercent}%)`,
    });

    await recordLearningFeedback({
      unitCode: unitCode || '',
      topic: topic || subject || '',
      subject: subject || '数学',
      scorePercent,
      totalQuestions: totalCount,
      source: 'ai_drill',
    });

    return NextResponse.json(analysisData);
  } catch (error: any) {
    console.error('Drill Evaluate API Error:', error);
    return NextResponse.json(
      { error: 'Failed to evaluate drill answers.' },
      { status: 500 }
    );
  }
}
