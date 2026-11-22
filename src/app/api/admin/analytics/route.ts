import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { requireAdminSession } from '@/lib/session';
import { checkAccountPeriod } from '@/lib/auth-util';

export const maxDuration = 60;

const SUBJECT_BUCKETS = ['数学', '英語', '国語', '理科', '社会', '情報・その他'] as const;
type SubjectBucket = (typeof SUBJECT_BUCKETS)[number];

function toJstDateString(input?: string | Date | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) {
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
      return input.slice(0, 10);
    }
    return '';
  }
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .replace(/\//g, '-');
}

function getLastNDaysJst(n: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    result.push(toJstDateString(dt));
  }
  return result;
}

function normalizeSubjectBucket(raw?: string): SubjectBucket {
  const s = (raw || '').trim();
  if (!s) return '情報・その他';
  if (/数学|数[ⅠⅡⅢＡＢＣ123ABC]/i.test(s)) return '数学';
  if (/英語|英[ⅠⅡⅢ123]|論理・表現|論[ⅠⅡⅢ]/i.test(s)) return '英語';
  if (/国語|現代文|古文|漢文|現国|言文|論国|文国|古探/i.test(s)) return '国語';
  if (/理科|物理|化学|生物|地学|物基|化基|生基|地基/i.test(s)) return '理科';
  if (/社会|歴史|地理|公民|日本史|世界史|公共|倫理|政経|歴総|日探|世探|地総|地探/i.test(s))
    return '社会';
  return '情報・その他';
}

function calcStreakDays(activeDatesSet: Set<string>, todayJst: string, yesterdayJst: string): number {
  if (activeDatesSet.size === 0) return 0;
  let cursorDateStr = activeDatesSet.has(todayJst)
    ? todayJst
    : activeDatesSet.has(yesterdayJst)
    ? yesterdayJst
    : '';
  if (!cursorDateStr) return 0;

  let streak = 0;
  let cursor = new Date(`${cursorDateStr}T12:00:00+09:00`);
  for (let i = 0; i < 365; i++) {
    const key = toJstDateString(cursor);
    if (!activeDatesSet.has(key)) break;
    streak++;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

export async function GET(req: Request) {
  try {
    const adminSession = await requireAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const url = new URL(req.url);
    const includeAdmins = url.searchParams.get('includeAdmins') === '1';

    const usersSnapshot = await dbAdmin.collection('users').get();

    // Fetch each user's test_results subcollection in parallel
    const testResultsPerUser = await Promise.all(
      usersSnapshot.docs.map(async (doc) => {
        try {
          const snap = await dbAdmin!
            .collection('users')
            .doc(doc.id)
            .collection('test_results')
            .get();
          return {
            userId: doc.id,
            results: snap.docs.map((d) => d.data()),
          };
        } catch {
          return { userId: doc.id, results: [] as any[] };
        }
      })
    );

    const testResultsMap = new Map<string, any[]>();
    for (const entry of testResultsPerUser) {
      testResultsMap.set(entry.userId, entry.results);
    }

    const last30Dates = getLastNDaysJst(30);
    const last14Dates = last30Dates.slice(-14);
    const last7Dates = last30Dates.slice(-7);
    const todayJst = last30Dates[last30Dates.length - 1];
    const yesterdayJst = last30Dates[last30Dates.length - 2];
    const set7 = new Set(last7Dates);
    const set30 = new Set(last30Dates);
    const set14 = new Set(last14Dates);

    const allUserAnalytics: any[] = [];

    usersSnapshot.forEach((doc) => {
      const data = doc.data() || {};
      const dbData = data.db || {};
      const profile = dbData.profile || {};
      const logs: any[] = Array.isArray(dbData.logs) ? dbData.logs : [];
      const studyTime: Record<string, number> = dbData.studyTime || {};
      const syllabus: any[] = Array.isArray(dbData.syllabus) ? dbData.syllabus : [];
      const materialViews: Record<string, any> = dbData.materialViews || {};
      const flashcards: any[] = Array.isArray(dbData.flashcards) ? dbData.flashcards : [];
      const feedbackQueue: any[] = Array.isArray(dbData.feedbackQueue) ? dbData.feedbackQueue : [];
      const masteredUnits: string[] = Array.isArray(dbData.masteredUnits)
        ? dbData.masteredUnits
        : [];
      const completedTasks: string[] = Array.isArray(profile.completedTasks)
        ? profile.completedTasks
        : [];
      const savedNotes: any[] = Array.isArray(profile.savedNotes) ? profile.savedNotes : [];
      const userTests = testResultsMap.get(doc.id) || [];

      const role: 'admin' | 'student' =
        data.role === 'admin' || doc.id === 'admin' ? 'admin' : 'student';

      let currentStatus = data.status || 'active';
      if (currentStatus === 'active' && data.validUntil) {
        const periodCheck = checkAccountPeriod(data.validFrom, data.validUntil);
        if (!periodCheck.isValid) {
          currentStatus = periodCheck.reason === 'expired' ? 'expired' : 'pending';
        }
      }

      // School / Grade / Track metadata
      const schoolType: 'junior_high' | 'high' =
        profile.schoolType === 'junior_high' ? 'junior_high' : 'high';
      const schoolTypeLabel = schoolType === 'junior_high' ? '中学' : '高校';
      const grade: number = [1, 2, 3].includes(Number(profile.grade)) ? Number(profile.grade) : 2;
      const gradeLabel = `${schoolType === 'junior_high' ? '中' : '高'}${grade}`;
      const track: 'arts' | 'science' | 'undecided' =
        profile.track === 'science'
          ? 'science'
          : profile.track === 'arts'
          ? 'arts'
          : 'undecided';
      const trackLabel =
        schoolType === 'junior_high'
          ? '-'
          : track === 'science'
          ? '理系'
          : track === 'arts'
          ? '文系'
          : '未選択';

      // Study time calculations
      let totalStudyMinutes = 0;
      let studyMinutes7d = 0;
      let studyMinutes30d = 0;
      const studyTimeByDate: Record<string, number> = {};
      const activeDatesSet = new Set<string>();

      for (const [dateKey, minsRaw] of Object.entries(studyTime)) {
        const mins = Number(minsRaw) || 0;
        if (mins <= 0) continue;
        totalStudyMinutes += mins;
        activeDatesSet.add(dateKey);
        if (set7.has(dateKey)) studyMinutes7d += mins;
        if (set30.has(dateKey)) {
          studyMinutes30d += mins;
          studyTimeByDate[dateKey] = (studyTimeByDate[dateKey] || 0) + mins;
        }
      }

      // Logs analysis & active date collection
      let aiChatCount = 0;
      let aiDrillCount = 0;
      let pomodoroCount = 0;
      let examCount = 0;
      const activityTimestamps: string[] = [];
      if (data.lastLoginAt) {
        activityTimestamps.push(data.lastLoginAt);
        const dStr = toJstDateString(data.lastLoginAt);
        if (dStr) activeDatesSet.add(dStr);
      }

      for (const l of logs) {
        if (l?.timestamp) {
          activityTimestamps.push(l.timestamp);
          const dStr = toJstDateString(l.timestamp);
          if (dStr) activeDatesSet.add(dStr);
        }
        if (l?.type === 'chat') aiChatCount++;
        else if (l?.type === 'drill') aiDrillCount++;
        else if (l?.type === 'pomodoro') pomodoroCount++;
        else if (l?.type === 'exam') examCount++;
      }

      // Material views
      const materialList = Object.values(materialViews)
        .filter((v: any) => v && typeof v === 'object')
        .map((v: any) => {
          if (v.lastViewedAt) {
            activityTimestamps.push(v.lastViewedAt);
            const dStr = toJstDateString(v.lastViewedAt);
            if (dStr) activeDatesSet.add(dStr);
          }
          return {
            unitCode: v.unitCode || '',
            title: v.title || v.unitCode || '教材',
            subject: v.subject || '',
            subjectBucket: normalizeSubjectBucket(v.subject || v.unitCode),
            viewCount: Number(v.viewCount) || 1,
            completed: Boolean(v.completed),
            lastViewedAt: v.lastViewedAt || '',
          };
        })
        .sort((a, b) => (b.lastViewedAt || '').localeCompare(a.lastViewedAt || ''));

      const textbooksViewedCount = materialList.length;
      const textbooksCompletedCount = materialList.filter((m) => m.completed).length;

      // Test results
      let testsCompletedCount = 0;
      let testQuestionsAnswered = 0;
      let testQuestionsCorrect = 0;
      let testFirstCorrectCount = 0;
      const formattedTests = userTests
        .map((t: any) => {
          if (t.updatedAt) {
            activityTimestamps.push(t.updatedAt);
            const dStr = toJstDateString(t.updatedAt);
            if (dStr) activeDatesSet.add(dStr);
          }
          const answered = Number(t.answeredCount) || 0;
          const correct = Number(t.correctCount) || 0;
          const firstCorrect = Number(t.firstCorrectCount) || 0;
          if (t.isCompleted) testsCompletedCount++;
          testQuestionsAnswered += answered;
          testQuestionsCorrect += correct;
          testFirstCorrectCount += firstCorrect;

          return {
            testId: t.testId || '',
            baseCode: t.baseCode || '',
            level: t.level || '',
            subject: t.subject || '',
            subjectBucket: normalizeSubjectBucket(t.subject || t.testId),
            title: t.contentTitle || t.title || t.testId || '公式テスト',
            answeredCount: answered,
            correctCount: correct,
            firstCorrectCount: firstCorrect,
            totalQuestions: Number(t.totalQuestions) || 0,
            scorePercent:
              answered > 0 ? Math.round((correct / answered) * 100) : Number(t.scorePercent) || 0,
            isCompleted: Boolean(t.isCompleted),
            updatedAt: t.updatedAt || '',
          };
        })
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

      const testAccuracy =
        testQuestionsAnswered > 0
          ? Math.round((testQuestionsCorrect / testQuestionsAnswered) * 100)
          : null;

      // Syllabus completion
      const completedSet = new Set<string>([
        ...completedTasks,
        ...masteredUnits,
        ...materialList.filter((m) => m.completed).map((m) => m.title),
      ]);
      let syllabusTotalTasks = 0;
      let syllabusCompletedTasks = 0;
      for (const ph of syllabus) {
        for (const cat of ph?.categories || []) {
          for (const t of cat?.tasks || []) {
            syllabusTotalTasks++;
            if (completedSet.has(t.title) || (t.id && completedSet.has(t.id))) {
              syllabusCompletedTasks++;
            }
          }
        }
      }
      const syllabusProgress =
        syllabusTotalTasks > 0 ? Math.round((syllabusCompletedTasks / syllabusTotalTasks) * 100) : 0;

      // Recency flags
      const validTimestamps = activityTimestamps.filter(Boolean).sort();
      const lastActiveAt =
        validTimestamps.length > 0 ? validTimestamps[validTimestamps.length - 1] : '';

      const isActiveToday = activeDatesSet.has(todayJst);
      let isActive7d = false;
      let isActive30d = false;
      for (const dKey of activeDatesSet) {
        if (set7.has(dKey)) isActive7d = true;
        if (set30.has(dKey)) isActive30d = true;
      }

      const streakDays = calcStreakDays(activeDatesSet, todayJst, yesterdayJst);
      const bookmarksCount = savedNotes.filter((n) => n?.isBookmark).length;

      allUserAnalytics.push({
        id: doc.id,
        userId: doc.id,
        name: data.name || profile.name || doc.id,
        email: data.email || profile.email || '',
        role,
        status: currentStatus,
        createdAt: data.createdAt || '',
        lastLoginAt: data.lastLoginAt || '',
        lastActiveAt,
        schoolType,
        schoolTypeLabel,
        schoolName: profile.schoolName || '',
        department: profile.department || '',
        grade,
        gradeLabel,
        track,
        trackLabel,
        deviationScore:
          typeof profile.deviationScore === 'number' && profile.deviationScore > 0
            ? profile.deviationScore
            : null,
        targetSchools: Array.isArray(profile.targetSchools) ? profile.targetSchools : [],
        selectedSubjects: Array.isArray(profile.selectedSubjects) ? profile.selectedSubjects : [],
        weakSubjects: Array.isArray(profile.weakSubjects) ? profile.weakSubjects : [],
        isActiveToday,
        isActive7d,
        isActive30d,
        streakDays,
        totalStudyMinutes,
        studyMinutes7d,
        studyMinutes30d,
        studyTimeByDate,
        studyTimeRaw: studyTime,
        hasSyllabus: syllabus.length > 0,
        syllabusTotalTasks,
        syllabusCompletedTasks,
        syllabusProgress,
        syllabusUpdatedAt: dbData.syllabusUpdatedAt || null,
        masteredUnitsCount: masteredUnits.length,
        textbooksViewedCount,
        textbooksCompletedCount,
        recentMaterials: materialList.slice(0, 20),
        allMaterials: materialList,
        testsTakenCount: formattedTests.length,
        testsCompletedCount,
        testQuestionsAnswered,
        testQuestionsCorrect,
        testFirstCorrectCount,
        testAccuracy,
        recentTests: formattedTests.slice(0, 20),
        allTests: formattedTests,
        aiChatCount,
        aiDrillCount,
        pomodoroCount,
        examCount,
        flashcardsCount: flashcards.length,
        bookmarksCount,
        notesCount: savedNotes.length,
        feedbackQueueCount: feedbackQueue.length,
        feedbackQueue,
        rawLogs: logs,
        recentLogs: logs
          .slice(-25)
          .reverse()
          .map((l: any) => ({
            id: l.id || '',
            timestamp: l.timestamp || '',
            type: l.type || 'other',
            message: l.data?.message || l.data?.title || l.data?.topic || l.type || '学習ログ',
            subject: l.data?.subject || '',
            score: l.data?.score || '',
            scorePercent: l.data?.scorePercent ?? null,
          })),
      });
    });

    // Cohort selection for aggregate analytics (students by default, or all if includeAdmins=1)
    const studentOnlyList = allUserAnalytics.filter((u) => u.role === 'student');
    const aggregatePool =
      includeAdmins || studentOnlyList.length === 0 ? allUserAnalytics : studentOnlyList;

    // 1. OVERALL METRICS
    let dau = 0;
    let wau = 0;
    let mau = 0;
    let activeAccounts = 0;
    let totalStudyMinutes = 0;
    let studyMinutes7d = 0;
    let studyMinutes30d = 0;
    let totalTextbooksViewed = 0;
    let totalTextbooksCompleted = 0;
    let totalTestsTaken = 0;
    let totalTestsCompleted = 0;
    let totalTestQuestionsAnswered = 0;
    let totalTestQuestionsCorrect = 0;
    let totalAiDrills = 0;
    let totalAiChats = 0;
    let totalPomodoros = 0;
    let totalMockExams = 0;
    let totalFlashcardsSaved = 0;
    let totalBookmarksSaved = 0;
    let syllabusBuiltCount = 0;
    let syllabusProgressSum = 0;

    // 14-day trend accumulators
    const trendMap = new Map<
      string,
      {
        date: string;
        studyMinutes: number;
        activeUserIds: Set<string>;
        drillAndTestCount: number;
        materialViewCount: number;
        chatCount: number;
      }
    >();
    for (const d of last14Dates) {
      trendMap.set(d, {
        date: d,
        studyMinutes: 0,
        activeUserIds: new Set<string>(),
        drillAndTestCount: 0,
        materialViewCount: 0,
        chatCount: 0,
      });
    }

    // Subject breakdown accumulators
    const subjectMap = new Map<
      SubjectBucket,
      {
        subject: SubjectBucket;
        textbookViews: number;
        textbooksCompleted: number;
        testSessions: number;
        testQuestionsAnswered: number;
        testQuestionsCorrect: number;
        aiDrillCount: number;
        aiChatCount: number;
      }
    >();
    for (const sb of SUBJECT_BUCKETS) {
      subjectMap.set(sb, {
        subject: sb,
        textbookViews: 0,
        textbooksCompleted: 0,
        testSessions: 0,
        testQuestionsAnswered: 0,
        testQuestionsCorrect: 0,
        aiDrillCount: 0,
        aiChatCount: 0,
      });
    }

    for (const u of aggregatePool) {
      if (u.status === 'active') activeAccounts++;
      if (u.isActiveToday) dau++;
      if (u.isActive7d) wau++;
      if (u.isActive30d) mau++;

      totalStudyMinutes += u.totalStudyMinutes;
      studyMinutes7d += u.studyMinutes7d;
      studyMinutes30d += u.studyMinutes30d;
      totalTextbooksViewed += u.textbooksViewedCount;
      totalTextbooksCompleted += u.textbooksCompletedCount;
      totalTestsTaken += u.testsTakenCount;
      totalTestsCompleted += u.testsCompletedCount;
      totalTestQuestionsAnswered += u.testQuestionsAnswered;
      totalTestQuestionsCorrect += u.testQuestionsCorrect;
      totalAiDrills += u.aiDrillCount;
      totalAiChats += u.aiChatCount;
      totalPomodoros += u.pomodoroCount;
      totalMockExams += u.examCount;
      totalFlashcardsSaved += u.flashcardsCount;
      totalBookmarksSaved += u.bookmarksCount;

      if (u.hasSyllabus) {
        syllabusBuiltCount++;
        syllabusProgressSum += u.syllabusProgress;
      }

      // Daily study time trend
      for (const [dKey, minsRaw] of Object.entries(u.studyTimeRaw || {})) {
        const mins = Number(minsRaw) || 0;
        if (mins > 0 && set14.has(dKey)) {
          const entry = trendMap.get(dKey)!;
          entry.studyMinutes += mins;
          entry.activeUserIds.add(u.id);
        }
      }

      // Logs into daily trend & subject breakdown
      for (const l of u.rawLogs || []) {
        const dKey = toJstDateString(l?.timestamp);
        if (dKey && set14.has(dKey)) {
          const entry = trendMap.get(dKey)!;
          entry.activeUserIds.add(u.id);
          if (l.type === 'drill') entry.drillAndTestCount++;
          else if (l.type === 'material') entry.materialViewCount++;
          else if (l.type === 'chat') entry.chatCount++;
        }
        const bucket = normalizeSubjectBucket(l?.data?.subject || l?.data?.topic);
        const sAcc = subjectMap.get(bucket)!;
        if (l?.type === 'drill') sAcc.aiDrillCount++;
        else if (l?.type === 'chat') sAcc.aiChatCount++;
      }

      // Materials into subject breakdown
      for (const m of u.allMaterials || []) {
        const sAcc = subjectMap.get(m.subjectBucket as SubjectBucket)!;
        sAcc.textbookViews += m.viewCount;
        if (m.completed) sAcc.textbooksCompleted++;
      }

      // Tests into subject breakdown
      for (const t of u.allTests || []) {
        const sAcc = subjectMap.get(t.subjectBucket as SubjectBucket)!;
        sAcc.testSessions++;
        sAcc.testQuestionsAnswered += t.answeredCount;
        sAcc.testQuestionsCorrect += t.correctCount;
      }
    }

    const dailyTrend = Array.from(trendMap.values()).map((d) => ({
      date: d.date,
      label: d.date.slice(5).replace('-', '/'),
      studyMinutes: d.studyMinutes,
      activeUsers: d.activeUserIds.size,
      drillAndTestCount: d.drillAndTestCount,
      materialViewCount: d.materialViewCount,
      chatCount: d.chatCount,
    }));

    const subjectBreakdown = Array.from(subjectMap.values()).map((s) => ({
      ...s,
      testAccuracy:
        s.testQuestionsAnswered > 0
          ? Math.round((s.testQuestionsCorrect / s.testQuestionsAnswered) * 100)
          : null,
    }));

    // 2. COHORT BREAKDOWN (中・高・学年・文理別)
    const cohortDefs: {
      key: string;
      label: string;
      group: 'summary' | 'junior_high' | 'high' | 'track';
      predicate: (u: any) => boolean;
    }[] = [
      {
        key: 'all_junior_high',
        label: '中学校 全体',
        group: 'summary',
        predicate: (u) => u.schoolType === 'junior_high',
      },
      {
        key: 'all_high',
        label: '高等学校 全体',
        group: 'summary',
        predicate: (u) => u.schoolType === 'high',
      },
      {
        key: 'jh_1',
        label: '中学 1年生',
        group: 'junior_high',
        predicate: (u) => u.schoolType === 'junior_high' && u.grade === 1,
      },
      {
        key: 'jh_2',
        label: '中学 2年生',
        group: 'junior_high',
        predicate: (u) => u.schoolType === 'junior_high' && u.grade === 2,
      },
      {
        key: 'jh_3',
        label: '中学 3年生',
        group: 'junior_high',
        predicate: (u) => u.schoolType === 'junior_high' && u.grade === 3,
      },
      {
        key: 'hs_1',
        label: '高校 1年生',
        group: 'high',
        predicate: (u) => u.schoolType === 'high' && u.grade === 1,
      },
      {
        key: 'hs_2',
        label: '高校 2年生',
        group: 'high',
        predicate: (u) => u.schoolType === 'high' && u.grade === 2,
      },
      {
        key: 'hs_3',
        label: '高校 3年生',
        group: 'high',
        predicate: (u) => u.schoolType === 'high' && u.grade === 3,
      },
      {
        key: 'hs_science',
        label: '高校・理系コース',
        group: 'track',
        predicate: (u) => u.schoolType === 'high' && u.track === 'science',
      },
      {
        key: 'hs_arts',
        label: '高校・文系コース',
        group: 'track',
        predicate: (u) => u.schoolType === 'high' && u.track === 'arts',
      },
      {
        key: 'hs_undecided',
        label: '高校・文理未定/共通',
        group: 'track',
        predicate: (u) => u.schoolType === 'high' && u.track === 'undecided',
      },
    ];

    const cohorts = cohortDefs.map((def) => {
      const members = aggregatePool.filter(def.predicate);
      const count = members.length;
      const active7dCount = members.filter((m) => m.isActive7d).length;
      const active30dCount = members.filter((m) => m.isActive30d).length;
      const cStudyMin = members.reduce((a, m) => a + m.totalStudyMinutes, 0);
      const cStudyMin7d = members.reduce((a, m) => a + m.studyMinutes7d, 0);

      const devMembers = members.filter((m) => typeof m.deviationScore === 'number');
      const avgDeviationScore =
        devMembers.length > 0
          ? Math.round(
              (devMembers.reduce((a, m) => a + m.deviationScore, 0) / devMembers.length) * 10
            ) / 10
          : null;

      const sylMembers = members.filter((m) => m.hasSyllabus);
      const avgSyllabusProgress =
        sylMembers.length > 0
          ? Math.round(sylMembers.reduce((a, m) => a + m.syllabusProgress, 0) / sylMembers.length)
          : 0;

      const cTextViewed = members.reduce((a, m) => a + m.textbooksViewedCount, 0);
      const cTextCompleted = members.reduce((a, m) => a + m.textbooksCompletedCount, 0);
      const cTestsTaken = members.reduce((a, m) => a + m.testsTakenCount, 0);
      const cTestAnswered = members.reduce((a, m) => a + m.testQuestionsAnswered, 0);
      const cTestCorrect = members.reduce((a, m) => a + m.testQuestionsCorrect, 0);
      const cAiActivity = members.reduce((a, m) => a + m.aiDrillCount + m.aiChatCount, 0);

      // Top target schools & weak subjects
      const targetFreq = new Map<string, number>();
      const weakFreq = new Map<string, number>();
      for (const m of members) {
        for (const ts of m.targetSchools || []) {
          if (ts && !ts.includes('未設定')) {
            targetFreq.set(ts, (targetFreq.get(ts) || 0) + 1);
          }
        }
        for (const ws of m.weakSubjects || []) {
          if (ws) weakFreq.set(ws, (weakFreq.get(ws) || 0) + 1);
        }
      }

      const topTargetSchools = Array.from(targetFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, c]) => ({ name, count: c }));
      const topWeakSubjects = Array.from(weakFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name, c]) => ({ name, count: c }));

      return {
        key: def.key,
        label: def.label,
        group: def.group,
        userCount: count,
        active7dCount,
        active7dRate: count > 0 ? Math.round((active7dCount / count) * 100) : 0,
        active30dCount,
        totalStudyMinutes: cStudyMin,
        studyMinutes7d: cStudyMin7d,
        avgStudyMinutesPerUser: count > 0 ? Math.round(cStudyMin / count) : 0,
        avgStudyMinutes7dPerUser: count > 0 ? Math.round(cStudyMin7d / count) : 0,
        avgDeviationScore,
        syllabusCreatedCount: sylMembers.length,
        avgSyllabusProgress,
        textbooksViewed: cTextViewed,
        textbooksCompleted: cTextCompleted,
        avgTextbooksPerUser: count > 0 ? Math.round((cTextViewed / count) * 10) / 10 : 0,
        testsTaken: cTestsTaken,
        testQuestionsAnswered: cTestAnswered,
        testAccuracy:
          cTestAnswered > 0 ? Math.round((cTestCorrect / cTestAnswered) * 100) : null,
        aiActivityCount: cAiActivity,
        topTargetSchools,
        topWeakSubjects,
      };
    });

    // Clean heavy raw fields before returning user list
    const usersResponse = allUserAnalytics
      .map(({ rawLogs, allMaterials, allTests, studyTimeRaw, ...rest }) => rest)
      .sort((a, b) => b.studyMinutes7d - a.studyMinutes7d || b.totalStudyMinutes - a.totalStudyMinutes);

    return NextResponse.json({
      success: true,
      generatedAt: new Date().toISOString(),
      includeAdmins,
      dateRange: {
        todayJst,
        last7Dates,
        last14Dates,
        last30Dates,
      },
      overall: {
        totalAccounts: allUserAnalytics.length,
        studentAccounts: studentOnlyList.length,
        evaluatedAccounts: aggregatePool.length,
        activeAccounts,
        dau,
        wau,
        mau,
        wauRate: aggregatePool.length > 0 ? Math.round((wau / aggregatePool.length) * 100) : 0,
        totalStudyMinutes,
        studyMinutes7d,
        studyMinutes30d,
        avgStudyMinutesPerStudent:
          aggregatePool.length > 0 ? Math.round(totalStudyMinutes / aggregatePool.length) : 0,
        avgStudyMinutesPerActive7d: wau > 0 ? Math.round(studyMinutes7d / wau) : 0,
        totalTextbooksViewed,
        totalTextbooksCompleted,
        totalTestsTaken,
        totalTestsCompleted,
        totalTestQuestionsAnswered,
        totalTestQuestionsCorrect,
        overallTestAccuracy:
          totalTestQuestionsAnswered > 0
            ? Math.round((totalTestQuestionsCorrect / totalTestQuestionsAnswered) * 100)
            : null,
        totalAiDrills,
        totalAiChats,
        totalPomodoros,
        totalMockExams,
        totalFlashcardsSaved,
        totalBookmarksSaved,
        syllabusBuiltCount,
        syllabusBuiltRate:
          aggregatePool.length > 0
            ? Math.round((syllabusBuiltCount / aggregatePool.length) * 100)
            : 0,
        overallAvgSyllabusProgress:
          syllabusBuiltCount > 0 ? Math.round(syllabusProgressSum / syllabusBuiltCount) : 0,
        dailyTrend,
        subjectBreakdown,
      },
      cohorts,
      users: usersResponse,
    });
  } catch (error: any) {
    console.error('Admin Analytics GET Error:', error);
    return NextResponse.json(
      { error: '利用状況分析データの集計に失敗しました: ' + (error?.message || '') },
      { status: 500 }
    );
  }
}
