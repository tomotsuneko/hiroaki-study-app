import { NextResponse } from 'next/server';
import {
  readDB,
  addLog,
  addStudyTime,
  saveUserProfile,
  recordMaterialView,
  recordLearningFeedback,
} from '@/lib/db';

export async function GET() {
  const db = await readDB();
  return NextResponse.json({
    profile: db.profile || null,
    dailyAnalysis: db.dailyAnalysis,
    recentLogs: (db.logs || []).slice(-25),
    studyTime: db.studyTime || {},
    syllabus: db.syllabus,
    syllabusUpdatedAt: db.syllabusUpdatedAt,
    syllabusRebalanceAlert: db.syllabusRebalanceAlert || null,
    dayPlans: db.dayPlans || {},
    materialViews: db.materialViews || {},
    feedbackQueue: db.feedbackQueue || [],
    masteredUnits: db.masteredUnits || [],
    flashcards: db.flashcards || [],
  });
}

export async function POST(req: Request) {
  try {
    const { type, data } = await req.json();

    if (type === 'studyTime') {
      const date = new Intl.DateTimeFormat('ja-JP', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(new Date())
        .replace(/\//g, '-');
      await addStudyTime(date, data.minutes, data.task);
      return NextResponse.json({ success: true });
    }

    if (type === 'saveProfile') {
      const saved = await saveUserProfile(data);
      return NextResponse.json({ success: true, profile: saved });
    }

    if (type === 'materialView') {
      const res = await recordMaterialView(data);
      return NextResponse.json({ success: true, ...res });
    }

    if (type === 'learningFeedback') {
      const res = await recordLearningFeedback(data);
      return NextResponse.json({ success: true, ...res });
    }

    if (type === 'clearRebalanceAlert') {
      const { clearSyllabusRebalanceAlert } = await import('@/lib/db');
      await clearSyllabusRebalanceAlert();
      return NextResponse.json({ success: true });
    }

    if (type === 'saveDayPlan') {
      const { saveDayPlan } = await import('@/lib/db');
      await saveDayPlan(data);
      return NextResponse.json({ success: true });
    }

    await addLog(type, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST /api/db/daily error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
