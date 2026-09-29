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
  type: 'core' | 'weakness';
};

export type SyllabusPhase = {
  phase: string;
  title: string;
  period: string;
  categories: {
    name: string;
    tasks: SyllabusTask[];
  }[];
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
};

const defaultDb: Database = {
  logs: [],
  studyTime: {},
  syllabus: null,
  dailyAnalysis: null,
  flashcards: []
};

// Retrieve user ID from cookies
async function getUserId(): Promise<string> {
  const cookieStore = await cookies();
  const userId = cookieStore.get('study_user_id')?.value;
  return userId || 'anonymous';
}

async function readDB(): Promise<Database> {
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

export async function updateSyllabus(syllabus: SyllabusPhase[]) {
  const db = await readDB();
  db.syllabus = syllabus;
  db.syllabusUpdatedAt = new Date().toISOString();
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
