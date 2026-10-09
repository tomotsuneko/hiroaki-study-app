import { NextResponse } from 'next/server';
import { getChatSessions, saveChatSession, ChatSession } from '@/lib/db';

function getTodayJST(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/\//g, '-');
}

export async function GET() {
  try {
    const sessions = await getChatSessions();
    return NextResponse.json({ sessions, today: getTodayJST() });
  } catch (error: any) {
    console.error('GET /api/chat/sessions Error:', error);
    return NextResponse.json({ error: 'Failed to fetch chat sessions' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const nowIso = new Date().toISOString();
    const today = getTodayJST();
    const id = body.id || `chat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const title = body.title || '新しいチャット';

    const newSession: ChatSession = {
      id,
      title,
      date: today,
      createdAt: nowIso,
      updatedAt: nowIso,
      messages: body.messages || [
        {
          role: 'model',
          content: 'こんにちは！今日はどの科目を勉強しますか？基礎からゆっくりやっていきましょう。分からないところがあれば、いつでも聞いてくださいね！🔥',
          timestamp: nowIso
        }
      ]
    };

    await saveChatSession(newSession);
    return NextResponse.json({ session: newSession });
  } catch (error: any) {
    console.error('POST /api/chat/sessions Error:', error);
    return NextResponse.json({ error: 'Failed to create chat session' }, { status: 500 });
  }
}
