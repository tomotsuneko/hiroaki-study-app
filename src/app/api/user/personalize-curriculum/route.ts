import { NextResponse } from 'next/server';
import { aiModel } from '@/lib/gemini';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { schoolName, department, grade } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('study_user_id')?.value || 'anonymous';

    if (!schoolName) {
      return NextResponse.json({ error: 'School name is required' }, { status: 400 });
    }

    const prompt = `
    あなたは日本の高校教育・予備校カリキュラムの専門家です。
    生徒が所属する「${schoolName} ${department}（${grade}年生）」の公開情報や一般的な偏差値帯・地域特性に基づき、
    この学校で採用されている可能性が高いメイン教材（英語、数学、国語など）と、その学習進度（カリキュラム）を推測・調査してください。
    
    また、その学校の進度と「日東駒専・MARCHレベルの大学受験」に必要な標準カリキュラムを比較し、
    学校のカリキュラムだけでは不足する部分（差分）を独自体系で補うための「個人専用学習方針」を生成してください。

    必ず以下のJSONフォーマットで出力してください。マークダウンなどは含めないでください。
    {
      "estimatedTextbooks": ["数学: チャート式(黄)", "英語: ターゲット1900", "国語: 体系古典文法"],
      "schoolPacing": "学校のカリキュラム進行速度の特徴（例: 数学は2年冬に終わる等）",
      "gapFillStrategy": "受験に向けた差分（学校で足りない部分）をどう埋めるかの戦略",
      "personalizedFocus": "直近3ヶ月で優先して取り組むべき小分類タスク"
    }
    `;

    const result = await aiModel.generateContent(prompt);
    let jsonText = await result.response.text();
    jsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const curriculumPlan = JSON.parse(jsonText);

    // データベースに保存（ユーザー個人のプロフィールに紐付け）
    if (dbAdmin && userId !== 'anonymous') {
      await dbAdmin.collection('users').doc(userId).set({
        db: { personalizedCurriculum: curriculumPlan }
      }, { merge: true });
    }

    return NextResponse.json({ success: true, curriculumPlan });
  } catch (error: any) {
    console.error('Personalize Curriculum Error:', error);
    return NextResponse.json({ error: 'Failed to personalize curriculum: ' + error.message }, { status: 500 });
  }
}
