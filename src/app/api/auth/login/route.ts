import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import {
  verifyPassword,
  hashPassword,
  checkAccountPeriod,
  generateTwoFactorOtp,
  generateTemp2FaToken,
} from '@/lib/auth-util';
import { sendTwoFactorCodeEmail } from '@/lib/email';

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

export async function POST(req: Request) {
  try {
    const { userId, password } = await req.json();

    if (!userId || !password) {
      return NextResponse.json({ error: 'IDとパスワードを入力してください' }, { status: 400 });
    }

    if (!dbAdmin) {
      // ローカルモード・フォールバック
      const res = NextResponse.json({ success: true, message: 'Local mode' });
      res.cookies.set('study_user_id', userId, { path: '/', maxAge: 60 * 60 * 24 * 30 });
      return res;
    }

    const cleanUserId = userId.trim();
    const docRef = dbAdmin.collection('users').doc(cleanUserId);
    const doc = await docRef.get();

    if (!doc.exists) {
      // セキュリティ考慮: アカウント存在有無を推測させない統一エラー
      return NextResponse.json({ error: 'ログインIDまたはパスワードが正しくありません' }, { status: 401 });
    }

    const data = doc.data() || {};

    // 1. アカウントステータスチェック
    if (data.status === 'suspended') {
      return NextResponse.json(
        { error: 'このアカウントは現在一時停止されています。管理者にお問い合わせください。' },
        { status: 403 }
      );
    }

    // 2. 利用有効期間チェック
    const periodCheck = checkAccountPeriod(data.validFrom, data.validUntil);
    if (!periodCheck.isValid) {
      if (periodCheck.reason === 'expired') {
        const expiredDate = data.validUntil ? data.validUntil.split('T')[0] : '';
        return NextResponse.json(
          { error: `アカウントのご利用有効期限（${expiredDate}）が終了しています。継続利用は管理者にお問い合わせください。` },
          { status: 403 }
        );
      } else if (periodCheck.reason === 'not_started') {
        const startDate = data.validFrom ? data.validFrom.split('T')[0] : '';
        return NextResponse.json(
          { error: `アカウントのご利用開始日は ${startDate} からとなっております。` },
          { status: 403 }
        );
      }
    }

    // 3. パスワード検証
    const isPasswordValid = verifyPassword(password, data.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: 'ログインIDまたはパスワードが正しくありません' }, { status: 401 });
    }

    // 移行対応: 旧平文パスワードの場合は安全なPBKDF2ハッシュに自動昇格
    if (data.password && !data.password.startsWith('pbkdf2$')) {
      await docRef.update({ password: hashPassword(password) });
    }

    const userEmail = data.email || data.db?.profile?.email;

    // 4. メール二要素認証（2FA）の判定
    if (data.twoFactorEnabled && userEmail) {
      const otpCode = generateTwoFactorOtp();
      const tempToken = generateTemp2FaToken();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10分有効

      await docRef.update({
        pending2FA: {
          token: tempToken,
          code: otpCode,
          expiresAt,
          attempts: 0,
        },
      });

      // メール送信
      try {
        await sendTwoFactorCodeEmail({
          to: userEmail,
          name: data.name || data.db?.profile?.name || cleanUserId,
          code: otpCode,
        });
      } catch (mailErr) {
        console.error('2FA email send error:', mailErr);
      }

      return NextResponse.json({
        success: true,
        require2FA: true,
        tempToken,
        userId: cleanUserId,
        maskedEmail: maskEmail(userEmail),
      });
    }

    // 5. 2FA不要または未設定の場合: 通常ログイン完了
    const now = new Date().toISOString();
    await docRef.update({
      lastLoginAt: now,
      pending2FA: null,
    });

    const res = NextResponse.json({
      success: true,
      userId: cleanUserId,
      role: data.role || (cleanUserId === 'admin' ? 'admin' : 'student'),
    });

    res.cookies.set('study_user_id', cleanUserId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });

    return res;
  } catch (error: any) {
    console.error('Login Error:', error);
    return NextResponse.json({ error: 'サーバーエラー: ' + (error.message || String(error)) }, { status: 500 });
  }
}
