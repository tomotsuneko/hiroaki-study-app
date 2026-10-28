import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    const { userId, tempToken, code } = await req.json();

    if (!userId || !tempToken || !code) {
      return NextResponse.json({ error: '認証情報が不足しています' }, { status: 400 });
    }

    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const docRef = dbAdmin.collection('users').doc(userId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const data = docSnap.data() || {};
    const pending = data.pending2FA;

    if (!pending || pending.token !== tempToken) {
      return NextResponse.json(
        { error: '認証セッションが無効です。もう一度最初からログインしてください。' },
        { status: 400 }
      );
    }

    // 有効期限チェック（10分）
    if (Date.now() > pending.expiresAt) {
      await docRef.update({ pending2FA: null });
      return NextResponse.json(
        { error: '認証コードの有効期限が切れています。もう一度ログインして新しいコードを取得してください。' },
        { status: 400 }
      );
    }

    // 試行回数チェック（最大5回）
    if ((pending.attempts || 0) >= 5) {
      await docRef.update({ pending2FA: null });
      return NextResponse.json(
        { error: '認証試行回数の上限を超えました。セキュリティのため最初からログインをやり直してください。' },
        { status: 429 }
      );
    }

    // コード検証
    const inputCode = String(code).trim();
    if (inputCode !== pending.code) {
      await docRef.update({
        'pending2FA.attempts': (pending.attempts || 0) + 1,
      });
      const remaining = 4 - (pending.attempts || 0);
      return NextResponse.json(
        { error: `認証コードが一致しません（残り試行回数: ${Math.max(0, remaining)}回）` },
        { status: 400 }
      );
    }

    // 認証成功: セッション確定
    const now = new Date().toISOString();
    await docRef.update({
      lastLoginAt: now,
      pending2FA: null,
    });

    const res = NextResponse.json({
      success: true,
      userId,
      role: data.role || (userId === 'admin' ? 'admin' : 'student'),
    });

    res.cookies.set('study_user_id', userId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return res;
  } catch (error: any) {
    console.error('Verify 2FA Error:', error);
    return NextResponse.json({ error: '二要素認証の検証に失敗しました: ' + error.message }, { status: 500 });
  }
}
