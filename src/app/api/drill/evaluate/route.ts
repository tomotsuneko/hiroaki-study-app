import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { subject, questions, answers, profile } = await req.json();

    const userName = profile?.name || '生徒';

    const systemInstruction = `あなたは優秀なAI家庭教師です。生徒（${userName}）が「${subject}」のドリルを解きました。
問題文、模範解答、そして生徒の解答が渡されます。
各問題に対して、生徒の解答が合っているか、どこで間違えたかを分析し、励ましの言葉とともにフィードバックを生成してください。
フォーマットは必ず以下のJSON形式にしてください。

[
  {
    "id": 1,
    "isCorrect": true/false,
    "feedback": "フィードバック文（マークダウン可、数式は$や$$）"
  },
  ...
]`;

    const prompt = JSON.stringify({
      questions: questions,
      studentAnswers: answers
    });

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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Drill Evaluate model ${modelName} failed.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error("All Gemini models failed for Drill Evaluate.");
    }
    
    const analysisData = JSON.parse(text);
    
    // DBに保存
    import('@/lib/db').then(async ({ addLog }) => {
      await addLog('drill', { subject, score: analysisData.filter((a:any) => a.isCorrect).length, total: analysisData.length });
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
