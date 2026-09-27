import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return NextResponse.json({ error: 'IDとパスワードを入力してください' }, { status: 400 });
    }

    if (!dbAdmin) {
      // Allow fallback if no firebase (for local test without keys)
      const res = NextResponse.json({ success: true, message: 'Local mode' });
      res.cookies.set('study_user_id', userId, { path: '/', maxAge: 60 * 60 * 24 * 30 });
      return res;
    }

    const docRef = dbAdmin.collection('users').doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      // Auto-register
      await docRef.set({
        password: password,
        createdAt: new Date().toISOString()
      });
    } else {
      // Check password
      const data = doc.data();
      if (data?.password !== password) {
        return NextResponse.json({ error: 'パスワードが間違っています' }, { status: 401 });
      }
    }

    // Set Cookie
    const res = NextResponse.json({ success: true });
    res.cookies.set('study_user_id', userId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
    });

    return res;

  } catch (error) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
