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

    // 1. Fetch all users from Firestore
    const { dbAdmin } = require('@/lib/firebase-admin');
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firestore is not initialized' }, { status: 500 });
    }

    const todayDateStr = new Date().toISOString().split('T')[0];
    const snapshot = await dbAdmin.collection('users').get();
    let combinedReportContent = `【Abiko Study App】本日の学習レポート\n\n`;

    // 2. Iterate through users to aggregate real data
    for (const doc of snapshot.docs) {
      const userId = doc.id;
      const data = doc.data()?.db || {};
      
      const studyTimeToday = data.studyTime?.[todayDateStr] || 0;
      const logsToday = (data.logs || []).filter((log: any) => log.timestamp?.startsWith(todayDateStr));
      
      // Filter out tasks worked on today
      const tasksWorkedOn = logsToday
        .filter((l: any) => l.type === 'pomodoro' && l.data?.task)
        .map((l: any) => l.data.task);
      const uniqueTasks = Array.from(new Set(tasksWorkedOn)).join(', ') || 'なし';
      
      const chatQuestionsCount = logsToday.filter((l: any) => l.type === 'chat').length;
      
      // Calculate drill accuracy if any
      const drillLogs = logsToday.filter((l: any) => l.type === 'drill');
      let accuracyText = '実施なし';
      if (drillLogs.length > 0) {
         let totalQ = 0, correctQ = 0;
         drillLogs.forEach((l: any) => {
            if (l.data?.total) totalQ += l.data.total;
            if (l.data?.score) correctQ += l.data.score;
         });
         accuracyText = totalQ > 0 ? `${Math.round((correctQ / totalQ) * 100)}%` : 'データなし';
      }

      // Skip users with 0 study time today to avoid spam, unless they are the only ones
      if (studyTimeToday === 0 && snapshot.docs.length > 1) {
        continue; 
      }

      const todayStudyData = `
      生徒ID: ${userId}
      - 本日の学習時間: ${studyTimeToday}分
      - 取り組んだタスク: ${uniqueTasks}
      - AIへの質問回数: ${chatQuestionsCount}回
      - ドリル正答率: ${accuracyText}
      `;

      // 3. Generate Gemini report for this user
      const prompt = `
      あなたは塾のメンターです。高校2年生（理系・日東駒専志望）の保護者（管理者）宛に、この生徒の学習状況を報告してください。
      
      【本日のデータ】
      ${todayStudyData}
      
      以下の構成で簡潔に作成してください（合計300文字程度）：
      1. ${userId}さんの本日の総括
      2. 良かった点（モチベーションが上がるように）
      3. 今後の課題と明日の目標
      `;

      const result = await aiModel.generateContent(prompt);
      combinedReportContent += `==============================\n`;
      combinedReportContent += await result.response.text() + `\n\n`;
    }

    if (combinedReportContent === `【Abiko Study App】本日の学習レポート\n\n`) {
      combinedReportContent += "本日は学習活動が記録されていません。明日の学習に期待しましょう！\n";
    }

    // 4. Send the aggregated email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: userEmail,
        pass: userPass,
      },
    });

    const mailOptions = {
      from: `"Abiko Study App" <${userEmail}>`,
      to: 'tomotsunekoichi@gmail.com', // 管理者アドレス
      subject: `【Abiko Study App】学習進捗レポート (${new Date().toLocaleDateString('ja-JP')})`,
      text: combinedReportContent,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, message: 'Report sent successfully' });
  } catch (error: any) {
    console.error('Report Cron Error:', error);
    return NextResponse.json({ error: 'Failed to send report: ' + String(error.message) }, { status: 500 });
  }
}
