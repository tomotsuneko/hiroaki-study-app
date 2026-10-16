import { dbAdmin } from './firebase-admin';
import { cookies } from 'next/headers';

export type LogEntry = {
  id: string;
  timestamp: string;
  type: 'chat' | 'drill' | 'pomodoro' | 'exam' | 'material' | 'flashcard';
  data: any;
};

export type SyllabusTask = {
  id: string;
  title: string;
  type: 'core' | 'weakness' | 'diagnostic';
};

export type SyllabusPhase = {
  phase: string;
  title: string;
  period: string;
  targetMilestone?: string;
  categories: {
    name: string;
    tasks: SyllabusTask[];
  }[];
};

export type DayPlan = {
  date: string; // YYYY-MM-DD
  targetMinutes: number; // 予定学習時間（分）
  dayType: 'club' | 'cram' | 'full' | 'regular' | 'rest' | 'exam_prep';
  dayTypeLabel?: string;
  memo?: string;
  updatedAt?: string;
};

export type MaterialViewRecord = {
  unitCode: string;
  title: string;
  subject: string;
  viewCount: number;
  completed?: boolean;
  lastViewedAt: string;
};

export type FeedbackQueueItem = {
  id: string;
  unitCode?: string;
  topic: string;
  subject: string;
  reason: 'low_accuracy' | 'mistake_review' | 'due_flashcard';
  scorePercent?: number;
  source?: 'official_test' | 'ai_drill' | 'exam_analysis';
  updatedAt: string;
};

export type Database = {
  profile?: any;
  logs: LogEntry[];
  studyTime: Record<string, number>;
  syllabus: SyllabusPhase[] | null;
  syllabusUpdatedAt?: string;
  dailyAnalysis: {
    lastRunDate: string;
    achievementLevel: number;
    achievements?: { school: string; level: number }[];
    recommendedSubjects: string[];
    aiComment: string;
    miniLesson?: any;
    learningContents?: any[];
    dailyDrill?: any[];
    dailyFlashcards?: any[];
    feedbackSummary?: {
      weakUnitsCount: number;
      masteredUnitsCount: number;
      streakDays: number;
    };
  } | null;
  flashcards?: any[];
  syllabusRebalanceAlert?: {
    reason: string;
    message: string;
    timestamp: string;
  } | null;
  dayPlans?: Record<string, DayPlan>;
  materialViews?: Record<string, MaterialViewRecord>;
  feedbackQueue?: FeedbackQueueItem[];
  masteredUnits?: string[];
};

const defaultDb: Database = {
  logs: [],
  studyTime: {},
  syllabus: null,
  dailyAnalysis: null,
  flashcards: [],
  dayPlans: {},
  materialViews: {},
  feedbackQueue: [],
  masteredUnits: [],
};

// Retrieve user ID from cookies
export async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('study_user_id')?.value;
  return userId || 'anonymous';
}

export async function readDB(targetUserId?: string): Promise<Database> {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) return { ...defaultDb }; // fallback if no firebase

    const doc = await dbAdmin.collection('users').doc(userId).get();
    if (doc.exists) {
      const data = doc.data();
      return {
        ...defaultDb,
        ...(data?.db || {}),
      };
    }
  } catch (e) {
    console.error('DB Read Error:', e);
  }
  return { ...defaultDb };
}

export async function writeDB(dbData: Database, targetUserId?: string) {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) return;

    await dbAdmin.collection('users').doc(userId).set(
      {
        db: dbData,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (e) {
    console.error('DB Write Error:', e);
  }
}

export async function saveUserProfile(profile: any, targetUserId?: string) {
  const db = await readDB(targetUserId);
  db.profile = {
    ...(db.profile || {}),
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  // Merge completedTasks with masteredUnits so nothing is lost
  if (Array.isArray(profile?.completedTasks)) {
    const mergedCompleted = Array.from(
      new Set([...(db.profile.completedTasks || []), ...(db.masteredUnits || [])])
    );
    db.profile.completedTasks = mergedCompleted;
  }
  await writeDB(db, targetUserId);
  return db.profile;
}

export async function addLog(type: LogEntry['type'], data: any) {
  const db = await readDB();
  if (!db.logs) db.logs = [];
  db.logs.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type,
    data,
  });
  // Keep latest 300 logs to prevent unbounded doc growth
  if (db.logs.length > 300) {
    db.logs = db.logs.slice(-300);
  }
  await writeDB(db);
}

export async function getLogs() {
  const db = await readDB();
  return db.logs || [];
}

export async function getDailyAnalysis() {
  const db = await readDB();
  return db.dailyAnalysis;
}

export async function updateDailyAnalysis(analysis: Database['dailyAnalysis']) {
  const db = await readDB();
  db.dailyAnalysis = analysis;
  await writeDB(db);
}

export async function addStudyTime(date: string, minutes: number, task?: string) {
  const db = await readDB();
  if (!db.studyTime) db.studyTime = {};
  if (!db.studyTime[date]) {
    db.studyTime[date] = 0;
  }
  db.studyTime[date] += minutes;

  if (!db.logs) db.logs = [];

  if (task) {
    db.logs.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type: 'pomodoro',
      data: { minutes, task, message: `【集中学習】「${task}」に${minutes}分間取り組みました！` },
    });
  } else {
    db.logs.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type: 'pomodoro',
      data: { minutes, message: `ポモドーロタイマーで${minutes}分間集中しました！` },
    });
  }

  await writeDB(db);
}

export async function recordMaterialView(params: {
  unitCode: string;
  title: string;
  subject: string;
  completed?: boolean;
  minutes?: number;
}) {
  const db = await readDB();
  if (!db.materialViews) db.materialViews = {};
  const key = params.unitCode || params.title;
  const existing = db.materialViews[key];
  const nowIso = new Date().toISOString();

  db.materialViews[key] = {
    unitCode: params.unitCode || key,
    title: params.title,
    subject: params.subject || '学習教材',
    viewCount: (existing?.viewCount || 0) + 1,
    completed: params.completed ?? existing?.completed ?? false,
    lastViewedAt: nowIso,
  };

  if (params.completed) {
    if (!db.masteredUnits) db.masteredUnits = [];
    if (!db.masteredUnits.includes(params.title)) {
      db.masteredUnits.push(params.title);
    }
    if (db.profile) {
      db.profile.completedTasks = Array.from(
        new Set([...(db.profile.completedTasks || []), params.title])
      );
    }
  }

  if (params.minutes && params.minutes > 0) {
    const date = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .format(new Date())
      .replace(/\//g, '-');
    if (!db.studyTime) db.studyTime = {};
    db.studyTime[date] = (db.studyTime[date] || 0) + params.minutes;
  }

  if (!db.logs) db.logs = [];
  // Avoid spamming identical material open logs within 5 minutes unless completed=true
  const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
  const recentIdx = db.logs.findIndex(
    (l) =>
      l.type === 'material' &&
      l.data?.unitCode === key &&
      new Date(l.timestamp).getTime() > fiveMinsAgo
  );

  const entry: LogEntry = {
    id: Date.now().toString(),
    timestamp: nowIso,
    type: 'material',
    data: {
      unitCode: key,
      title: params.title,
      subject: params.subject,
      completed: Boolean(params.completed),
      message: params.completed
        ? `📘 公式テキスト「${params.title}」を読了・習得チェックしました！`
        : `📘 公式テキスト「${params.title}」を学習しました。`,
    },
  };

  if (recentIdx >= 0) {
    db.logs[recentIdx] = entry;
  } else {
    db.logs.push(entry);
  }

  await writeDB(db);
  return { materialViews: db.materialViews, masteredUnits: db.masteredUnits };
}

/**
 * テストやAIドリルの実施結果を次回学習へ自動フィードバックするエンジン
 * - 正答率80%以上（かつ3問以上回答）：習得済み（masteredUnits & completedTasks）に自動追加し、弱点キュー（feedbackQueue）から解除
 * - 正答率75%未満：弱点補強キュー（feedbackQueue）へ自動登録し、次回ダッシュボード・シラバス・ドリル・暗記カードで最優先プッシュ提示
 */
export async function recordLearningFeedback(params: {
  unitCode?: string;
  topic: string;
  subject: string;
  scorePercent: number;
  totalQuestions: number;
  source: 'official_test' | 'ai_drill';
  targetUserId?: string;
}): Promise<{
  action: 'mastered' | 'queued_for_review' | 'recorded';
  feedbackMessage: string;
  masteredUnits: string[];
  feedbackQueue: FeedbackQueueItem[];
}> {
  const db = await readDB(params.targetUserId);
  if (!db.masteredUnits) db.masteredUnits = [];
  if (!db.feedbackQueue) db.feedbackQueue = [];

  const cleanTopic = (params.topic || '')
    .replace(/^L[123]\s*(基礎|標準|応用)?\s*[｜|]\s*/i, '')
    .replace(/\s*\(L[123].*?\)\s*$/i, '')
    .trim();
  const cleanSubj = (params.subject || '数学').replace(/^high_school_/, '');
  const nowIso = new Date().toISOString();

  let action: 'mastered' | 'queued_for_review' | 'recorded' = 'recorded';
  let feedbackMessage = '';

  if (params.scorePercent >= 80 && params.totalQuestions >= 3) {
    action = 'mastered';
    if (cleanTopic && !db.masteredUnits.includes(cleanTopic)) {
      db.masteredUnits.push(cleanTopic);
    }
    if (params.unitCode && !db.masteredUnits.includes(params.unitCode)) {
      db.masteredUnits.push(params.unitCode);
    }
    if (db.profile && cleanTopic) {
      db.profile.completedTasks = Array.from(
        new Set([...(db.profile.completedTasks || []), cleanTopic])
      );
    }
    // Remove from feedbackQueue if previously weak
    db.feedbackQueue = db.feedbackQueue.filter(
      (item) =>
        item.topic !== cleanTopic &&
        (!params.unitCode || item.unitCode !== params.unitCode)
    );
    feedbackMessage = `🎉 正答率${params.scorePercent}%達成！「${cleanTopic || params.unitCode}」を習得済みに認定し、学習シラバスの進捗に自動反映しました。`;
  } else if (params.scorePercent < 75 && params.totalQuestions >= 1) {
    action = 'queued_for_review';
    const existingIdx = db.feedbackQueue.findIndex(
      (item) =>
        (params.unitCode && item.unitCode === params.unitCode) ||
        (cleanTopic && item.topic === cleanTopic)
    );
    const queueItem: FeedbackQueueItem = {
      id: `fb_${params.unitCode || cleanTopic}_${Date.now()}`,
      unitCode: params.unitCode || '',
      topic: cleanTopic || params.unitCode || cleanSubj,
      subject: cleanSubj,
      reason: 'low_accuracy',
      scorePercent: params.scorePercent,
      source: params.source,
      updatedAt: nowIso,
    };
    if (existingIdx >= 0) {
      db.feedbackQueue[existingIdx] = queueItem;
    } else {
      db.feedbackQueue.unshift(queueItem);
    }
    // Keep top 20 priority items
    if (db.feedbackQueue.length > 20) {
      db.feedbackQueue = db.feedbackQueue.slice(0, 20);
    }
    feedbackMessage = `📌 正答率${params.scorePercent}%のため、「${cleanTopic || params.unitCode}」を次回の重点復習（Push推奨）リストに登録しました。公式テキストの確認と暗記カードでの補強をおすすめします！`;
  } else {
    feedbackMessage = `✅ 「${cleanTopic || params.unitCode}」の演習結果（正答率${params.scorePercent}%）を学習カルテに記録しました。80%以上で習得認定となります！`;
  }

  await writeDB(db, params.targetUserId);
  return {
    action,
    feedbackMessage,
    masteredUnits: db.masteredUnits,
    feedbackQueue: db.feedbackQueue,
  };
}

export async function getStudyTime() {
  const db = await readDB();
  return db.studyTime || {};
}

export async function getSyllabus() {
  const db = await readDB();
  return db.syllabus;
}

export async function getSyllabusUpdatedAt() {
  const db = await readDB();
  return db.syllabusUpdatedAt;
}

export async function updateSyllabus(syllabus: SyllabusPhase[], rebalanceAlert?: any) {
  const db = await readDB();
  db.syllabus = syllabus;
  db.syllabusUpdatedAt = new Date().toISOString();
  if (rebalanceAlert !== undefined) {
    db.syllabusRebalanceAlert = rebalanceAlert;
  }
  await writeDB(db);
}

export async function clearSyllabusRebalanceAlert() {
  const db = await readDB();
  db.syllabusRebalanceAlert = null;
  await writeDB(db);
}

export async function getFlashcards() {
  const db = await readDB();
  return db.flashcards || [];
}

export async function saveFlashcards(cards: any[]) {
  const db = await readDB();
  if (!db.flashcards) db.flashcards = [];
  // Deduplicate by front text so we don't accumulate duplicate cards
  const existingFronts = new Set(db.flashcards.map((c: any) => (c.front || '').trim()));
  for (const c of cards) {
    if (!existingFronts.has((c.front || '').trim())) {
      db.flashcards.push(c);
      existingFronts.add((c.front || '').trim());
    }
  }
  await writeDB(db);
}

export async function getDayPlans(): Promise<Record<string, DayPlan>> {
  const db = await readDB();
  return db.dayPlans || {};
}

export async function saveDayPlan(plan: DayPlan): Promise<void> {
  const db = await readDB();
  if (!db.dayPlans) db.dayPlans = {};
  db.dayPlans[plan.date] = {
    ...plan,
    updatedAt: new Date().toISOString(),
  };
  await writeDB(db);
}

export async function updateFlashcardReview(id: string, correct: boolean) {
  const db = await readDB();
  if (!db.flashcards) return;
  const card = db.flashcards.find((c) => c.id === id);
  if (card) {
    const currentLevel = typeof card.level === 'number' ? card.level : 0;
    if (correct) {
      card.level = Math.min(currentLevel + 1, 5);
    } else {
      card.level = 0;
    }
    const daysToAdd = [1, 1, 3, 7, 14, 30][card.level];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    card.nextReviewDate = nextDate.toISOString().split('T')[0];
    card.nextReview = nextDate.getTime();
    card.interval = daysToAdd;
    card.lastReviewedAt = new Date().toISOString();

    // Update daily flashcard review log (coalesced per day)
    if (!db.logs) db.logs = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const existingLogIdx = db.logs.findIndex(
      (l) => l.type === 'flashcard' && l.timestamp.startsWith(todayStr)
    );
    if (existingLogIdx >= 0) {
      const prevData = db.logs[existingLogIdx].data || {};
      const reviewedCount = (prevData.reviewedCount || 0) + 1;
      const masteredCount = (prevData.masteredCount || 0) + (correct ? 1 : 0);
      db.logs[existingLogIdx] = {
        ...db.logs[existingLogIdx],
        timestamp: new Date().toISOString(),
        data: {
          reviewedCount,
          masteredCount,
          lastSubject: card.subject,
          message: `📇 暗記カードを本日 ${reviewedCount} 枚復習しました（習得OK: ${masteredCount}枚）`,
        },
      };
    } else {
      db.logs.push({
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        type: 'flashcard',
        data: {
          reviewedCount: 1,
          masteredCount: correct ? 1 : 0,
          lastSubject: card.subject,
          message: `📇 暗記カードを本日 1 枚復習しました（習得OK: ${correct ? 1 : 0}枚）`,
        },
      });
    }
  }
  await writeDB(db);
}

export type ChatMessage = {
  role: 'user' | 'model';
  content: string;
  timestamp: string;
};

export type ChatSession = {
  id: string;
  userId?: string;
  title: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type ChatSessionMeta = {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

// In-memory fallback if Firestore is not initialized
const memoryChatSessions = new Map<string, Map<string, ChatSession>>();

export async function getChatSessions(targetUserId?: string): Promise<ChatSessionMeta[]> {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) {
      const userSessions = memoryChatSessions.get(userId);
      if (!userSessions) return [];
      return Array.from(userSessions.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((s) => ({
          id: s.id,
          title: s.title,
          date: s.date,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length,
        }));
    }

    const snapshot = await dbAdmin
      .collection('users')
      .doc(userId)
      .collection('chat_sessions')
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || '新しいチャット',
        date: data.date || '',
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0,
      };
    });
  } catch (error) {
    console.error('getChatSessions Error:', error);
    return [];
  }
}

export async function getChatSession(
  sessionId: string,
  targetUserId?: string
): Promise<ChatSession | null> {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) {
      const userSessions = memoryChatSessions.get(userId);
      return userSessions?.get(sessionId) || null;
    }

    const doc = await dbAdmin
      .collection('users')
      .doc(userId)
      .collection('chat_sessions')
      .doc(sessionId)
      .get();

    if (!doc.exists) return null;
    const data = doc.data() as ChatSession;
    return {
      ...data,
      id: doc.id,
      messages: data.messages || [],
    };
  } catch (error) {
    console.error('getChatSession Error:', error);
    return null;
  }
}

export async function saveChatSession(
  session: ChatSession,
  targetUserId?: string
): Promise<void> {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) {
      if (!memoryChatSessions.has(userId)) {
        memoryChatSessions.set(userId, new Map());
      }
      memoryChatSessions.get(userId)!.set(session.id, session);
      return;
    }

    await dbAdmin
      .collection('users')
      .doc(userId)
      .collection('chat_sessions')
      .doc(session.id)
      .set(
        {
          ...session,
          userId,
        },
        { merge: true }
      );
  } catch (error) {
    console.error('saveChatSession Error:', error);
    throw error;
  }
}

export async function deleteChatSession(
  sessionId: string,
  targetUserId?: string
): Promise<void> {
  try {
    const userId = targetUserId || (await getUserId());
    if (!dbAdmin) {
      const userSessions = memoryChatSessions.get(userId);
      userSessions?.delete(sessionId);
      return;
    }

    await dbAdmin
      .collection('users')
      .doc(userId)
      .collection('chat_sessions')
      .doc(sessionId)
      .delete();
  } catch (error) {
    console.error('deleteChatSession Error:', error);
    throw error;
  }
}
