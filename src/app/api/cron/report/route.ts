import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { aiModel } from '@/lib/gemini';

export async function GET(req: Request) {
  // 注: 本番環境ではVercel Cron等からの呼び出しかどうかを検証するセキュリティ対策が必要です。
  try {
    const userEmail = process.env.EMAIL_USER;
    const userPass = process.env.EMAIL_PASS;

    if (!userEmail || !userPass) {
      return NextResponse.json({ error: 'Email credentials not set' }, { status: 500 });
    }

    // 今日の学習記録のダミーデータ（本来はFirestoreから取得）
    const todayStudyData = `
    - 学習時間: 2時間30分
    - 取り組んだ科目: 数学II (微分法), 英語 (長文読解)
    - チャットでの質問回数: 4回
    - 正答率: 65%
    `;

    // Geminiにレポート内容を生成させる
    const prompt = `
    あなたは塾のメンターです。高校2年生（理系・日東駒専志望）の保護者（管理者）宛に、本日の学習レポートメールを作成してください。
    
    【本日のデータ】
    ${todayStudyData}
    
    以下の構成で作成してください：
    1. 挨拶と本日の総括
    2. 良かった点（モチベーションが上がるように）
    3. 今後の課題と明日の目標
    `;

    const result = await aiModel.generateContent(prompt);
    const reportContent = await result.response.text();

    // Nodemailerのトランスポーター設定
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: userEmail,
        pass: userPass,
      },
    });

    // メール送信オプション
    const mailOptions = {
      from: `"Abiko Study App" <${userEmail}>`,
      to: 'tomotsunekoichi@gmail.com', // 管理者アドレス
      subject: `【Abiko Study App】本日の学習レポート (${new Date().toLocaleDateString('ja-JP')})`,
      text: reportContent,
    };

    // メール送信実行
    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: 'Report sent successfully' });
  } catch (error) {
    console.error('Report Cron Error:', error);
    return NextResponse.json({ error: 'Failed to send report' }, { status: 500 });
  }
}
