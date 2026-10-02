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
    const selectedSubjectsList = profile?.selectedSubjects || [];
    const selectedSubjectsStr = selectedSubjectsList.length > 0 ? selectedSubjectsList.join('、') : '全般';

    // マスターDBを選択科目と学校区分でフィルタリング
    const userSchoolType = profile?.schoolType || 'high_school';
    let filteredCurriculum = masterCurriculum.filter(subject => subject.level === userSchoolType);
    
    if (selectedSubjectsList.length > 0) {
      filteredCurriculum = filteredCurriculum.filter(subject => 
        selectedSubjectsList.some((s: string) => 
          subject.subjectName?.includes(s) || 
          subject.id?.includes(s) ||
          s.includes(subject.subjectName)
        )
      );
    }
    // もしフィルタ結果が空なら学年の全量渡す
    if (filteredCurriculum.length === 0) {
      filteredCurriculum = masterCurriculum.filter(subject => subject.level === userSchoolType);
    }

    const systemInstruction = `あなたは超一流の予備校の教務責任者（カリキュラム・ディレクター）です。
生徒名：「${userName}」、${schoolTypeStr}${gradeStr}${trackStr}
第一志望・目標校：「${targetSchools}」
苦手科目：「${weakSubjects}」
学習希望科目：「${selectedSubjectsStr}」

【マスターカリキュラムDB (全量)】
${JSON.stringify(filteredCurriculum)}

【個人最適化データ (最優先)】
${personalizedData ? JSON.stringify(personalizedData) : '（※自動最適化データなし。プロフィールに基づき構築してください）'}

上記の「マスターカリキュラムDB」の標準的なカリキュラムと、この生徒専用の「個人最適化データ（教材・進度・差分戦略）」を統合し、目標校に確実に合格するための最も合理的で最適な「個人専用学習シラバス（学習計画）」を構築してください。
不要な科目（学習希望科目にないもの）は一切含めず、必要な科目にリソースを集中させてください。

以下の条件を満たすJSONフォーマットで出力してください。

【設計の絶対条件（厳守）】
1. 出力するタスク（tasks配列の各要素）には、提供した【マスターカリキュラムDB】の中に存在する【小分類】（smallCategories内のオブジェクト）を**一言一句違わずそのまま使用**してください。
2. AIが勝手にオリジナルの学習項目名称（DBに存在しないもの）を作成することは**固く禁じます**。必ずマスターカリキュラムDBから抽出してください。
3. 目標校のレベルや生徒の状況から判断し、不要な小項目はスキップ（除外）しても構いません。
4. 合格から逆算した「固定ルート（コア項目: type=\"core\"）」と、苦手科目を克服するための「弱点克服ルート（type=\"weakness\"）」を明確に区別して生成すること。
5. Phase 1（基礎固め〜夏休み前）、Phase 2（標準問題演習・夏休み〜秋）、Phase 3（過去問・実践演習）の3フェーズ構成にすること。
6. 各タスクの id には、マスターカリキュラムDBに指定されている元の id（例: "数Ⅰ-001"）を必ずそのまま設定してください。適当な文字列を割り当てないでください。
7. 必ず以下のJSON構造のみを出力し、それ以外のテキスト（マークダウンのバッククォート等）は一切含めないこと。

[
  {
    "phase": "Phase 1",
    "title": "基礎固め",
    "period": "〜夏休み前",
    "categories": [
      {
        "name": "📘 数学",
        "tasks": [
          { "id": "数Ⅰ-001", "title": "整式の整理と加法・減法 †", "type": "core" },
          { "id": "数Ⅰ-002", "title": "整式の乗法 †", "type": "weakness" }
        ]
      }
    ]
  }
]`;

    const modelsToTry = await getActiveModels('syllabus');

    let text = "";
    let success = false;
    let lastError = "Unknown error";

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: systemInstruction
        });

        const result = await model.generateContent(`「${targetSchools}」合格に向けた、「${weakSubjects}」の弱点克服を含む最適な年間学習シラバスを構築してください。`);
        const response = await result.response;
        text = response.text();
        text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        success = true;
      } catch (err: any) {
        lastError = err.message;
        console.warn(`Syllabus model ${modelName} failed.`, err.message);
      }
    }

    if (!success) {
      throw new Error(`All Gemini models failed for Syllabus generation. Last error: ${lastError}`);
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
