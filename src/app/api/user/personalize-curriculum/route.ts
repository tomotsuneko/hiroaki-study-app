import { NextResponse } from 'next/server';
import { aiModel } from '@/lib/gemini';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    const { schoolName, department, grade, schoolType, track, selectedSubjects } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('study_user_id')?.value || 'anonymous';

    if (!schoolName) {
      return NextResponse.json({ error: 'School name is required' }, { status: 400 });
    }

    const trackText = track === 'arts' ? '文系' : track === 'science' ? '理系' : '未定/推薦';
    const subjectsText = selectedSubjects && selectedSubjects.length > 0 ? selectedSubjects.join(', ') : '全般';

    const prompt = `
    あなたは日本の教育・予備校カリキュラムの専門家です。
    生徒のプロフィール：
    ・学校：${schoolName} ${department || ''}（${schoolType === 'high' ? '高校' : '中学'}${grade}年生）
    ・文理選択：${trackText}
    ・学習希望/受験科目：${subjectsText}

    この生徒の公開情報や一般的な偏差値帯・地域特性に基づき、
    採用されている可能性が高いメイン教材と、その学習進度（カリキュラム）を推測してください。
    また、「日東駒専・MARCHレベル」または「上位高校」に向けた標準カリキュラムと比較し、
    学習希望科目（${subjectsText}）において、学校の授業だけでは不足する部分を独自体系で補うための「個人専用学習方針」を生成してください。

    必ず以下のJSONフォーマットで出力してください。マークダウンなどは含めないでください。
    {
      "estimatedTextbooks": ["${selectedSubjects?.[0] || '数学'}: チャート式(黄)", "英語: ターゲット1900"],
      "schoolPacing": "学校のカリキュラム進行速度の特徴",
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
