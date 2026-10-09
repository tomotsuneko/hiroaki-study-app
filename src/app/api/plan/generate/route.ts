import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { updateSyllabus, SyllabusPhase } from '@/lib/db';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { getActiveModels } from '@/lib/model-manager';

export const maxDuration = 60; // Increase Vercel timeout to 60 seconds

export async function POST(req: Request) {
  try {
    const { profile, reason } = await req.json();
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
    const grade = profile?.grade || 2;
    const gradeStr = `${grade}年生`;
    const trackStr = profile?.track === 'arts' ? '（文系）' : profile?.track === 'science' ? '（理系）' : '';
    const selectedSubjectsList = profile?.selectedSubjects || [];
    const selectedSubjectsStr = selectedSubjectsList.length > 0 ? selectedSubjectsList.join('、') : '全般';
    const deviationScore = profile?.deviationScore;
    const isLevelClear = typeof deviationScore === 'number' && deviationScore > 0;
    const completedTasks = profile?.completedTasks || [];

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
    if (filteredCurriculum.length === 0) {
      filteredCurriculum = masterCurriculum.filter(subject => subject.level === userSchoolType);
    }

    // 学年に応じた逆算タイムラインの指針
    const reversePlanningGuidance = profile?.schoolType === 'junior_high'
      ? `【中学${gradeStr}の高校入試逆算方針】
- ${grade === 3 ? '中3入試直結期：夏までに中1〜中3基礎網羅、秋に公立・私立高校入試標準問題、冬〜直前に過去問演習' : '中1・中2基礎確立期：定期テスト80点以上と高校受験につながる内申点・基礎概念の完全定着'}`
      : `【高校${gradeStr}の大学入試逆算方針】
- ${grade === 1 
    ? '高1 基礎完成期：教科書・定期テストレベルの完全定着と、主要科目（英語・数学）の先取りと基礎固め。' 
    : grade === 2 
    ? '高2 基礎完成〜標準演習期：冬休み前までに受験基礎（共通テスト50〜60%レベル）を完全網羅し、目標校（${targetSchools}）に向けた標準演習の基盤を作る。' 
    : '高3 入試直結期：夏前までに全範囲の穴埋め総復習、夏〜秋に志望校レベル標準・記述演習、秋〜直前期に過去問・共通テスト実践演習。'}`;

    // レベル判定の指針
    const levelGuidance = isLevelClear
      ? `【生徒の現在地データ】
現在偏差値：約 ${deviationScore}。目標校（${targetSchools}）のボーダー偏差値とのギャップを分析し、ギャップを埋めるためのステップを構築してください。`
      : `【生徒の現在地データ（不透明・未診断）】
※生徒の正確な偏差値・客観的レベルが未診断です。
必ず Phase 1 の冒頭（各科目の最初）に、現在の実力判定を行う「【学力レベル診断】現在の基礎力チェックテスト」タスク（type: "diagnostic"）を差し込んでください。また、急激な難問から始めず、基礎基本から無理なく立ち上げられる安全なルートを構築してください。`;

    // 再編成（Rebalance）の指針
    const rebalanceGuidance = reason
      ? `【流動的自動組み換え（Rebalanceモード）】
発生要因：${reason}
すでに完了したタスク（${completedTasks.length > 0 ? completedTasks.slice(-10).join('、') : 'なし'}）は復習または習得済みとして扱い、
模試結果や志望校の変更を踏まえて、残りのタスクの優先度・弱点補強項目を再調整してください。
※重要：詰め込みすぎは厳禁です。生徒がパンクしないよう、各科目のタスク数は1フェーズあたり3〜5個前後の「無理のない現実的な分量」に厳選してください。`
      : '';

    const systemInstruction = `あなたは超一流の進学予備校の教務統括ディレクターです。
生徒情報：
・生徒名：「${userName}」、${schoolTypeStr}${gradeStr}${trackStr}
・第一志望・目標校：「${targetSchools}」
・苦手科目：「${weakSubjects}」
・学習希望科目：「${selectedSubjectsStr}」

${reversePlanningGuidance}
${levelGuidance}
${rebalanceGuidance}

【マスターカリキュラムDB (全量)】
${JSON.stringify(filteredCurriculum)}

【個人最適化データ】
${personalizedData ? JSON.stringify(personalizedData) : '（※自動最適化データなし。プロフィールに基づき構築してください）'}

【設計の絶対条件（厳守）】
1. 出力するタスクの title には、提供した【マスターカリキュラムDB】の中に存在する【小分類】（smallCategories内の文字列）を**一言一句違わずそのまま使用**してください。（※レベル診断タスクのみ例外として「【学力レベル診断】現在の基礎力チェックテスト」を使用して構いません）
2. AIが勝手にオリジナルの学習項目名称を作成することは固く禁じます。必ずマスターカリキュラムDBから抽出してください。
3. 合格から逆算した「固定ルート（コア項目: type="core"）」、苦手科目を克服するための「弱点克服ルート（type="weakness"）」、および「レベル診断タスク（type="diagnostic"）」を区別してください。
4. 各Phaseには「targetMilestone（例: "日東駒専レベル基礎突破"、"共通テスト70%水準完成"）」と「period（到達目安時期）」を付与してください。
5. 生徒の学年（${gradeStr}）と目標校（${targetSchools}）に合わせて、Phase 1、Phase 2、Phase 3 の3段階ロードマップを構築してください。
6. 各タスクの id にはユニークな文字列（例: "math_core_1", "eng_weak_2", "diag_eng_1" 等）を割り振ること。
7. 必ず以下のJSON構造のみを出力し、それ以外のテキスト（マークダウンのバッククォート等）は一切含めないこと。

[
  {
    "phase": "Phase 1",
    "title": "基礎完成期",
    "period": "〜夏休み前",
    "targetMilestone": "教科書レベル完全網羅・基礎典型問題の突破",
    "categories": [
      {
        "name": "📘 英語",
        "tasks": [
          { "id": "diag_eng_1", "title": "【学力レベル診断】現在の基礎力チェックテスト", "type": "diagnostic" },
          { "id": "eng_core_1", "title": "名詞と冠詞", "type": "core" },
          { "id": "eng_weak_1", "title": "過去形と過去進行形", "type": "weakness" }
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

        const promptMessage = reason
          ? `【再編成】理由「${reason}」に基づく、生徒「${userName}」の目標校「${targetSchools}」合格に向けた無理のない逆算学習シラバスを再構築してください。`
          : `生徒「${userName}」の目標校「${targetSchools}」合格に向けた、逆算型学習シラバスを構築してください。`;

        const result = await model.generateContent(promptMessage);
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
    
    const syllabusData: SyllabusPhase[] = JSON.parse(text);

    // 自動組み換え（リバランス）のアテンション情報
    const rebalanceAlert = reason ? {
      reason,
      message: reason === 'exam_result'
        ? '模試の成績分析結果を反映し、弱点分野の補強を組み込んだ無理のない学習計画に自動再編成しました。'
        : reason === 'target_change'
        ? '目標校の変更を検知したため、合格ラインから逆算した新しい学習ロードマップに自動再編成しました。'
        : 'プロフィールの更新に合わせて、現在の進度と目標に応じた学習計画を自動アップデートしました。',
      timestamp: new Date().toISOString()
    } : null;
    
    // DBに保存
    await updateSyllabus(syllabusData, rebalanceAlert);

    return NextResponse.json({
      syllabus: syllabusData,
      rebalanceAlert,
      needsLevelCheck: !isLevelClear
    });
  } catch (error: any) {
    console.error('Syllabus Generate API Error:', error);
    return NextResponse.json(
      { error: 'Failed to generate syllabus.' },
      { status: 500 }
    );
  }
}
