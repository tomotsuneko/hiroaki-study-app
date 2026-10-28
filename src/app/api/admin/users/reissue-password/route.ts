import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hashPassword, generateRandomPassword } from '@/lib/auth-util';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const body = await req.json();
    const { userId, customPassword, sendEmail = true } = body;

    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDが指定されていません' }, { status: 400 });
    }

    const docRef = dbAdmin.collection('users').doc(userId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    const userData = docSnap.data() || {};
    const newPassword = customPassword?.trim() || generateRandomPassword(10);
    const passwordHash = hashPassword(newPassword);

    await docRef.update({
      password: passwordHash,
      updatedAt: new Date().toISOString(),
      passwordResetAt: new Date().toISOString(),
    });

    let emailSent = false;
    const recipientEmail = userData.email || userData.db?.profile?.email;

    if (sendEmail && recipientEmail) {
      try {
        const mailRes = await sendPasswordResetEmail({
          to: recipientEmail,
          name: userData.name || userData.db?.profile?.name || userId,
          userId,
          tempPassword: newPassword,
        });
        emailSent = mailRes.success;
      } catch (mailErr) {
        console.warn('Failed to send password reset email:', mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `ユーザー「${userId}」のパスワードを再発行しました`,
      tempPassword: newPassword,
      emailSent,
      recipientEmail: recipientEmail || null,
    });
  } catch (error: any) {
    console.error('Reissue Password Error:', error);
    return NextResponse.json({ error: 'パスワード再発行に失敗しました: ' + error.message }, { status: 500 });
  }
}
