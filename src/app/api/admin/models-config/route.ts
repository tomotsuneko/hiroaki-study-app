import { NextResponse } from 'next/server';
import { getActiveModels } from '@/lib/model-manager';

export async function GET() {
  try {
    const syllabusModels = await getActiveModels('syllabus');
    const chatModels = await getActiveModels('chat');
    return NextResponse.json({
      success: true,
      config: {
        syllabus: syllabusModels,
        chat: chatModels
      }
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch config' }, { status: 500 });
  }
}
