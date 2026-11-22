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
 * ログインURLを解決する（環境変数・リクエストOrigin・既定の本番URLの順でフォールバック）
 */
export const DEFAULT_LOGIN_URL =
  process.env.NEXT_PUBLIC_LOGIN_URL ||
  (process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/login`
    : 'https://hiroaki-study-app.vercel.app/login');

export function resolveLoginUrl(reqUrl?: string, customLoginUrl?: string): string {
  if (
    customLoginUrl &&
    !customLoginUrl.includes('localhost') &&
    !customLoginUrl.includes('127.0.0.1')
  ) {
    return customLoginUrl;
  }
  if (reqUrl) {
    try {
      const origin = new URL(reqUrl).origin;
      if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return `${origin}/login`;
      }
    } catch {
      // ignore invalid URL
    }
  }
  return DEFAULT_LOGIN_URL;
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
  twoFactorEnabled?: boolean;
  loginUrl?: string;
}) {
  const transporter = getTransporter();
  if (!transporter) return { success: false, reason: 'smtp_not_configured' };

  const loginUrl = resolveLoginUrl(undefined, params.loginUrl);

  const validInfo = params.validUntil
    ? `\n■ ご利用有効期間: ${params.validFrom ? params.validFrom.split('T')[0] : '即時'} 〜 ${params.validUntil.split('T')[0]}`
    : '';

  const passwordInfo = params.tempPassword
    ? `\n■ 初期パスワード: ${params.tempPassword}`
    : '';

  const twoFaInfo = params.twoFactorEnabled
    ? '\n■ 二要素認証（2FA）: 有効（ログイン時、このメールアドレス宛に6桁の認証コードが届きます）'
    : '\n■ 二要素認証（2FA）: 無効（※有効化された場合は、ログイン時にこのメールアドレス宛に認証コードが届きます）';

  const text = `
${params.name || params.userId} 様

StudyAI（合格逆算型 AI学習支援システム）のアカウント発行が完了いたしました。
以下のログイン情報および「初回スタートガイド」をご確認のうえ、学習をスタートしてください。

==================================================
1. ログイン情報
==================================================
■ ログインURL: ${loginUrl}
■ ログインID: ${params.userId}${passwordInfo}${validInfo}${twoFaInfo}

※上記URLをブックマーク（お気に入り登録）しておくと便利です。

==================================================
2. 【重要】ログイン後にまず行う「3つの初期ステップ」
==================================================
ログイン直後は、最初に以下の手順で初期設定を行うことで、あなた専用のカリキュラムと学習計画が自動作成されます。

【STEP 1】パスワードの変更（セキュリティ保護）
  1. ログイン後、左側のメニュー最下部にある「⚙️ プロフィール設定」を開きます。
  2. 画面下部の「パスワード変更」欄にて、以下の項目を入力してください。
     ・現在のパスワード：上記メール記載の「初期パスワード」
     ・新しいパスワード：ご自身で決めた「8文字以上」のパスワード（確認用にも同じものを入力）
  3.「パスワードを変更する」ボタンを押して完了です。

【STEP 2】所属情報・志望校・学習科目の設定（AI最適化）
  同じ「⚙️ プロフィール設定」画面の上部で、以下の学習プロフィールを設定してください。
  ・学校の種類（中学校／高校）、学校名、科（コース）、学年、文理区分
  ・希望する学習科目、苦手な分野
  ・目標校（第一〜第三志望）
  ・現在の目安偏差値（※分からない場合は未入力のままで構いません。未入力時は学力判定用のレベルチェックテストが自動で組まれます）
  ・AIチューターの性格（お好みに合わせて選択できます）
  入力後、「設定を保存する」ボタンを押してください。

【STEP 3】専用シラバスの確認 ＆ ワンクリック学習開始
  1. プロフィール保存により、志望校合格から逆算されたあなた専用の「🗺️ 学習シラバス」が自動構築されます（左メニュー「🗺️ 学習シラバス」からいつでも全体計画・再構築・各単元の進捗を確認できます）。
  2. 2回目以降のログイン時や毎日の学習開始時は、左メニュー「📊 ダッシュボード」の最上部にある大きな「▶ 今すぐ学習をはじめる」ボタンを押すだけで、今日取り組むべき教材や演習に迷わず直行できます。

==================================================
3. 日々の学習を効率化する主な機能
==================================================
・📊 ダッシュボード
  その日に取り組む最優先タスク、連続学習日数（ストリーク）、1日の学習予定枠カレンダーを確認できます。

・📖 学習コンテンツ
  全科目の公式テキストの閲覧と、3段階の理解度テスト（L1基礎／L2標準／L3応用）に挑戦できます。
  読んでいる教材の右上にある「🔖 しおりを挟む」を押すと、「📚 学習ノート」からいつでも前回の続きを再開できます。

・📝 AI ドリル (テスト) ＆ 📇 暗記カード
  間違えた問題や苦手単元をAIが自動分析して出題します。暗記カードでは忘却曲線（SRS）や赤シート機能で重要公式・英単語を定着させられます。

・💬 AI チューター ＆ 📈 模試分析
  分からない問題の解説や学習相談をいつでもAIに質問できるほか、模試結果を入力して弱点対策メニューへ直結させられます。

==================================================
4. パスワードをお忘れの場合・お困りの際
==================================================
・パスワードを忘れた場合は、ログイン画面（ ${loginUrl} ）の「パスワードをお忘れですか？」からご登録メールアドレス宛に一時パスワードを再発行できます。
・ご利用期間のご相談やシステムに関するご不明点がございましたら、管理者までお問い合わせください。

目標達成に向けて、StudyAIをぜひご活用ください！
`.trim();

  await transporter.sendMail({
    from: `"StudyAI 管理事務局" <${userEmail}>`,
    to: params.to,
    subject: '【StudyAI】アカウント発行完了と初回スタートガイドのご案内',
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

StudyAIのアカウントパスワードの再発行が実施されました。
以下の新しい一時パスワードでログインしてください。

--------------------------------------------------
■ ログインURL: ${resolveLoginUrl(undefined, params.loginUrl)}
■ ログインID: ${params.userId}
■ 新しい一時パスワード: ${params.tempPassword}
--------------------------------------------------

【ログイン後の手順】
安全のため、ログイン後は左メニュー「⚙️ プロフィール設定」画面下部の「パスワード変更」欄より、8文字以上の新しいパスワードへご変更をお願いいたします。

※本メールに心当たりがない場合は、至急システム管理者までご連絡ください。
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
