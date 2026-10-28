import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { hashPassword, checkAccountPeriod } from '@/lib/auth-util';
import { sendAccountIssuanceEmail } from '@/lib/email';

export async function GET() {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const usersSnapshot = await dbAdmin.collection('users').get();
    const users: any[] = [];

    usersSnapshot.forEach((doc: any) => {
      const data = doc.data() || {};
      const profile = data.db?.profile || {};
      const syllabus = data.db?.syllabus || [];
      const completedTasks = profile.completedTasks || [];

      // 利用期間に基づくステータス動的評価
      let currentStatus = data.status || 'active';
      if (currentStatus === 'active' && data.validUntil) {
        const periodCheck = checkAccountPeriod(data.validFrom, data.validUntil);
        if (!periodCheck.isValid) {
          currentStatus = periodCheck.reason === 'expired' ? 'expired' : 'pending';
        }
      }

      users.push({
        id: doc.id,
        userId: doc.id,
        name: data.name || profile.name || doc.id,
        email: data.email || profile.email || '',
        role: data.role || (doc.id === 'admin' ? 'admin' : 'student'),
        status: currentStatus,
        validFrom: data.validFrom || data.createdAt?.split('T')[0] || '',
        validUntil: data.validUntil || '',
        twoFactorEnabled: Boolean(data.twoFactorEnabled),
        createdAt: data.createdAt || '',
        lastLoginAt: data.lastLoginAt || '',
        taskCount: completedTasks.length,
        hasSyllabus: syllabus.length > 0,
      });
    });

    // ソート: 管理者優先、その後作成日降順
    users.sort((a, b) => {
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (b.role === 'admin' && a.role !== 'admin') return 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    return NextResponse.json({ success: true, users });
  } catch (error: any) {
    console.error('Fetch Users Error:', error);
    return NextResponse.json({ error: 'ユーザー一覧の取得に失敗しました: ' + error.message }, { status: 500 });
  }
}

/**
 * 新規アカウントの発行
 */
export async function POST(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const body = await req.json();
    const {
      userId,
      name,
      email,
      password,
      role = 'student',
      validFrom,
      validUntil,
      twoFactorEnabled = false,
      sendNotificationEmail = false,
    } = body;

    // バリデーション
    if (!userId || !password) {
      return NextResponse.json({ error: 'ユーザーIDと初期パスワードは必須です' }, { status: 400 });
    }

    const cleanUserId = userId.trim();
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(cleanUserId)) {
      return NextResponse.json({ error: 'ユーザーIDは英数字、ハイフン、アンダースコア、ドットのみ使用可能です' }, { status: 400 });
    }

    const userDocRef = dbAdmin.collection('users').doc(cleanUserId);
    const existing = await userDocRef.get();
    if (existing.exists) {
      return NextResponse.json({ error: `ユーザーID「${cleanUserId}」は既に使用されています` }, { status: 409 });
    }

    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    const newUserData = {
      name: name || cleanUserId,
      email: email?.trim() || '',
      password: passwordHash,
      role,
      status: 'active',
      validFrom: validFrom || now.split('T')[0],
      validUntil: validUntil || '',
      twoFactorEnabled: Boolean(twoFactorEnabled),
      createdAt: now,
      updatedAt: now,
      db: {
        profile: {
          name: name || cleanUserId,
          email: email?.trim() || '',
          targetSchool: '',
          weakSubjects: [],
          deviationScore: 50,
          completedTasks: [],
        },
        syllabus: [],
        logs: [],
        studyTime: {},
      },
    };

    await userDocRef.set(newUserData);

    // メール送信チェックがある場合
    let emailSent = false;
    if (sendNotificationEmail && email) {
      try {
        const mailResult = await sendAccountIssuanceEmail({
          to: email.trim(),
          name: name || cleanUserId,
          userId: cleanUserId,
          tempPassword: password,
          validFrom,
          validUntil,
        });
        emailSent = mailResult.success;
      } catch (mailErr) {
        console.warn('Failed to send issuance email:', mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `ユーザー「${cleanUserId}」を発行しました`,
      userId: cleanUserId,
      emailSent,
    });
  } catch (error: any) {
    console.error('Create User Error:', error);
    return NextResponse.json({ error: 'アカウントの発行に失敗しました: ' + error.message }, { status: 500 });
  }
}

/**
 * ユーザー情報の更新
 */
export async function PUT(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const body = await req.json();
    const { userId, name, email, role, status, validFrom, validUntil, twoFactorEnabled } = body;

    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDが指定されていません' }, { status: 400 });
    }

    const userDocRef = dbAdmin.collection('users').doc(userId);
    const existing = await userDocRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: '対象のユーザーが存在しません' }, { status: 404 });
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date().toISOString(),
    };

    if (name !== undefined) {
      updateData.name = name;
      updateData['db.profile.name'] = name;
    }
    if (email !== undefined) {
      updateData.email = email.trim();
      updateData['db.profile.email'] = email.trim();
    }
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (validFrom !== undefined) updateData.validFrom = validFrom;
    if (validUntil !== undefined) updateData.validUntil = validUntil;
    if (twoFactorEnabled !== undefined) updateData.twoFactorEnabled = Boolean(twoFactorEnabled);

    await userDocRef.update(updateData);

    return NextResponse.json({ success: true, message: 'ユーザー情報を更新しました' });
  } catch (error: any) {
    console.error('Update User Error:', error);
    return NextResponse.json({ error: '更新に失敗しました: ' + error.message }, { status: 500 });
  }
}

/**
 * ユーザーの削除
 */
export async function DELETE(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'ユーザーIDが指定されていません' }, { status: 400 });
    }

    if (userId === 'admin') {
      return NextResponse.json({ error: '管理者メインアカウントは削除できません' }, { status: 403 });
    }

    await dbAdmin.collection('users').doc(userId).delete();

    return NextResponse.json({ success: true, message: `ユーザー「${userId}」を削除しました` });
  } catch (error: any) {
    console.error('Delete User Error:', error);
    return NextResponse.json({ error: '削除に失敗しました: ' + error.message }, { status: 500 });
  }
}
