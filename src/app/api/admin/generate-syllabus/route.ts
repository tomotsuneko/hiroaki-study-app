import { NextResponse } from 'next/server';
import { aiModel } from '@/lib/gemini';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const targetSubject = body.subject || '英語'; // Default to English if not provided
    
    // 【工程1＆2: 情報収集・整理 (AI Double Check)】
    // 高度なプロンプトで予備校レベルの緻密なカリキュラムを抽出
    const prompt = `
    あなたは日本のトップ予備校のカリキュラム開発責任者です。
    大学受験（日東駒専・MARCHレベル）に向けた「${targetSubject}」の最新の学習要綱（シラバス）のデータベースを作成してください。
    文部科学省の学習指導要領をベースにしつつ、予備校の実践的な指導ステップに基づいて、
    【大分類】【中分類】【小分類】の階層構造で緻密に整理してください。
    小分類は、後日AIが「具体的な1回分の学習コンテンツ（解説＋ドリル）」を自動生成できる粒度にしてください。

    必ず以下のJSONフォーマットで出力してください。Markdownの装飾(\`\`\`json)などは一切含めず、純粋なJSON配列のみを出力してください。
    [
      {
        "subjectName": "${targetSubject}",
        "largeCategories": [
          {
            "name": "大分類名",
            "mediumCategories": [
              {
                "name": "中分類名",
                "smallCategories": [
                  "小分類1", "小分類2"
                ]
              }
            ]
          }
        ]
      }
    ]
    `;

    const result = await aiModel.generateContent(prompt);
    let jsonText = await result.response.text();
    
    // Clean up Markdown backticks if Gemini includes them
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsedData = JSON.parse(jsonText);

    // 【工程3: データベースへの保存・更新】
    // 取得した構造化データをFirestoreに一括保存 (curriculum_db コレクション)
    if (dbAdmin) {
      const batch = dbAdmin.batch();
      for (const subject of parsedData) {
        const docRef = dbAdmin.collection('curriculum_db').doc(subject.subjectName);
        batch.set(docRef, {
          updatedAt: new Date().toISOString(),
          ...subject
        });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true, result: parsedData });
  } catch (error: any) {
    console.error('Syllabus Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate syllabus: ' + error.message }, { status: 500 });
  }
}
