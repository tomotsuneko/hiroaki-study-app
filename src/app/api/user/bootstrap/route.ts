import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getServerCache, setServerCache } from '@/lib/server-cache';
import { readDB, getUserId } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === '1';
    const userId = await getUserId();

    // アカウントの有効期間・停止状態チェック
    if (dbAdmin && userId && userId !== 'default_user') {
      const userDoc = await dbAdmin.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const udata = userDoc.data() || {};
        if (udata.status === 'suspended') {
          return NextResponse.json({ error: 'このアカウントは一時停止されています', accountStatus: 'suspended' }, { status: 403 });
        }
        const { checkAccountPeriod } = await import('@/lib/auth-util');
        const period = checkAccountPeriod(udata.validFrom, udata.validUntil);
        if (!period.isValid) {
          return NextResponse.json({ error: 'アカウントの利用有効期間が終了しています', accountStatus: 'expired' }, { status: 403 });
        }
      }
    }

    // 1. Master Data (from in-memory server cache if available)
    let masterDb = !force ? getServerCache<any[]>('master_db') : null;
    let materials = !force ? getServerCache<any[]>('materials_list') : null;
    let tests = !force ? getServerCache<any[]>('tests_list') : null;

    // 2. Fetch any missing master data + user DB + user test_results in parallel
    const promises: Promise<any>[] = [];

    if (!masterDb && dbAdmin) {
      promises.push(
        dbAdmin
          .collection('curriculum_db')
          .get()
          .then((snap) => {
            const arr: any[] = [];
            snap.forEach((doc: any) => arr.push({ id: doc.id, ...doc.data() }));
            setServerCache('master_db', arr);
            masterDb = arr;
          })
      );
    }

    if (!materials && dbAdmin) {
      promises.push(
        dbAdmin
          .collection('learning_materials')
          .select('title', 'contentTitle', 'subject', 'importedAt', 'versions')
          .get()
          .then((snap) => {
            const arr = snap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                title: d.title,
                contentTitle: d.contentTitle || '',
                subject: d.subject || '未分類',
                importedAt: d.importedAt,
                versions: (d.versions || []).map((v: any) => ({ importedAt: v.importedAt })),
              };
            });
            setServerCache('materials_list', arr);
            materials = arr;
          })
      );
    }

    if (!tests && dbAdmin) {
      promises.push(
        dbAdmin
          .collection('test_materials')
          .select('title', 'contentTitle', 'subject', 'importedAt', 'versions')
          .get()
          .then((snap) => {
            const arr = snap.docs.map((doc) => {
              const d = doc.data();
              return {
                id: doc.id,
                title: d.title,
                contentTitle: d.contentTitle || '',
                subject: d.subject || '未分類',
                importedAt: d.importedAt,
                versions: (d.versions || []).map((v: any) => ({ importedAt: v.importedAt })),
              };
            });
            setServerCache('tests_list', arr);
            tests = arr;
          })
      );
    }

    let userDb: any = null;
    promises.push(
      readDB(userId).then((d) => {
        userDb = d;
      })
    );

    let testResults: any[] = [];
    if (dbAdmin) {
      promises.push(
        dbAdmin
          .collection('users')
          .doc(userId)
          .collection('test_results')
          .orderBy('updatedAt', 'desc')
          .get()
          .then((snap) => {
            testResults = snap.docs.map((d) => d.data());
          })
          .catch(() => {
            testResults = [];
          })
      );
    }

    await Promise.all(promises);

    let totalAnswered = 0;
    let totalCorrect = 0;
    let totalFirstCorrect = 0;
    let completedCount = 0;

    testResults.forEach((r) => {
      totalAnswered += r.answeredCount || 0;
      totalCorrect += r.correctCount || 0;
      totalFirstCorrect += r.firstCorrectCount || 0;
      if (r.isCompleted) completedCount++;
    });

    const overallAccuracy =
      totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

    return NextResponse.json({
      success: true,
      userId,
      masterDb: masterDb || [],
      materials: materials || [],
      tests: tests || [],
      testSummary: {
        totalTestsTaken: testResults.length,
        completedTestsCount: completedCount,
        totalAnswered,
        totalCorrect,
        totalFirstCorrect,
        overallAccuracy,
        results: testResults,
      },
      daily: {
        profile: userDb?.profile || null,
        dailyAnalysis: userDb?.dailyAnalysis || null,
        recentLogs: (userDb?.logs || []).slice(-25),
        studyTime: userDb?.studyTime || {},
        syllabus: userDb?.syllabus || null,
        syllabusUpdatedAt: userDb?.syllabusUpdatedAt || null,
        syllabusRebalanceAlert: userDb?.syllabusRebalanceAlert || null,
        dayPlans: userDb?.dayPlans || {},
        materialViews: userDb?.materialViews || {},
        feedbackQueue: userDb?.feedbackQueue || [],
        masteredUnits: userDb?.masteredUnits || [],
        flashcards: userDb?.flashcards || [],
      },
    });
  } catch (error: any) {
    console.error('Bootstrap API error:', error);
    return NextResponse.json({ error: 'Failed to bootstrap user data' }, { status: 500 });
  }
}
