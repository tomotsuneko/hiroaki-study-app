import { NextResponse } from 'next/server';
import { getChatSession, deleteChatSession, saveChatSession } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    const session = await getChatSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error: any) {
    console.error('GET /api/chat/sessions/[id] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
    }

    await deleteChatSession(id);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('DELETE /api/chat/sessions/[id] Error:', error);
    return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
  }
}
