import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { readDB, updateDailyAnalysis, saveFlashcards, getUserId } from '@/lib/db';
import { dbAdmin } from '@/lib/firebase-admin';
import { genAI } from '@/lib/gemini';

export const maxDuration = 60; // Increase Vercel timeout for heavy LLM operations

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = await getUserId();
    const db = await readDB(userId);
    const profile = body.profile || db.profile || {};

    // 1. ユーザーの公式テスト履歴（test_results）を取得して弱点・得意単元を抽出
    let testResults: any[] = [];
    if (dbAdmin) {
      try {
        const snap = await dbAdmin
          .collection('users')
          .doc(userId)
          .collection('test_results')
          .orderBy('updatedAt', 'desc')
          .limit(30)
          .get();
        testResults = snap.docs.map((d) => d.data());
      } catch (e) {
        console.warn('Failed to fetch test_results in daily cron:', e);
      }
    }

    const recentLogs = (db.logs || []).slice(-40);
    const feedbackQueue = db.feedbackQueue || [];
    const masteredUnits = db.masteredUnits || [];
    const studyTime = db.studyTime || {};

    // 直近の学習時間と連続学習日数の集計
    const sortedDates = Object.keys(studyTime)
      .filter((d) => (studyTime[d] || 0) > 0)
      .sort()
      .reverse();
    const totalMinutesRecent = sortedDates
      .slice(0, 7)
      .reduce((acc, d) => acc + (studyTime[d] || 0), 0);

    // シラバスから現在の未完了優先タスクを抽出
    const nextSyllabusTasks: string[] = [];
    if (Array.isArray(db.syllabus)) {
      const completedSet = new Set([
        ...(profile?.completedTasks || []),
        ...masteredUnits,
      ]);
      for (const phase of db.syllabus) {
        for (const cat of phase.categories || []) {
          for (const t of cat.tasks || []) {
            if (!completedSet.has(t.title) && t.type !== 'diagnostic') {
              nextSyllabusTasks.push(`${cat.name}: ${t.title}`);
              if (nextSyllabusTasks.length >= 5) break;
            }
          }
          if (nextSyllabusTasks.length >= 5) break;
        }
        if (nextSyllabusTasks.length >= 5) break;
      }
    }

    const targetSchoolsStr = profile?.targetSchools?.join('、') || '目標校';
    const weakSubjectsStr = profile?.weakSubjects?.join('、') || '数学・英語';

    const systemInstruction = `あなたは進路指導・学習プランニングのプロフェッショナルAIです。
生徒の目標校（${targetSchoolsStr}）、苦手科目（${weakSubjectsStr}）、および蓄積された学習データ（公式テスト結果、AIドリル正答率、弱点補強キュー、シラバス未完了タスク、学習時間）を総合的に分析し、以下のJSON形式で「本日の日次分析レポート＋事前生成コンテンツ（デイリーAIドリル・デイリー暗記カード）」を返してください。
※数式を含める場合は $x^2$ のようにLaTeX形式で記述してください。

{
  "achievements": [
    { "school": "目標校1", "level": 40 },
    { "school": "目標校2", "level": 55 }
  ],
  "recommendedSubjects": ["最優先科目1", "重点科目2"],
  "aiComment": "ダッシュボードのトップに表示される、本日のコンパクトなアドバイスコメント（マークダウン可）。直近のテスト・ドリル実施状況や学習時間への具体的なフィードバックと、今日取り組むべき単元への励ましを120〜180文字程度で温かくまとめてください。",
  "miniLesson": {
    "title": "今日のミニレッスン（弱点単元の基礎整理）",
    "content": "弱点補強キューまたはシラバス進行中単元に関する基礎・根本概念を丁寧に解説（Markdown・数式可）。",
    "question": "レッスン内容を踏まえた確認テスト1問",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "correctAnswerIndex": 0,
    "explanation": "正解の詳しい解説"
  },
  "learningContents": [
    {
      "taskTitle": "今日の重点学習テーマ（単元名）",
      "textMarkdown": "今日学ぶべき単元の重要定義・公式・典型例題の詳しい解説テキスト（マークダウン・数式可）。",
      "videoQueries": ["関連するYouTube検索キーワード1", "関連キーワード2"],
      "checkTest": [
        {
          "question": "確認テストの問題文",
          "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
          "correctIndex": 0,
          "explanation": "解説"
        }
      ]
    }
  ],
  "dailyDrill": [
    {
      "id": 1,
      "level": "基礎〜標準",
      "unit": "単元名",
      "question": "本日のデイリー演習問題（全3〜5問作成）",
      "hint": "考え方のヒント",
      "answer": "模範解答と解説",
      "keyPoint": "この問題の重要公式・急所"
    }
  ],
  "dailyFlashcards": [
    {
      "subject": "科目名",
      "topic": "単元名",
      "front": "暗記カード表面（重要定義・公式・頻出問、全5枚作成）",
      "back": "暗記カード裏面（解答・公式・ポイント解説）"
    }
  ]
}`;

    const analysisContextPayload = {
      targetSchools: profile?.targetSchools,
      weakSubjects: profile?.weakSubjects,
      deviationScore: profile?.deviationScore,
      totalStudyMinutesLast7Days: totalMinutesRecent,
      priorityWeakUnits: feedbackQueue.slice(0, 8),
      recentlyMasteredUnits: masteredUnits.slice(-10),
      nextSyllabusTasks,
      recentOfficialTestResults: testResults.slice(0, 10).map((r) => ({
        title: r.contentTitle || r.title,
        level: r.level,
        answered: r.answeredCount,
        correct: r.correctCount,
        scorePercent: r.scorePercent,
      })),
      recentLogs: recentLogs.slice(-15),
    };

    const prompt = JSON.stringify(analysisContextPayload);
    const modelsToTry = await getActiveModels('syllabus');

    let text = '';
    let success = false;
    let lastErrorMsg = 'No models attempted';

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 8192,
          },
        });

        const result = await model.generateContent(prompt);
        text = (await result.response).text();
        success = true;
      } catch (err: any) {
        lastErrorMsg = err.message;
        console.warn(`Cron model ${modelName} failed:`, err.message);
      }
    }

    let analysisData: any = null;
    if (success) {
      try {
        const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        analysisData = JSON.parse(cleanText);
      } catch (e: any) {
        lastErrorMsg = 'JSON Parse Error: ' + e.message;
        console.warn('Failed to parse Gemini output as JSON. Using fallback.');
        success = false;
      }
    }

    const focusTopic =
      feedbackQueue[0]?.topic ||
      nextSyllabusTasks[0] ||
      profile?.weakSubjects?.[0] ||
      '二次関数・三角比の基礎';
    const focusSubject =
      feedbackQueue[0]?.subject || profile?.weakSubjects?.[0] || '数学';

    if (!success || !analysisData) {
      analysisData = {
        achievements: (profile?.targetSchools || ['第一志望校']).map(
          (s: string, i: number) => ({
            school: s,
            level: Math.min(85, Math.max(20, 30 + masteredUnits.length * 2 - i * 5)),
          })
        ),
        recommendedSubjects:
          profile?.weakSubjects?.length > 0 ? profile.weakSubjects : ['数学', '英語'],
        aiComment: `直近の学習履歴（習得単元: ${masteredUnits.length}件 / 重点復習対象: ${feedbackQueue.length}件）に基づき、本日の重点テーマ「${focusTopic}」を編成しました！今日も一歩ずつ着実に積み重ねましょう🔥`,
        miniLesson: {
          title: `本日の重点ポイント整理：${focusTopic}`,
          content: `「${focusTopic}」を確実に得点源にするには、まず基本定義と公式の成り立ちを自分の言葉で説明できるようにすることが最重要です。公式テキストの例題を確認してから演習に入りましょう！`,
          question: '学習した単元を長期記憶に定着させるために最も効果的なタイミングは？',
          options: [
            '学習直後と翌日にアウトプット演習を行う',
            '1ヶ月後にまとめて読み返す',
            '答えだけを見て暗記する',
            '難しい応用問題だけを解く',
          ],
          correctAnswerIndex: 0,
          explanation:
            '忘却曲線に基づき、学習直後のアウトプットと翌日の復習を組み合わせることで定着率が飛躍的に高まります。',
        },
        learningContents: [
          {
            taskTitle: focusTopic,
            textMarkdown: `### 🎯 本日の重点テーマ：${focusTopic}\n\n直近の学習履歴・シラバス進捗から選出された最優先テーマです。\n\n1. **基本定義・公式の確認**：まずは『学習コンテンツ（図書館）』で公式テキストを開き、定義と基本例題の流れを確認しましょう。\n2. **段階別アウトプット**：基礎（L1）→標準（L2）の順にテスト・AIドリルで80%以上の正答率を目指しましょう。`,
            videoQueries: [`${focusSubject} ${focusTopic} 基礎`, `${focusTopic} わかりやすい`],
            checkTest: [],
          },
        ],
        dailyDrill: [
          {
            id: 1,
            level: '基礎',
            unit: focusTopic,
            question: `【本日の重点チェック】「${focusTopic}」において最も重要となる基本公式または原則を1つ挙げ、その使い方を簡潔に説明してください。`,
            hint: '公式テキストの冒頭にある定義・定理を思い出してみましょう。',
            answer:
              '基本定義・公式の条件（何が成り立つときに使えるか）と結論をセットで整理できていれば正解です。',
            keyPoint: '公式は丸暗記ではなく「使える条件」とセットで押さえるのが鉄則です。',
          },
        ],
        dailyFlashcards: [
          {
            subject: focusSubject,
            topic: focusTopic,
            front: `【重点チェック】${focusTopic} の最重要ポイント・基本原則とは？`,
            back: `定義と公式の適用条件を正確に押さえ、基本例題を自力で再現できるようにすること。`,
          },
        ],
      };
    }

    // 事前生成された暗記カードがあれば、ユーザーのflashcardsにも自動保存して即座に使えるようにする
    const nowStr = new Date().toISOString().split('T')[0];
    let formattedDailyCards: any[] = [];
    if (Array.isArray(analysisData.dailyFlashcards) && analysisData.dailyFlashcards.length > 0) {
      formattedDailyCards = analysisData.dailyFlashcards.map((c: any, idx: number) => ({
        id: `daily_${nowStr}_${idx}`,
        subject: c.subject || focusSubject,
        topic: c.topic || focusTopic,
        front: c.front,
        back: c.back,
        level: 0,
        interval: 1,
        nextReviewDate: nowStr,
        nextReview: Date.now(),
      }));
      await saveFlashcards(formattedDailyCards);
    }

    const updatedAnalysis = {
      lastRunDate: new Date().toISOString(),
      achievementLevel: analysisData.achievements?.[0]?.level || 35,
      achievements: analysisData.achievements,
      recommendedSubjects: analysisData.recommendedSubjects,
      aiComment: analysisData.aiComment,
      miniLesson: analysisData.miniLesson,
      learningContents: analysisData.learningContents,
      dailyDrill: analysisData.dailyDrill || [],
      dailyFlashcards: formattedDailyCards,
      feedbackSummary: {
        weakUnitsCount: feedbackQueue.length,
        masteredUnitsCount: masteredUnits.length,
        streakDays: sortedDates.length,
      },
    };

    await updateDailyAnalysis(updatedAnalysis);

    return NextResponse.json(updatedAnalysis);
  } catch (error) {
    console.error('Cron Daily API Error:', error);
    return NextResponse.json({ error: 'Failed to run daily cron' }, { status: 500 });
  }
}
