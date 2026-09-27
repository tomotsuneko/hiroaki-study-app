import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { updateSyllabus } from '@/lib/db';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { getActiveModels } from '@/lib/model-manager';

export const maxDuration = 60; // Increase Vercel timeout to 60 seconds

export async function POST(req: Request) {
  try {
    const { profile } = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get('study_user_id')?.value || 'anonymous';

    let personalizedData: any = null;
    let masterCurriculum: any[] = [];

    if (dbAdmin) {
      // Fetch Master Syllabus (from all subjects)
      const curriculumSnapshot = await dbAdmin.collection('curriculum_db').get();
      curriculumSnapshot.forEach((doc: any) => {
        masterCurriculum.push(doc.data());
      });

      // Fetch personalized curriculum from user doc
      if (userId !== 'anonymous') {
        const userDoc = await dbAdmin.collection('users').doc(userId).get();
        if (userDoc.exists) {
           personalizedData = userDoc.data()?.db?.personalizedCurriculum || null;
        }
      }
    }

    const userName = profile?.name || '生徒';
    const targetSchools = profile?.targetSchools?.length > 0 ? profile.targetSchools.join('、') : '目標未設定';
    const weakSubjects = profile?.weakSubjects?.length > 0 ? profile.weakSubjects.join('、') : '特になし';
    const schoolTypeStr = profile?.schoolType === 'junior_high' ? '中学' : '高校';
    const gradeStr = profile?.grade ? `${profile.grade}年生` : '';
    const trackStr = profile?.track === 'arts' ? '（文系）' : profile?.track === 'science' ? '（理系）' : '';
    const selectedSubjectsStr = profile?.selectedSubjects?.length > 0 ? profile.selectedSubjects.join('、') : '全般';

    const systemInstruction = `あなたは超一流の予備校の教務責任者（カリキュラム・ディレクター）です。
生徒名：「${userName}」、${schoolTypeStr}${gradeStr}${trackStr}
第一志望・目標校：「${targetSchools}」
苦手科目：「${weakSubjects}」
学習希望科目：「${selectedSubjectsStr}」

【マスターシラバスDB (参考)】
${JSON.stringify(masterCurriculum.slice(0, 3))} // (※主要なデータのみ抜粋)

【個人最適化データ (最優先)】
${personalizedData ? JSON.stringify(personalizedData) : '（※自動最適化データなし。プロフィールに基づき構築してください）'}

上記の「マスターシラバスDB」の標準的なカリキュラムと、この生徒専用の「個人最適化データ（教材・進度・差分戦略）」を統合し、目標校に確実に合格するための最も合理的で最適な「個人専用学習シラバス（学習計画）」を構築してください。
不要な科目（学習希望科目にないもの）は一切含めず、必要な科目にリソースを集中させてください。

以下の条件を満たすJSONフォーマットで出力してください。

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
  }
]`;

    const modelsToTry = await getActiveModels('syllabus');

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
      }
    }

    if (!success) {
      throw new Error("All Gemini models failed for Syllabus generation.");
    }
    
    const syllabusData = JSON.parse(text);
    
    // DBに保存
    await updateSyllabus(syllabusData);

    return NextResponse.json(syllabusData);
  } catch (error: any) {
    console.error('Syllabus Generate API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate syllabus.' },
      { status: 500 }
    );
  }
}
