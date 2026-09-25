import { NextResponse } from 'next/server';
import { getDailyAnalysis, addLog, getLogs, getStudyTime, addStudyTime, getSyllabus } from '@/lib/db';

export async function GET() {
  return NextResponse.json({
    dailyAnalysis: getDailyAnalysis(),
    recentLogs: getLogs().slice(-10),
    studyTime: getStudyTime(),
    syllabus: getSyllabus()
  });
}

export async function POST(req: Request) {
  try {
    const { type, data } = await req.json();
    if (type === 'studyTime') {
      const date = new Date().toISOString().split('T')[0];
      addStudyTime(date, data.minutes, data.task);
      return NextResponse.json({ success: true });
    }
    
    addLog(type, data);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add log' }, { status: 500 });
  }
}
