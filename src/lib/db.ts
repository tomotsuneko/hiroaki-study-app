import { dbAdmin } from './firebase-admin';
import { cookies } from 'next/headers';

type LogEntry = {
  id: string;
  timestamp: string;
  type: 'chat' | 'drill' | 'pomodoro' | 'exam';
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

type Database = {
  logs: LogEntry[];
  studyTime: Record<string, number>;
  syllabus: SyllabusPhase[] | null;
  syllabusUpdatedAt?: string;
  dailyAnalysis: {
    lastRunDate: string;
    achievementLevel: number;
    achievements?: { school: string, level: number }[];
    recommendedSubjects: string[];
    aiComment: string;
    miniLesson?: any;
    learningContents?: any[];
  } | null;
  flashcards?: any[];
  syllabusRebalanceAlert?: {
    reason: string;
    message: string;
    timestamp: string;
  } | null;
  dayPlans?: Record<string, DayPlan>;
};

const defaultDb: Database = {
  logs: [],
  studyTime: {},
  syllabus: null,
  dailyAnalysis: null,
  flashcards: [],
  dayPlans: {}
};

// Retrieve user ID from cookies
async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('study_user_id')?.value;
  return userId || 'anonymous';
}

export async function readDB(): Promise<Database> {
  try {
    const userId = await getUserId();
    if (!dbAdmin) return { ...defaultDb }; // fallback if no firebase

    const doc = await dbAdmin.collection('users').doc(userId).get();
    if (doc.exists) {
      const data = doc.data();
      return {
        ...defaultDb,
        ...(data?.db || {})
      };
    }
  } catch (e) {
    console.error("DB Read Error:", e);
  }
  return { ...defaultDb };
}

async function writeDB(dbData: Database) {
  try {
    const userId = await getUserId();
    if (!dbAdmin) return;
    
    await dbAdmin.collection('users').doc(userId).set({
      db: dbData
    }, { merge: true });
  } catch (e) {
    console.error("DB Write Error:", e);
  }
}

export async function addLog(type: LogEntry['type'], data: any) {
  const db = await readDB();
  if (!db.logs) db.logs = [];
  db.logs.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type,
    data
  });
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
      data: { minutes, task, message: `【集中学習】「${task}」に${minutes}分間取り組みました！` }
    });
  } else {
    db.logs.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      type: 'pomodoro',
      data: { minutes, message: `ポモドーロタイマーで${minutes}分間集中しました！` }
    });
  }
  
  await writeDB(db);
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
  db.flashcards.push(...cards);
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
    updatedAt: new Date().toISOString()
  };
  await writeDB(db);
}

export async function updateFlashcardReview(id: string, correct: boolean) {
  const db = await readDB();
  if (!db.flashcards) return;
  const card = db.flashcards.find(c => c.id === id);
  if (card) {
    if (correct) {
      card.level = Math.min(card.level + 1, 5);
    } else {
      card.level = 0;
    }
    const daysToAdd = [1, 1, 3, 7, 14, 30][card.level];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + daysToAdd);
    card.nextReviewDate = nextDate.toISOString().split('T')[0];
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
    const userId = targetUserId || await getUserId();
    if (!dbAdmin) {
      const userSessions = memoryChatSessions.get(userId);
      if (!userSessions) return [];
      return Array.from(userSessions.values())
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map(s => ({
          id: s.id,
          title: s.title,
          date: s.date,
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          messageCount: s.messages.length
        }));
    }

    const snapshot = await dbAdmin
      .collection('users')
      .doc(userId)
      .collection('chat_sessions')
      .orderBy('updatedAt', 'desc')
      .get();

    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || '新しいチャット',
        date: data.date || '',
        createdAt: data.createdAt || '',
        updatedAt: data.updatedAt || '',
        messageCount: Array.isArray(data.messages) ? data.messages.length : 0
      };
    });
  } catch (error) {
    console.error('getChatSessions Error:', error);
    return [];
  }
}

export async function getChatSession(sessionId: string, targetUserId?: string): Promise<ChatSession | null> {
  try {
    const userId = targetUserId || await getUserId();
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
      messages: data.messages || []
    };
  } catch (error) {
    console.error('getChatSession Error:', error);
    return null;
  }
}

export async function saveChatSession(session: ChatSession, targetUserId?: string): Promise<void> {
  try {
    const userId = targetUserId || await getUserId();
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
      .set({
        ...session,
        userId
      }, { merge: true });
  } catch (error) {
    console.error('saveChatSession Error:', error);
    throw error;
  }
}

export async function deleteChatSession(sessionId: string, targetUserId?: string): Promise<void> {
  try {
    const userId = targetUserId || await getUserId();
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

