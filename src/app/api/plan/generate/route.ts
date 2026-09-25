import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { updateSyllabus } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const { profile } = await req.json();

    const userName = profile?.name || '生徒';
    const targetSchools = profile?.targetSchools?.length > 0 ? profile.targetSchools.join('、') : '日東駒専レベルの理系学部';
    const weakSubjects = profile?.weakSubjects?.length > 0 ? profile.weakSubjects.join('、') : '特になし';

    const systemInstruction = `あなたは超一流の予備校の教務責任者（カリキュラム・ディレクター）です。
生徒名：「${userName}」、高校2年生（理系）
第一志望・目標校：「${targetSchools}」
苦手科目：「${weakSubjects}」

この生徒が目標校に確実に合格するための、最も合理的で最適な「学習シラバス（学習計画）」を構築してください。
大手予備校（駿台、河合塾、東進など）の一般的なカリキュラム構成や市販の王道参考書ルートを幅広く分析・抽出し、以下の条件を満たすJSONフォーマットで出力してください。

【設計の条件】
1. 合格から逆算した「固定ルート（コア項目）」と、苦手科目を克服するための「弱点克服ルート」を明確に区別して生成すること。
2. Phase 1（基礎固め〜夏休み前）、Phase 2（標準問題演習・夏休み〜秋）、Phase 3（過去問・実践演習）の3フェーズ構成にすること。
3. 各タスクの id にはユニークな文字列（例: "eng_core_1" 等）を割り振ること。
4. 必ず以下のJSON構造のみを出力し、それ以外のテキスト（マークダウンのバッククォート等）は一切含めないでください。

[
  {
    "phase": "Phase 1",
    "title": "基礎固め",
    "period": "〜夏休み前",
    "categories": [
      {
        "name": "📘 英語基礎",
        "tasks": [
          { "id": "eng_core_1", "title": "英単語: ターゲット1900（1〜1500）の完璧化", "type": "core" },
          { "id": "eng_weak_1", "title": "中学レベルの英文法のおさらい", "type": "weakness" }
        ]
      }
    ]
  },
  ...
]`;

    const modelsToTry = [
      "gemini-3.1-pro-preview", // Syllabus generation requires complex planning, so prioritize Pro
      "gemini-3.7-flash",
      "gemini-3.8-flash",
      "gemini-flash-latest",
      "gemini-1.5-flash"
    ];

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

        const result = await model.generateContent(`「${targetSchools}」合格に向けた、「${weakSubjects}」の弱点克服を含む最適な年間学習シラバスを構築してください。`);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Syllabus model ${modelName} failed.`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!success) {
      throw new Error("All Gemini models failed for Syllabus generation.");
    }
    
    const syllabusData = JSON.parse(text);
    
    // DBに保存
    updateSyllabus(syllabusData);

    return NextResponse.json(syllabusData);
  } catch (error: any) {
    console.error('Syllabus Generate API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate syllabus.' },
      { status: 500 }
    );
  }
}
