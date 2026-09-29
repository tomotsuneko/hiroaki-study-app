import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const { userId, newPassword } = await req.json();

    if (!userId || !newPassword) {
      return NextResponse.json({ error: 'IDと新しいパスワードを入力してください' }, { status: 400 });
    }

    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const docRef = dbAdmin.collection('users').doc(userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが存在しません' }, { status: 404 });
    }

    await docRef.update({
      password: newPassword
    });

    return NextResponse.json({ success: true, message: 'パスワードをリセットしました' });

  } catch (error: any) {
    console.error('Password Reset Error:', error);
    return NextResponse.json({ error: 'サーバーエラー: ' + (error.message || String(error)) }, { status: 500 });
  }
}
