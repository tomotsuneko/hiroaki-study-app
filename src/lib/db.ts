import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

type LogEntry = {
  id: string;
  timestamp: string;
  type: 'chat' | 'drill' | 'pomodoro' | 'exam';
  data: any;
};

export type SyllabusTask = {
  id: string;
  title: string;
  type: 'core' | 'weakness'; // 'core' = 固定ルート, 'weakness' = 弱点克服
};

export type SyllabusPhase = {
  phase: string;
  title: string;
  period: string; // e.g. "〜夏休み前"
  categories: {
    name: string; // e.g. "📘 英語基礎"
    tasks: SyllabusTask[];
  }[];
};

type Database = {
  logs: LogEntry[];
  studyTime: Record<string, number>; // YYYY-MM-DD -> minutes
  syllabus: SyllabusPhase[] | null;
  dailyAnalysis: {
    lastRunDate: string;
    achievementLevel: number; // legacy
    achievements?: { school: string, level: number }[];
    recommendedSubjects: string[];
    aiComment: string;
    miniLesson?: {
      title: string;
      content: string; // Markdown lesson, including MS fundamentals
      question: string;
      options: string[];
      correctAnswerIndex: number;
      explanation: string;
    };
    learningContents?: {
      taskTitle: string;
      textMarkdown: string;
      videoQueries: string[];
      checkTest: {
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }[];
    }[];
  } | null;
  flashcards?: {
    id: string;
    subject: string;
    front: string;
    back: string;
    level: number; // 0=new, 1=1d, 2=3d, 3=7d, 4=14d
    nextReviewDate: string; // ISO date
  }[];
};

const defaultDb: Database = {
  logs: [],
  studyTime: {},
  syllabus: null,
  dailyAnalysis: null
};

function readDB(): Database {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("DB Read Error:", e);
  }
  return defaultDb;
}

function writeDB(data: Database) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error("DB Write Error:", e);
  }
}

export function addLog(type: LogEntry['type'], data: any) {
  const db = readDB();
  db.logs.push({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type,
    data
  });
  writeDB(db);
}

export function getLogs() {
  return readDB().logs;
}

export function getDailyAnalysis() {
  return readDB().dailyAnalysis;
}

export function updateDailyAnalysis(analysis: Database['dailyAnalysis']) {
  const db = readDB();
  db.dailyAnalysis = analysis;
  writeDB(db);
}

export function addStudyTime(date: string, minutes: number, task?: string) {
  const db = readDB();
  if (!db.studyTime[date]) {
    db.studyTime[date] = 0;
  }
  db.studyTime[date] += minutes;
  
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
  
  writeDB(db);
}

export function getStudyTime() {
  return readDB().studyTime;
}

export function getSyllabus() {
  return readDB().syllabus;
}

export function updateSyllabus(syllabus: SyllabusPhase[]) {
  const db = readDB();
  db.syllabus = syllabus;
  writeDB(db);
}

export function getFlashcards() {
  return readDB().flashcards || [];
}

export function saveFlashcards(cards: any[]) {
  const db = readDB();
  if (!db.flashcards) db.flashcards = [];
  db.flashcards.push(...cards);
  writeDB(db);
}

export function updateFlashcardReview(id: string, correct: boolean) {
  const db = readDB();
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
  writeDB(db);
}
