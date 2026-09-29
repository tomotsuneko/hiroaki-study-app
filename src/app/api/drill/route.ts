import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { subject, profile } = await req.json();

    const userName = profile?.name || '生徒';
    const targetSchools = profile?.targetSchools?.length > 0 ? profile.targetSchools.join('、') : '日東駒専レベルの理系学部';

    const systemInstruction = `あなたは優秀なAI家庭教師です。
生徒（${userName}、目標校：${targetSchools}）のために、「${subject}」のドリル問題を生成します。

【ハルシネーション（嘘の出力）対策の厳守事項】
- 数学や理科の問題を生成する際は、計算結果が正確に割り切れる、または一般的な解になるように設定してください。架空の法則や間違った公式を絶対に使用しないでください。
- 英語の問題では、実在する文法規則とネイティブが使う自然な表現のみを使用してください。
- 知識が不確実な奇問は避け、必ず市販の参考書（チャート式、ターゲット1900等）に載っているような「王道の良問」を生成してください。

以下の条件で、必ず5問生成してください。
フォーマットは必ず以下のJSON形式にしてください。それ以外のテキストは一切含めないでください。

[
  {
    "id": 1,
    "question": "問題文をマークダウン（数式はLaTeXの$や$$を使用）で記述",
    "hint": "問題を解くためのヒント",
    "answer": "解答と詳しい解説を記述（間違えやすいポイントも添えること）"
  },
  ...
]`;

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

        const result = await model.generateContent(`「${subject}」の問題を5問作成してください。難易度は${targetSchools}の入試基礎〜標準レベルです。`);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Drill model ${modelName} failed.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error("All Gemini models failed for Drill generation.");
    }
    
    return NextResponse.json(JSON.parse(text));
  } catch (error: any) {
    console.error('Drill API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate drill questions.' },
      { status: 500 }
    );
  }
}
