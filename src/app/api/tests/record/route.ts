import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
import { extractBaseTitleCode } from '@/lib/content-slots';

async function getAuthUserId(req: Request): Promise<string> {
  const cookieStore = await cookies();
  const cookieUserId = cookieStore.get('study_user_id')?.value;
  if (cookieUserId) return cookieUserId;

  // Authorization ヘッダーや URL クエリパラメータのフォールバック
  const url = new URL(req.url);
  const qUserId = url.searchParams.get('userId');
  if (qUserId) return qUserId;

  return 'anonymous';
}

export async function GET(req: Request) {
  try {
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const userId = await getAuthUserId(req);
    const url = new URL(req.url);
    const testId = url.searchParams.get('testId');

    const userRef = dbAdmin.collection('users').doc(userId);

    if (testId) {
      // 特定のテストの保存済みデータを取得
      const doc = await userRef.collection('test_results').doc(testId).get();
      if (!doc.exists) {
        return NextResponse.json({ success: true, record: null });
      }
      return NextResponse.json({ success: true, record: doc.data() });
    }

    // ユーザーの全テスト実績一覧を取得
    const snapshot = await userRef.collection('test_results').orderBy('updatedAt', 'desc').get();
    const results = snapshot.docs.map(d => d.data());

    // 単元ごとのサマリー集計
    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalFirstCorrect = 0;
    let completedCount = 0;

    results.forEach(r => {
      totalAnswered += (r.answeredCount || 0);
      totalCorrect += (r.correctCount || 0);
      totalFirstCorrect += (r.firstCorrectCount || 0);
      if (r.isCompleted) completedCount++;
    });

    return NextResponse.json({
      success: true,
      userId,
      totalTestsTaken: results.length,
      completedTestsCount: completedCount,
      totalAnswered,
      totalCorrect,
      totalFirstCorrect,
      overallAccuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
      results
    });

  } catch (error: any) {
    console.error('Get Test Record Error:', error);
    return NextResponse.json({ error: 'テスト記録の取得に失敗しました: ' + (error.message || String(error)) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const userId = await getAuthUserId(req);
    const body = await req.json();
    const { testId, key, payload, meta } = body;

    if (!testId || !payload) {
      return NextResponse.json({ error: 'testId and payload are required' }, { status: 400 });
    }

    const answers = payload.answers || {};
    const answerEntries = Object.entries(answers);

    let answeredCount = 0;
    let correctCount = 0;
    let firstCorrectCount = 0;

    answerEntries.forEach(([_, ans]: [string, any]) => {
      if (ans && ans.attempts > 0) {
        answeredCount++;
        if (ans.correct) correctCount++;
        if (ans.firstCorrect) firstCorrectCount++;
      }
    });

    const totalQuestions = meta?.totalQuestions || 30;
    const scorePercent = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const isCompleted = answeredCount >= totalQuestions;

    const baseCode = extractBaseTitleCode(testId);
    let level = 'L1_基礎';
    if (testId.includes('L2') || testId.includes('標準')) level = 'L2_標準';
    if (testId.includes('L3') || testId.includes('応用')) level = 'L3_応用';

    const testRecord = {
      testId,
      baseCode,
      level,
      subject: meta?.subject || 'high_school_数学',
      title: meta?.title || testId,
      contentTitle: meta?.contentTitle || '',
      key: key || '',
      answeredCount,
      correctCount,
      firstCorrectCount,
      totalQuestions,
      scorePercent,
      isCompleted,
      payload: {
        version: payload.version || 1,
        answers,
        updated: payload.updated || new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    };

    const userRef = dbAdmin.collection('users').doc(userId);
    const testResultRef = userRef.collection('test_results').doc(testId);

    // テスト実績を保存
    await testResultRef.set(testRecord, { merge: true });

    // ユーザーの db.logs にも学習実績（drillログ）として記録
    try {
      const userDoc = await userRef.get();
      const userData = userDoc.data() || {};
      const currentDb = userData.db || {};
      const logs = currentDb.logs || [];

      // 過去10分以内の同一テストのログがあれば上書き、なければ新規追加
      const now = Date.now();
      const tenMinutesAgo = now - 10 * 60 * 1000;
      const existingLogIdx = logs.findIndex(
        (l: any) => l.type === 'drill' && l.data?.testId === testId && new Date(l.timestamp).getTime() > tenMinutesAgo
      );

      const logEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'drill',
        data: {
          testId,
          title: meta?.title || testId,
          contentTitle: meta?.contentTitle || '',
          score: `${correctCount}/${answeredCount}`,
          scorePercent,
          firstCorrectCount,
          isCompleted,
          message: `【テスト演習】「${meta?.contentTitle || testId}」(${level}): ${answeredCount}問中${correctCount}問正解 (初回正解: ${firstCorrectCount})`
        }
      };

      if (existingLogIdx >= 0) {
        logs[existingLogIdx] = logEntry;
      } else {
        logs.push(logEntry);
      }

      // 次回学習へのフィードバック反映（正答率80%以上＆5問以上回答で習得認定、75%未満で重点復習キューへ追加）
      const masteredUnits: string[] = Array.isArray(currentDb.masteredUnits)
        ? [...currentDb.masteredUnits]
        : [];
      let feedbackQueue: any[] = Array.isArray(currentDb.feedbackQueue)
        ? [...currentDb.feedbackQueue]
        : [];
      const cleanTopic = (meta?.contentTitle || testId)
        .replace(/^L[123]\s*(基礎|標準|応用)?\s*[｜|]\s*/i, '')
        .replace(/\s*\(L[123].*?\)\s*$/i, '')
        .trim();
      const cleanSubj = (meta?.subject || '数学').replace(/^high_school_/, '');
      const accuracyOnAnswered =
        answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

      if (answeredCount >= 5 && accuracyOnAnswered >= 80) {
        if (baseCode && !masteredUnits.includes(baseCode)) masteredUnits.push(baseCode);
        if (cleanTopic && !masteredUnits.includes(cleanTopic)) masteredUnits.push(cleanTopic);
        if (currentDb.profile && cleanTopic) {
          currentDb.profile.completedTasks = Array.from(
            new Set([...(currentDb.profile.completedTasks || []), cleanTopic])
          );
        }
        feedbackQueue = feedbackQueue.filter(
          (item: any) => item.unitCode !== baseCode && item.topic !== cleanTopic
        );
      } else if (answeredCount >= 3 && accuracyOnAnswered < 75) {
        const existingFbIdx = feedbackQueue.findIndex(
          (item: any) =>
            (baseCode && item.unitCode === baseCode) ||
            (cleanTopic && item.topic === cleanTopic)
        );
        const fbItem = {
          id: `fb_${baseCode || testId}_${Date.now()}`,
          unitCode: baseCode || '',
          topic: cleanTopic || baseCode || testId,
          subject: cleanSubj,
          reason: 'low_accuracy',
          scorePercent: accuracyOnAnswered,
          source: 'official_test',
          updatedAt: new Date().toISOString(),
        };
        if (existingFbIdx >= 0) {
          feedbackQueue[existingFbIdx] = fbItem;
        } else {
          feedbackQueue.unshift(fbItem);
        }
        if (feedbackQueue.length > 20) feedbackQueue = feedbackQueue.slice(0, 20);
      }

      await userRef.set({
        db: {
          ...currentDb,
          logs: logs.slice(-300),
          masteredUnits,
          feedbackQueue,
        }
      }, { merge: true });

    } catch (logErr) {
      console.warn('Failed to append to user db.logs:', logErr);
    }

    return NextResponse.json({
      success: true,
      message: 'テスト実績を保存しました',
      record: testRecord
    });

  } catch (error: any) {
    console.error('Save Test Record Error:', error);
    return NextResponse.json({ error: 'テスト記録の保存に失敗しました: ' + (error.message || String(error)) }, { status: 500 });
  }
}
