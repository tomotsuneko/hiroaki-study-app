import { NextResponse } from 'next/server';
import { getLogs, updateDailyAnalysis } from '@/lib/db';
import { genAI } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const { profile } = await req.json();
    const logs = getLogs();

    // 過去24時間のログのみ抽出（デモ用なので全ログでも可ですが一応）
    const recentLogs = logs.slice(-50); // 簡略化のため最新50件

const systemInstruction = `あなたは進路指導・学習プランニングのプロフェッショナルAIです。
生徒の目標校（${profile?.targetSchools?.join('、') || '未設定'}）と、最近の学習ログ（ドリル正答率、チャット質問、模試結果）を総合的に分析し、以下のJSON形式で本日の分析レポートを返してください。

{
  "achievements": [
    { "school": "目標校1", "level": 35 },
    { "school": "目標校2", "level": 50 },
    { "school": "目標校3", "level": 70 }
  ],
  "recommendedSubjects": ["数学II", "物理基礎"],
  "aiComment": "ダッシュボードのトップに表示される、本日の詳細な分析レポートと総括（マークダウン可）。\\n過去のログから見えた『具体的な成長ポイント』と『現在のボトルネック（弱点）』を鋭く指摘し、今日なぜその科目をやるべきなのか、論理的かつ熱く語りかけてください。文字数は400字程度で読みやすく構築してください。",
  "miniLesson": {
    "title": "今日のミニレッスン (中学の復習含む)",
    "content": "今日の推奨科目に関連する、高校2年生でもつまずきやすい「中学レベルの基礎・根本概念」を丁寧に、かつ恥ずかしくならないように前向きなトーンで解説してください。Markdown（数式可）で分かりやすく記述。",
    "question": "レッスン内容を踏まえた確認テストを1問出題してください。Markdown可",
    "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "correctAnswerIndex": 0,
    "explanation": "正解の詳しい解説"
  },
  "learningContents": [
    {
      "taskTitle": "今日の重点学習テーマ（短く）",
      "textMarkdown": "Web上の信頼性の高いコンテンツや参考書の内容をベースにした、今日学ぶべき具体的な解説テキスト（マークダウンで詳細に記述）。",
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
  ]
}`;

    const prompt = JSON.stringify(recentLogs);

    const modelsToTry = [
      "gemini-3.7-flash", "gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-flash-latest", "gemini-1.5-flash"
    ];

    let text = "";
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: systemInstruction,
          // @ts-ignore
          tools: [{ googleSearch: {} }],
          generationConfig: { 
            responseMimeType: "application/json",
            maxOutputTokens: 8192
          }
        });

        const result = await model.generateContent(prompt);
        text = (await result.response).text();
        success = true;
      } catch (err) {
        console.warn(`Cron model ${modelName} failed.`);
      }
    }

    let analysisData;
    if (success) {
      try {
        analysisData = JSON.parse(text);
      } catch(e) {
        console.warn("Failed to parse Gemini output as JSON. Using fallback.");
        success = false;
      }
    }

    if (!success || !analysisData) {
      // フォールバック用のダミーデータ
      const dummyData = {
        achievements: (profile?.targetSchools || ["目標校1"]).map((s: string, i: number) => ({ school: s, level: 25 - (i*5) })),
        recommendedSubjects: profile?.weakSubjects || ["英語"],
        aiComment: "現在AIサーバーが混み合っているため、過去のデータに基づく基本推奨プランを表示しています！焦らず基礎固めを続けましょう🔥",
        miniLesson: {
          title: "中学英語の復習：be動詞と一般動詞",
          content: "高校英語の長文読解でつまずく原因の多くは、実は中学1年生で習う「be動詞と一般動詞の区別」にあります。ここを完璧にするだけで、英文の構造がスッキリ見えてきますよ！",
          question: "次のうち、正しい英文はどれですか？",
          options: ["I am play tennis.", "I play tennis.", "I is playing tennis.", "I plays tennis."],
          correctAnswerIndex: 1,
          explanation: "主語が I のとき、現在の動作を表す一般動詞には何もつけません。be動詞と一般動詞は基本的に同時に使いません（進行形を除く）。"
        },
        learningContents: [{
          taskTitle: "英文法：五文型の基礎",
          textMarkdown: "五文型の基礎をマスターすることは、長文読解の土台となります。SVO, SVCなどの構造を理解しましょう。\n\n**1. SVCの構造**\nS = C の関係が成り立ちます。\n\n**2. SVOの構造**\nS ≠ O の関係です。",
          videoQueries: ["英語 五文型 基礎", "英語 SVOC"],
          checkTest: [{
            question: "SVC文型のC（補語）になれる品詞は？",
            options: ["名詞・形容詞", "動詞", "副詞", "前置詞"],
            correctIndex: 0,
            explanation: "補語になれるのは名詞か形容詞です。"
          }]
        }]
      };
      updateDailyAnalysis({
        lastRunDate: new Date().toISOString(),
        ...dummyData
      } as any);
      return NextResponse.json(dummyData);
    }
    
    updateDailyAnalysis({
      lastRunDate: new Date().toISOString(),
      achievementLevel: 0, // legacy
      achievements: analysisData.achievements,
      recommendedSubjects: analysisData.recommendedSubjects,
      aiComment: analysisData.aiComment,
      miniLesson: analysisData.miniLesson,
      learningContents: analysisData.learningContents
    } as any);

    return NextResponse.json(analysisData);
  } catch (error) {
    console.error('Cron Daily API Error:', error);
    return NextResponse.json({ error: 'Failed to run daily cron' }, { status: 500 });
  }
}
