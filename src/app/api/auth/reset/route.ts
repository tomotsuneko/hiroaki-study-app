import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getSessionFromCookies } from '@/lib/session';
import { verifyPassword, hashPassword } from '@/lib/auth-util';

export async function POST(req: Request) {
  try {
    const session = await getSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 });
    }

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: '現在のパスワードと新しいパスワードを入力してください' },
        { status: 400 }
      );
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: '新しいパスワードは8文字以上で設定してください' },
        { status: 400 }
      );
    }

    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const docRef = dbAdmin.collection('users').doc(session.userId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'ユーザーが存在しません' }, { status: 404 });
    }

    const data = doc.data() || {};
    if (!data.password || !verifyPassword(currentPassword, data.password)) {
      return NextResponse.json({ error: '現在のパスワードが正しくありません' }, { status: 403 });
    }

    await docRef.update({
      password: hashPassword(newPassword),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, message: 'パスワードを変更しました' });
  } catch (error: any) {
    console.error('Password Change Error:', error);
    return NextResponse.json(
      { error: 'サーバーエラー: ' + (error.message || String(error)) },
      { status: 500 }
    );
  }
}
