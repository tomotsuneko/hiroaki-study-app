'use client';

import { useState, useEffect, useMemo } from 'react';
import styles from './dashboard.module.css';
import planStyles from '../plan/plan.module.css';
import Link from 'next/link';
import { useUser } from '@/lib/UserContext';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import React from 'react';
import StudyCalendar from '@/components/StudyCalendar';
import { DayPlan } from '@/lib/db';

function Heatmap({ studyTime }: { studyTime: Record<string, number> }) {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '10px' }}>
      {days.map((day) => {
        const minutes = studyTime?.[day] || 0;
        let opacity = 0.1;
        if (minutes > 0) opacity = 0.35;
        if (minutes > 25) opacity = 0.65;
        if (minutes > 60) opacity = 1.0;

        return (
          <div
            key={day}
            title={`${day}: ${minutes}分`}
            style={{
              width: '16px',
              height: '16px',
              borderRadius: '4px',
              backgroundColor: `rgba(59, 130, 246, ${opacity})`,
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          />
        );
      })}
    </div>
  );
}

const YT_CACHE_KEY = 'ai_tutor_yt_cache_v1';

export default function Dashboard() {
  const {
    profile,
    saveNote,
    studyData,
    updateLocalDailyAnalysis,
    updateLocalDayPlan,
    refreshStudyData,
  } = useUser();

  const [videos, setVideos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiContent, setAiContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRunningBatch, setIsRunningBatch] = useState(false);

  const dailyAnalysis = studyData.dailyAnalysis;
  const recentLogs = studyData.recentLogs;
  const studyTime = studyData.studyTime;
  const syllabus = studyData.syllabus;
  const dayPlans = studyData.dayPlans;
  const feedbackQueue = studyData.feedbackQueue || [];
  const masteredUnits = studyData.masteredUnits || [];
  const materialViews = studyData.materialViews || {};
  const testSummary = studyData.testSummary;
  const rebalanceAlert =
    studyData.syllabusRebalanceAlert || profile.syllabusRebalanceAlert || null;

  // Calculate actual study streak from studyTime & recentLogs
  const streakCount = useMemo(() => {
    const activeDates = new Set<string>();
    Object.entries(studyTime || {}).forEach(([date, mins]) => {
      if ((mins || 0) > 0) activeDates.add(date);
    });
    (recentLogs || []).forEach((l: any) => {
      if (l.timestamp) activeDates.add(l.timestamp.slice(0, 10));
    });
    if (activeDates.size === 0) return 1;
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = d.toISOString().split('T')[0];
      if (activeDates.has(ds)) {
        streak++;
      } else if (i > 0) {
        break;
      }
      d.setDate(d.getDate() - 1);
    }
    return Math.max(1, streak);
  }, [studyTime, recentLogs]);

  const handleSaveDayPlan = async (plan: DayPlan) => {
    updateLocalDayPlan(plan);
    try {
      await fetch('/api/db/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'saveDayPlan', data: plan }),
      });
    } catch (e) {
      console.error('Failed to save day plan', e);
    }
  };

  const runDailyBatch = async () => {
    if (isRunningBatch) return;
    setIsRunningBatch(true);
    try {
      const res = await fetch('/api/cron/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      updateLocalDailyAnalysis(data);
      await refreshStudyData(true);
      alert('日次分析＆本日の事前生成コンテンツ（ドリル・暗記カード）の更新が完了しました！');
    } catch (e) {
      alert('エラーが発生しました。');
    } finally {
      setIsRunningBatch(false);
    }
  };

  const baseSubjects =
    dailyAnalysis?.recommendedSubjects?.length > 0
      ? dailyAnalysis.recommendedSubjects
      : profile.weakSubjects?.length > 0
      ? profile.weakSubjects
      : [];

  const allDefaults = ['英語', '数学', '国語', '物理', '化学'];
  const paddedSubjects = [...baseSubjects];

  if (profile.weakSubjects?.length > 0) {
    for (const sub of profile.weakSubjects) {
      if (paddedSubjects.length >= 3) break;
      const isIncluded = paddedSubjects.some(
        (existing: string) => existing.includes(sub) || sub.includes(existing)
      );
      if (!isIncluded) paddedSubjects.push(sub);
    }
  }

  for (const sub of allDefaults) {
    if (paddedSubjects.length >= 3) break;
    const isIncluded = paddedSubjects.some(
      (existing: string) => existing.includes(sub) || sub.includes(existing)
    );
    if (!isIncluded) paddedSubjects.push(sub);
  }

  const weakSubjects = paddedSubjects.slice(0, 3);
  const currentFocus = weakSubjects[0];

  const cleanAiComment = (rawComment?: string) => {
    if (!rawComment) {
      return `目標校合格に向けて、本日も着実に積み重ねていきましょう！継続が一番の力になります🔥`;
    }
    const cleaned = rawComment
      .split(/3\.\s*\*\*弱点対策\*\*/i)[0]
      .split(/【弱点対策】/i)[0]
      .split(/###\s*弱点対策/i)[0]
      .split(/\*\*弱点対策\*\*/i)[0]
      .trim();

    return cleaned || rawComment;
  };

  const aiSuggestionComment = cleanAiComment(dailyAnalysis?.aiComment);

  // Cache YouTube video lookups in sessionStorage for instant dashboard switches
  useEffect(() => {
    const subjectsKey = JSON.stringify(weakSubjects.slice(0, 3));
    try {
      const cached = sessionStorage.getItem(YT_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.key === subjectsKey && Array.isArray(parsed.videos) && parsed.videos.length > 0) {
          setVideos(parsed.videos);
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    async function fetchVideos() {
      try {
        const subjectsToFetch = weakSubjects.slice(0, 3);
        const promises = subjectsToFetch.map((subject: string) =>
          fetch(`/api/youtube?q=${encodeURIComponent(subject + ' 基礎')}`).then((res) =>
            res.json()
          )
        );
        const results = await Promise.all(promises);

        const allVideos = results.map((data, index) => ({
          subject: subjectsToFetch[index],
          items: data.items || [],
        }));
        setVideos(allVideos);
        try {
          sessionStorage.setItem(
            YT_CACHE_KEY,
            JSON.stringify({ key: subjectsKey, videos: allVideos })
          );
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(weakSubjects)]);

  const mainTarget =
    profile.targetSchools &&
    profile.targetSchools.length > 0 &&
    !profile.targetSchools[0].includes('未設定')
      ? profile.targetSchools[0]
      : '未設定';

  const handleGenerateSuggestion = async () => {
    setShowModal(true);
    // If dailyAnalysis already has learningContents pre-generated by the daily batch, show it immediately!
    if (
      dailyAnalysis?.learningContents &&
      Array.isArray(dailyAnalysis.learningContents) &&
      dailyAnalysis.learningContents.length > 0 &&
      dailyAnalysis.learningContents[0].textMarkdown
    ) {
      const item = dailyAnalysis.learningContents[0];
      setAiContent(`### 🎯 ${item.taskTitle || currentFocus}\n\n${item.textMarkdown}`);
      setIsGenerating(false);
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [],
          message: `現在の目標校「${mainTarget}」に向けて、今の注力課題である「${currentFocus}」について、本日の最適な学習内容を総合的に提案し、ポイントを解説してください。モチベーションが上がるようにお願いします。`,
          profile,
        }),
      });
      const data = await res.json();
      setAiContent(data.text);
    } catch (e) {
      setAiContent('エラーが発生しました。時間をおいてお試しください。');
    } finally {
      setIsGenerating(false);
    }
  };

  const todayStr = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');

  const todayPlan = dayPlans[todayStr];
  const hasPlan = Boolean(todayPlan && todayPlan.targetMinutes && todayPlan.targetMinutes > 0);
  const targetMinutes = todayPlan?.targetMinutes || 0;

  let missionTaskCount = 2;
  let missionGuideMessage = '';

  if (hasPlan) {
    if (targetMinutes <= 90) {
      missionTaskCount = 1;
      missionGuideMessage = `${
        todayPlan.dayType === 'club' ? '🏀' : '⏱️'
      } ${
        todayPlan.dayTypeLabel || '短時間集中'
      }（予定: ${targetMinutes}分）に合わせて、本日は最優先の1タスクに集中して完遂しましょう！`;
    } else if (targetMinutes <= 180) {
      missionTaskCount = targetMinutes >= 150 ? 3 : 2;
      missionGuideMessage = `📖 ${
        todayPlan.dayTypeLabel || '通常学習'
      }（予定: ${targetMinutes}分）に合わせて、${missionTaskCount}つのタスクを着実に進める配分です。`;
    } else {
      missionTaskCount = 4;
      missionGuideMessage = `🔥 ${
        todayPlan.dayTypeLabel || '一日勉強Day'
      }（予定: ${Math.round(
        targetMinutes / 60
      )}時間）に合わせて、複数科目を前進させる4タスクを提示しています！`;
    }
  }

  const completedSet = useMemo(() => {
    return new Set([...(profile.completedTasks || []), ...masteredUnits]);
  }, [profile.completedTasks, masteredUnits]);

  const nextTasks: any[] = [];
  if (syllabus && syllabus.length > 0) {
    for (const phase of syllabus) {
      if (nextTasks.length >= missionTaskCount) break;
      for (const cat of phase.categories || []) {
        if (nextTasks.length >= missionTaskCount) break;
        for (const task of cat.tasks || []) {
          if (!completedSet.has(task.title)) {
            nextTasks.push({
              ...task,
              subjectName: cat.name,
              estMinutes:
                targetMinutes > 0 ? Math.round(targetMinutes / missionTaskCount) : 45,
            });
            if (nextTasks.length >= missionTaskCount) break;
          }
        }
      }
    }
  }

  const totalTextbooksRead = Object.keys(materialViews).length;
  const dueFlashcardsCount = (studyData.flashcards || []).filter((c: any) => {
    if (!c.nextReviewDate && !c.nextReview) return true;
    if (c.nextReview && c.nextReview <= Date.now()) return true;
    if (c.nextReviewDate && c.nextReviewDate <= todayStr) return true;
    return false;
  }).length;

  return (
    <div className={styles.container}>
      {rebalanceAlert && (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            color: '#92400E',
            padding: '14px 20px',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.1)',
            borderLeft: '4px solid #F59E0B',
          }}
        >
          <div>
            <strong style={{ display: 'block', marginBottom: '2px' }}>
              🔔 【学習シラバス自動アップデート】
            </strong>
            <span style={{ fontSize: '0.9rem' }}>{rebalanceAlert.message}</span>
          </div>
          <Link
            href="/plan"
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              whiteSpace: 'nowrap',
              marginLeft: '16px',
              fontSize: '0.88rem',
            }}
          >
            シラバスを確認
          </Link>
        </div>
      )}

      {profile.needsProfileUpdate && (
        <div
          style={{
            backgroundColor: '#FEF08A',
            color: '#854D0E',
            padding: '16px',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            borderLeft: '4px solid #EAB308',
          }}
        >
          <div>
            <strong style={{ display: 'block', marginBottom: '4px' }}>
              🌸 ご進学・進級おめでとうございます！
            </strong>
            <span>
              4月1日を経過したため、学年が上がりました。学校名や科などの新しい所属情報をプロフィールから更新してください。
            </span>
          </div>
          <Link
            href="/profile"
            className="btn btn-primary"
            style={{ padding: '8px 16px', whiteSpace: 'nowrap', marginLeft: '16px' }}
          >
            プロフィールを更新
          </Link>
        </div>
      )}

      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>ダッシュボード</h1>
          <p className={styles.greeting}>
            おかえりなさい、
            <span className="text-gradient" style={{ fontWeight: 'bold' }}>
              {profile.name}
            </span>
            さん！今日の学習を始めましょう。
          </p>
        </div>
        <div className={styles.headerRight} style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={runDailyBatch}
            disabled={isRunningBatch}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem' }}
          >
            {isRunningBatch ? '🔄 バッチ更新中...' : '🔄 日次バッチ更新'}
          </button>
          <div className={styles.streakBadge}>
            <span className={styles.fireIcon}>🔥</span>
            <span className={styles.streakCount}>{streakCount}日連続</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <section
          className={`glass-panel animate-fade-in ${styles.section} ${styles.aiSuggestion}`}
        >
          <div className={styles.aiHeaderRow}>
            <h2 className={styles.sectionTitle} style={{ margin: 0 }}>
              ✨ チューターコメント (日次分析＆学習フィードバック)
            </h2>
            <button
              className="btn btn-primary"
              onClick={handleGenerateSuggestion}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              本日の推奨課題に取り組む
            </button>
          </div>
          <div className={`${styles.aiText} markdown-body`}>
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
              {aiSuggestionComment}
            </ReactMarkdown>
          </div>
        </section>

        {/* 🔄 学習実績の蓄積サマリー ＆ 次回学習へのAIフィードバックパネル */}
        <section
          className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}
          style={{ borderLeft: '4px solid #4F46E5' }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div>
              <h2 className={styles.sectionTitle} style={{ marginBottom: '2px' }}>
                🔄 学習カルテ蓄積状況 ＆ 次の学習へのフィードバック
              </h2>
              <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
                テキスト閲覧・公式テスト・AIドリル・暗記カードの実施結果から、習得認定と重点復習タスクを自動更新しています。
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Link
                href="/drill?mode=recommend"
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '7px 14px' }}
              >
                ⚡ 弱点補強ドリルへ
              </Link>
              <Link
                href="/flashcard"
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '7px 14px' }}
              >
                📇 要復習カード ({dueFlashcardsCount}枚)
              </Link>
            </div>
          </div>

          {/* 4つの蓄積KPI */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: feedbackQueue.length > 0 ? '16px' : '0',
            }}
          >
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                🏆 習得認定単元（シラバス連動）
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>
                {completedSet.size} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>単元</span>
              </div>
            </div>

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                📝 公式テスト実施・通算正答率
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
                {testSummary.overallAccuracy}%{' '}
                <span style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 600 }}>
                  ({testSummary.totalAnswered}問回答)
                </span>
              </div>
            </div>

            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                📘 公式テキスト学習済み
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0284C7', marginTop: '4px' }}>
                {totalTextbooksRead} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>単元</span>
              </div>
            </div>

            <div
              style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '12px 16px',
              }}
            >
              <div style={{ fontSize: '0.78rem', color: '#92400E', fontWeight: 700 }}>
                📌 次回重点補強キュー（正答率75%未満等）
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
                {feedbackQueue.length} <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>件</span>
              </div>
            </div>
          </div>

          {/* 弱点フィードバックキューがある場合の直行アクションリスト */}
          {feedbackQueue.length > 0 && (
            <div
              style={{
                background: '#FFFBEB',
                border: '1px solid #FDE68A',
                borderRadius: '12px',
                padding: '14px 16px',
              }}
            >
              <div
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: '#92400E',
                  marginBottom: '10px',
                }}
              >
                🎯 直近のテスト・ドリル・模試結果から自動抽出された最優先復習テーマ（80%以上達成で自動クリア）：
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {feedbackQueue.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      background: 'white',
                      border: '1px solid #FCD34D',
                      borderRadius: '10px',
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: '#0F172A' }}>
                        {item.subject}: {item.topic}
                      </strong>
                      {item.scorePercent !== undefined && (
                        <span
                          style={{
                            marginLeft: '6px',
                            color: '#B45309',
                            fontWeight: 700,
                            fontSize: '0.76rem',
                          }}
                        >
                          (前回 {item.scorePercent}%)
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Link
                        href={`/lesson?task=${encodeURIComponent(
                          item.topic
                        )}&unit=${encodeURIComponent(item.unitCode || '')}`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        📘 テキスト
                      </Link>
                      <Link
                        href={`/drill?subject=${encodeURIComponent(
                          item.subject
                        )}&topic=${encodeURIComponent(
                          item.topic
                        )}&unit=${encodeURIComponent(item.unitCode || '')}&mode=weakness`}
                        style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          fontWeight: 700,
                          textDecoration: 'none',
                        }}
                      >
                        ⚡ リベンジ演習
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 📅 学習タイムマネジメント・簡易カレンダー */}
        <StudyCalendar
          dayPlans={dayPlans}
          studyTime={studyTime}
          recentLogs={recentLogs}
          onSavePlan={handleSaveDayPlan}
        />

        {nextTasks.length > 0 && (
          <section
            className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}
          >
            <div className={styles.missionHeaderRow}>
              <div>
                <h2 className={styles.sectionTitle} style={{ marginBottom: '2px' }}>
                  🎯 今日のミッション (シラバスから抜粋)
                </h2>
                {missionGuideMessage && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {missionGuideMessage}
                  </p>
                )}
              </div>
              {hasPlan && (
                <span className={styles.missionPlanBadge}>
                  📅 予定時間連動: 計 {targetMinutes}分
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gap: '12px' }}>
              {nextTasks.map((task: any, idx: number) => (
                <Link
                  key={idx}
                  href={
                    task.type === 'diagnostic'
                      ? `/drill?subject=${encodeURIComponent(
                          task.subjectName || ''
                        )}&topic=レベルチェックテスト&mode=diagnostic`
                      : `/lesson?task=${encodeURIComponent(task.title)}`
                  }
                  className={styles.taskCard}
                  style={{
                    borderLeft:
                      task.type === 'weakness' ? '4px solid #f59e0b' : '4px solid #3b82f6',
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 'bold',
                          color: task.type === 'weakness' ? '#d97706' : '#2563eb',
                        }}
                      >
                        {task.type === 'weakness' ? '【弱点克服】' : '【基本ルート】'}
                      </span>
                      {task.subjectName && (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            background: '#e2e8f0',
                            color: '#475569',
                            padding: '1px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {task.subjectName}
                        </span>
                      )}
                    </div>
                    <strong style={{ fontSize: '1.05rem', color: '#1e293b' }}>
                      {task.title}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {task.estMinutes && (
                      <div className={styles.estTimeTag}>目安約 {task.estMinutes}分</div>
                    )}
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#2563EB',
                        background: '#EFF6FF',
                        padding: '4px 10px',
                        borderRadius: '8px',
                      }}
                    >
                      📚 学習する →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section
          className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}
        >
          <h2 className={styles.sectionTitle}>📊 目標達成度</h2>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              marginBottom: '16px',
            }}
          >
            {(
              dailyAnalysis?.achievements ||
              (profile.targetSchools.length > 0 ? profile.targetSchools : ['未設定']).map(
                (s: string, i: number) => ({
                  school: s,
                  level: Math.min(85, Math.max(20, 25 + completedSet.size * 2 - i * 5)),
                })
              )
            )
              .slice(0, 3)
              .map((ach: any, idx: number) => (
                <div key={idx} className={styles.progressItem}>
                  <div className={styles.progressHeader}>
                    <span
                      style={{
                        fontWeight: idx === 0 ? 'bold' : 'normal',
                        color: idx === 0 ? 'var(--accent-primary)' : 'inherit',
                      }}
                    >
                      {idx === 0
                        ? '🎯 第一志望: '
                        : idx === 1
                        ? '🎯 第二志望: '
                        : '🎯 第三志望: '}{' '}
                      {ach.school}
                    </span>
                    <span style={{ fontWeight: 'bold' }}>{ach.level}%</span>
                  </div>
                  <div className={styles.progressBarBg}>
                    <div
                      className={styles.progressBarFill}
                      style={{ width: `${ach.level}%`, opacity: idx === 0 ? 1 : 0.7 }}
                    ></div>
                  </div>
                </div>
              ))}
          </div>

          <h3 className={styles.subTitle}>今週の重点科目（自動算出）</h3>
          <ul className={styles.subjectList}>
            {weakSubjects.map((subject: string, idx: number) => (
              <li key={idx}>
                <span
                  className={styles.subjectDot}
                  style={{
                    backgroundColor:
                      idx === 0 ? '#3b82f6' : idx === 1 ? '#10b981' : '#f59e0b',
                  }}
                ></span>
                {subject}
              </li>
            ))}
          </ul>

          <h3 className={styles.subTitle} style={{ marginTop: '24px' }}>
            🔥 過去30日間の学習ヒートマップ
          </h3>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
              marginBottom: '8px',
            }}
          >
            タイマーや公式テキスト読了で記録された集中学習時間
          </p>
          <Heatmap studyTime={studyTime} />
        </section>

        {videos.length > 0 ? (
          videos.map((subjectData: any) => (
            <section
              key={subjectData.subject}
              className={`glass-panel animate-fade-in ${styles.section} ${styles.videoSection}`}
            >
              <h2 className={styles.sectionTitle}>
                📺 関連授業動画 ({subjectData.subject})
              </h2>
              <div className={styles.videoGrid}>
                {subjectData.items.map((video: any) => (
                  <div
                    key={video.id.videoId}
                    style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                  >
                    <iframe
                      width="100%"
                      height="180"
                      src={`https://www.youtube.com/embed/${video.id.videoId}?rel=0`}
                      title={video.snippet.title}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      style={{
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      }}
                    ></iframe>
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '4px' }}
                      onClick={() => {
                        saveNote(
                          video.snippet.title,
                          `[動画リンク](https://www.youtube.com/watch?v=${video.id.videoId})\n\nここに動画のメモを書き込んでください。`
                        );
                        alert('ノートに動画リンクを保存しました！');
                      }}
                    >
                      📝 ノートに保存して見返す
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <section
            className={`glass-panel animate-fade-in ${styles.section} ${styles.videoSection}`}
          >
            <h2 className={styles.sectionTitle}>📺 関連授業動画 ({currentFocus})</h2>
            <div className={styles.videoGrid}>
              <div className={styles.videoCardPlaceholder}>
                <p>おすすめの動画を検索中...</p>
              </div>
            </div>
          </section>
        )}
      </div>

      {showModal && (
        <div className={planStyles.modalOverlay} onClick={() => setShowModal(false)}>
          <div
            className={`${planStyles.modalContent} ${
              isExpanded ? planStyles.expanded : ''
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={planStyles.modalHeader}>
              <h2 className={planStyles.modalTitle}>本日の推奨学習: {currentFocus}</h2>
              <div className={planStyles.modalControls}>
                <button
                  className={planStyles.iconBtn}
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? '縮小' : '拡大'}
                </button>
                <button
                  className={planStyles.iconBtn}
                  onClick={() => setShowModal(false)}
                >
                  ×
                </button>
              </div>
            </div>

            {isGenerating ? (
              <div className={planStyles.loading}>
                <div className={planStyles.spinner}></div>
                <p>AIが学習のポイントを生成中...</p>
              </div>
            ) : (
              <div className={`${planStyles.generatedContent} markdown-body`}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {aiContent}
                </ReactMarkdown>

                <div className={styles.directLinks}>
                  <h3>🚀 さっそく学習を始める</h3>
                  <div className={styles.linkGrid}>
                    <Link
                      href={`/drill?subject=${encodeURIComponent(currentFocus)}`}
                      className="btn btn-primary"
                    >
                      ✏️ AIドリルを解く
                    </Link>
                    <Link
                      href={`/flashcard?subject=${encodeURIComponent(currentFocus)}`}
                      className="btn btn-secondary"
                    >
                      🗂️ 暗記カード
                    </Link>
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('startPomodoro', { detail: { task: currentFocus } })
                        )
                      }
                      className="btn btn-secondary"
                    >
                      ⏱️ 集中タイマー
                    </button>
                  </div>
                </div>

                <div className={planStyles.modalActions}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      saveNote(`推奨学習: ${currentFocus}`, aiContent);
                      alert('「学習ノート」に保存しました！');
                    }}
                  >
                    ノートに保存
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      (window.location.href = `/chat?initialMessage=${encodeURIComponent(
                        `${currentFocus} の学習を進めたいです。先程の提案の続きからお願いします。`
                      )}`)
                    }
                  >
                    AIとさらに学ぶ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
