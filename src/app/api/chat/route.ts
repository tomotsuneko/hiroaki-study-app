import { getActiveModels } from '@/lib/model-manager';
import { NextResponse } from 'next/server';
import { genAI } from '@/lib/gemini';
import { getChatSession, saveChatSession, addLog, readDB, ChatSession } from '@/lib/db';

function getTodayJST(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');
}

export async function POST(req: Request) {
  try {
    const { history, message, profile, sessionId } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    let validHistory = history || [];
    while (validHistory.length > 0 && validHistory[0].role === 'model') {
      validHistory.shift();
    }

    // ユーザーの蓄積された学習データ（弱点キュー・習得単元・直近の学習ログ）を取得しAIチューターへフィードバック注入
    const userDb = await readDB();
    const effectiveProfile = profile || userDb.profile || {};
    const userName = effectiveProfile?.name || '生徒';
    const targetSchools =
      effectiveProfile?.targetSchools?.length > 0
        ? effectiveProfile.targetSchools.join('、')
        : '日東駒専レベルの理系学部';
    const weakSubjects =
      effectiveProfile?.weakSubjects?.length > 0
        ? effectiveProfile.weakSubjects.join('、')
        : '特になし';
    const tutorPersona = effectiveProfile?.tutorPersona || '優しいお姉さん';
    const currentMood = effectiveProfile?.currentMood || '普通';

    const recentWeakItems = (userDb.feedbackQueue || [])
      .slice(0, 5)
      .map((f) => `${f.subject}: ${f.topic}${f.scorePercent !== undefined ? ` (正答率${f.scorePercent}%)` : ''}`)
      .join('、');
    const recentMastered = (userDb.masteredUnits || []).slice(-8).join('、');
    const recentActivityLogs = (userDb.logs || [])
      .slice(-6)
      .map((l) => l.data?.message || `${l.type}`)
      .filter(Boolean)
      .join(' / ');

    const systemInstruction = `あなたは千葉県立我孫子高校の生徒「${userName}」さんを指導する専属AIチューターです。
目標校：「${targetSchools}」 / 苦手科目：「${weakSubjects}」 / 今日の生徒の気分：「${currentMood}」

【生徒の最新の学習カルテ（テスト・ドリル・学習履歴からの自動フィードバック）】
- 直近で正答率が低く重点補強が必要な単元：${recentWeakItems || '現在特になし'}
- 直近で習得認定（正答率80%以上・読了）した単元：${recentMastered || 'まだ記録なし'}
- 直近の学習アクティビティ履歴：${recentActivityLogs || 'まだ記録なし'}
※生徒から勉強方針や質問された際は、上記の学習カルテ（特に最近つまずいた単元や頑張っている履歴）を自然に踏まえて、具体的でパーソナライズされた指導を行ってください。

【チューターの人格設定】
あなたのキャラクターは「${tutorPersona}」です。
- 熱血コーチの場合：松岡修造のように熱く、スポ根的な言葉で強烈に励ます。
- 優しいお姉さんの場合：包容力があり、優しく寄り添いながら、丁寧に導く。
- 論理的メンターの場合：感情論を排し、データと事実に基づいてクールに最短ルートを提示する。
必ずこの人格になりきって対話してください。また、生徒の「今日の気分」に合わせてアプローチを変えてください（疲れている時は労う、絶好調な時は難問をぶつけるなど）。

【ハルシネーション（嘘の出力）対策の厳守事項】
- 教育用AIとして、絶対に不正確な知識や間違った数式、存在しない歴史的事実を教えないでください。
- もし知識に自信がない場合や、複雑すぎる計算問題の場合は、「推測」で答えず、「教科書の〇〇の範囲を一緒に確認しよう」「学校の先生にも念のため聞いてみてね」と正直にアシストに徹してください。
- フォーマットは必ず見出し（###）や太字（**）を使った綺麗なMarkdownで出力し、数学の式がある場合はLaTeX記法（$$ または $）を使用してください。`;

    const modelsToTry = await getActiveModels('chat');

    let text = '';
    let success = false;

    for (const modelName of modelsToTry) {
      if (success) break;

      try {
        const personalizedModel = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
        });

        const chat = personalizedModel.startChat({
          history: validHistory,
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        text = response.text();
        success = true;
      } catch (err: any) {
        console.warn(`Model ${modelName} failed. Reason: ${err.message}`);
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    if (!success) {
      console.warn('All Gemini models failed. Using static fallback.');
      text =
        '申し訳ありません、現在AIサーバーが非常に混み合っており、一時的にお返事することができません。💦\n\n少し時間をおいてから再度お試しいただくか、別の科目についての学習ノートを見返して復習を進めましょう！君ならできる！🔥';
    }

    // セッションの永続化
    const nowIso = new Date().toISOString();
    const today = getTodayJST();
    let currentSession: ChatSession | null = null;

    if (sessionId) {
      currentSession = await getChatSession(sessionId);
    }

    if (!currentSession) {
      const cleanTitle = message.trim().replace(/\n/g, ' ').substring(0, 24);
      const title = cleanTitle.length >= 24 ? `${cleanTitle}...` : cleanTitle || '新しいチャット';
      currentSession = {
        id: sessionId || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        title,
        date: today,
        createdAt: nowIso,
        updatedAt: nowIso,
        messages: [
          {
            role: 'model',
            content:
              'こんにちは！今日はどの科目を勉強しますか？基礎からゆっくりやっていきましょう。分からないところがあれば、いつでも聞いてくださいね！🔥',
            timestamp: nowIso,
          },
        ],
      };
    } else if (currentSession.title === '新しいチャット') {
      const cleanTitle = message.trim().replace(/\n/g, ' ').substring(0, 24);
      currentSession.title = cleanTitle.length >= 24 ? `${cleanTitle}...` : cleanTitle;
    }

    currentSession.messages.push(
      { role: 'user', content: message, timestamp: nowIso },
      { role: 'model', content: text, timestamp: nowIso }
    );
    currentSession.updatedAt = nowIso;

    // 確実にDB保存とログ記録を完了させる
    await Promise.all([
      saveChatSession(currentSession),
      addLog('chat', {
        sessionId: currentSession.id,
        title: currentSession.title,
        userMessage: message,
        aiResponse: text.slice(0, 300),
        message: `💬 AIチューターに「${currentSession.title}」について質問・相談しました`,
        timestamp: nowIso,
      }).catch((e) => console.error('addLog error:', e)),
    ]);

    return NextResponse.json({
      text,
      fallbackUsed: !success,
      session: currentSession,
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    if (error?.status === 503) {
      return NextResponse.json(
        { error: '現在AIサーバーが混み合っています。数秒待ってから再度お試しください。' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to generate AI response.' }, { status: 500 });
  }
}
