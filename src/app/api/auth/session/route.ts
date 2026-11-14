import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) {
    return NextResponse.json({ authenticated: false, userId: null, role: null });
  }
  return NextResponse.json({
    authenticated: true,
    userId: session.userId,
    role: session.role,
  });
}
