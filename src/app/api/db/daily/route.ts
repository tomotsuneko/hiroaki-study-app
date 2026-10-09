import { NextResponse } from 'next/server';
import { readDB, addLog, addStudyTime } from '@/lib/db';

export async function GET() {
  const db = await readDB();
  return NextResponse.json({
    dailyAnalysis: db.dailyAnalysis,
    recentLogs: (db.logs || []).slice(-10),
    studyTime: db.studyTime || {},
    syllabus: db.syllabus,
    syllabusUpdatedAt: db.syllabusUpdatedAt,
    syllabusRebalanceAlert: db.syllabusRebalanceAlert || null,
    dayPlans: db.dayPlans || {}
  });
}

export async function POST(req: Request) {
  try {
    const { type, data } = await req.json();
    if (type === 'studyTime') {
      const date = new Date().toISOString().split('T')[0];
      await addStudyTime(date, data.minutes, data.task);
      return NextResponse.json({ success: true });
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
    return NextResponse.json({ error: 'Failed to add log' }, { status: 500 });
  }
}
