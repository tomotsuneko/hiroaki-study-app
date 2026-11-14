import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST() {
  const res = NextResponse.json({ success: true });
  const clearOptions = {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
  res.cookies.set('study_user_id', '', clearOptions);
  res.cookies.set(SESSION_COOKIE_NAME, '', clearOptions);
  return res;
}
