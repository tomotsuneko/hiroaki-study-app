import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hashPassword, generateRandomPassword } from '@/lib/auth-util';
import { sendPasswordResetEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { identifier } = await req.json();

    if (!identifier || !identifier.trim()) {
      return NextResponse.json({ error: 'ユーザーIDまたはメールアドレスを入力してください' }, { status: 400 });
    }

    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const cleanInput = identifier.trim();

    // 1. まずuserId直接検索
    let userDoc = await dbAdmin.collection('users').doc(cleanInput).get();
    let userId = cleanInput;

    // 2. なければemailで検索
    if (!userDoc.exists) {
      const emailSnap = await dbAdmin.collection('users').where('email', '==', cleanInput).limit(1).get();
      if (!emailSnap.empty) {
        userDoc = emailSnap.docs[0];
        userId = userDoc.id;
      }
    }

    // 3. なければprofile.emailで検索
    if (!userDoc.exists) {
      const profileEmailSnap = await dbAdmin
        .collection('users')
        .where('db.profile.email', '==', cleanInput)
        .limit(1)
        .get();
      if (!profileEmailSnap.empty) {
        userDoc = profileEmailSnap.docs[0];
        userId = userDoc.id;
      }
    }

    // セキュリティ対策（アカウント列挙耐性）:
    // ユーザーが見つからなくても、常に成功メッセージを返却
    if (!userDoc.exists) {
      return NextResponse.json({
        success: true,
        message: '該当するアカウントが登録されている場合、パスワード再発行案内メールを送信しました。',
      });
    }

    const userData = userDoc.data() || {};
    const recipientEmail = userData.email || userData.db?.profile?.email;

    if (recipientEmail) {
      const tempPassword = generateRandomPassword(10);
      const passwordHash = hashPassword(tempPassword);

      await userDoc.ref.update({
        password: passwordHash,
        updatedAt: new Date().toISOString(),
        passwordResetAt: new Date().toISOString(),
      });

      try {
        await sendPasswordResetEmail({
          to: recipientEmail,
          name: userData.name || userData.db?.profile?.name || userId,
          userId,
          tempPassword,
        });
      } catch (mailErr) {
        console.error('Failed to send reset email:', mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: '該当するアカウントが登録されている場合、パスワード再発行案内メールを送信しました。',
    });
  } catch (error: any) {
    console.error('Forgot Password Error:', error);
    return NextResponse.json({ error: 'リクエストの処理に失敗しました: ' + error.message }, { status: 500 });
  }
}
