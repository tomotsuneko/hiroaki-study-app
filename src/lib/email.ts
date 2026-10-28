import nodemailer from 'nodemailer';

const userEmail = process.env.EMAIL_USER;
const userPass = process.env.EMAIL_PASS;

function getTransporter() {
  if (!userEmail || !userPass) {
    console.warn('Email credentials (EMAIL_USER, EMAIL_PASS) are not configured.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: userEmail,
      pass: userPass,
    },
  });
}

/**
 * 1. 新規アカウント発行通知メール
 */
export async function sendAccountIssuanceEmail(params: {
  to: string;
  name: string;
  userId: string;
  tempPassword?: string;
  validFrom?: string;
  validUntil?: string;
  loginUrl?: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, reason: 'smtp_not_configured' };

  const validInfo = params.validUntil
    ? `\n■ ご利用有効期間: ${params.validFrom ? params.validFrom.split('T')[0] : '即時'} 〜 ${params.validUntil.split('T')[0]}`
    : '';

  const passwordInfo = params.tempPassword
    ? `\n■ 初期パスワード: ${params.tempPassword}\n※初回ログイン後、速やかにパスワードの変更を推奨いたします。`
    : '';

  const text = `
${params.name || params.userId} 様

StudyAI 学習支援システムのアカウントが発行されました。
以下のログイン情報にてシステムにアクセスいただけます。

--------------------------------------------------
■ ログインURL: ${params.loginUrl || 'https://abiko-study-app.vercel.app/login'}
■ ログインID: ${params.userId}${passwordInfo}${validInfo}
--------------------------------------------------

ご不明な点がございましたら、管理者までお問い合わせください。
今後ともよろしくお願いいたします。
`.trim();

  await transporter.sendMail({
    from: `"StudyAI 管理事務局" <${userEmail}>`,
    to: params.to,
    subject: '【StudyAI】アカウント発行完了のお知らせ',
    text,
  });

  return { success: true };
}

/**
 * 2. パスワード再発行通知メール
 */
export async function sendPasswordResetEmail(params: {
  to: string;
  name: string;
  userId: string;
  tempPassword: string;
  loginUrl?: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, reason: 'smtp_not_configured' };

  const text = `
${params.name || params.userId} 様

管理者よりStudyAIのアカウントパスワードの再発行が実施されました。
以下の新しい一時パスワードでログインしてください。

--------------------------------------------------
■ ログインURL: ${params.loginUrl || 'https://abiko-study-app.vercel.app/login'}
■ ログインID: ${params.userId}
■ 新しい一時パスワード: ${params.tempPassword}
--------------------------------------------------

※安全のため、ログイン後はプロフィール画面よりパスワードを変更してください。
心当たりがない場合は、至急システム管理者までご連絡ください。
`.trim();

  await transporter.sendMail({
    from: `"StudyAI セキュリティ通知" <${userEmail}>`,
    to: params.to,
    subject: '【StudyAI】パスワード再発行のお知らせ',
    text,
  });

  return { success: true };
}

/**
 * 3. 二要素認証（2FA）ワンタイムコード通知メール
 */
export async function sendTwoFactorCodeEmail(params: {
  to: string;
  name: string;
  code: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, reason: 'smtp_not_configured' };

  const text = `
${params.name || '利用者'} 様

StudyAI へのログイン認証コードをお知らせします。
以下の6桁の認証コードを画面に入力してログインを完了してください。

==================================================
【認証コード】 ${params.code}
==================================================

※本コードの有効期限は送信後 10分間 です。
※本メールに心当たりがない場合、第三者があなたのアカウントへのログインを試みた可能性があります。速やかにパスワードを変更してください。
`.trim();

  await transporter.sendMail({
    from: `"StudyAI セキュリティ認証" <${userEmail}>`,
    to: params.to,
    subject: `【StudyAI】ログイン認証コード（${params.code}）`,
    text,
  });

  return { success: true };
}
