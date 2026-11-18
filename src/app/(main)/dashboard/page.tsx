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
  const [activeBottomTab, setActiveBottomTab] = useState<'analytics' | 'videos'>('analytics');

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

  // 過去7日間の習慣トラッキング
  const last7Days = useMemo(() => {
    const activeDates = new Set<string>();
    Object.entries(studyTime || {}).forEach(([date, mins]) => {
      if ((mins || 0) > 0) activeDates.add(date);
    });
    (recentLogs || []).forEach((l: any) => {
      if (l.timestamp) activeDates.add(l.timestamp.slice(0, 10));
    });
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const result: { dateStr: string; label: string; active: boolean; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      result.push({
        dateStr,
        label: weekdays[d.getDay()],
        active: activeDates.has(dateStr) || (i === 0 && streakCount >= 1),
        isToday: i === 0,
      });
    }
    return result;
  }, [studyTime, recentLogs, streakCount]);

  // ファーストビューの主役となる「次にやるべき1つ」
  const primaryFeedback = feedbackQueue.length > 0 ? feedbackQueue[0] : null;
  const primaryTask = nextTasks.length > 0 ? nextTasks[0] : null;
  const primaryActionHref = primaryFeedback
    ? `/drill?subject=${encodeURIComponent(primaryFeedback.subject)}&topic=${encodeURIComponent(
        primaryFeedback.topic
      )}&unit=${encodeURIComponent(primaryFeedback.unitCode || '')}&mode=weakness`
    : primaryTask
    ? primaryTask.type === 'diagnostic'
      ? `/drill?subject=${encodeURIComponent(
          primaryTask.subjectName || ''
        )}&topic=レベルチェックテスト&mode=diagnostic`
      : `/lesson?task=${encodeURIComponent(primaryTask.title)}`
    : `/lesson?task=${encodeURIComponent(currentFocus)}`;

  const primaryActionTitle = primaryFeedback
    ? `【弱点リベンジ】${primaryFeedback.subject}: ${primaryFeedback.topic}`
    : primaryTask
    ? primaryTask.title
    : `${currentFocus} の学習を進める`;

  const primaryActionReason = primaryFeedback
    ? `直近テスト正答率 ${primaryFeedback.scorePercent ?? '-'}% の優先復習テーマです（80%以上でクリア）`
    : primaryTask
    ? `${primaryTask.subjectName || '重点ルート'} ・ 目安約 ${primaryTask.estMinutes || 40}分`
    : `志望校「${mainTarget}」に向けたAI推奨フォーカス科目`;

  const achievementsList =
    dailyAnalysis?.achievements ||
    (profile.targetSchools.length > 0 ? profile.targetSchools : ['未設定']).map(
      (s: string, i: number) => ({
        school: s,
        level: Math.min(85, Math.max(20, 25 + completedSet.size * 2 - i * 5)),
      })
    );
  const mainAchievement = achievementsList[0] || { school: mainTarget, level: 25 };

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
        <div>
          <h1 className={styles.title}>ダッシュボード</h1>
          <p className={styles.greeting}>
            おかえりなさい、<strong>{profile.name}</strong>さん！今日も一歩ずつ進めましょう。
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {mainTarget !== '未設定' && (
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#1E3A5F',
                background: '#EEF2F6',
                border: '1px solid #CBD5E1',
                padding: '6px 12px',
                borderRadius: '999px',
              }}
            >
              🏁 目標: {mainTarget}
            </span>
          )}
          <button
            onClick={runDailyBatch}
            disabled={isRunningBatch}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '7px 14px' }}
          >
            {isRunningBatch ? '🔄 更新中...' : '🔄 最新データに更新'}
          </button>
        </div>
      </header>

      {/* =========================================================
          FIRST VIEW: ワンタップ開始 & 継続ストリーク
         ========================================================= */}
      <div className={styles.heroGrid}>
        {/* Left: Primary Next Action + Today's Mission */}
        <section className={styles.nextStepCard}>
          <div>
            <div className={styles.nextStepBadgeRow}>
              <span className={styles.nextStepEyebrow}>
                🎯 {primaryFeedback ? '最優先のリベンジ課題' : '今日まず取り組む1ステップ'}
              </span>
              {hasPlan ? (
                <span className={styles.missionPlanBadge}>📅 今日の予定 {targetMinutes}分</span>
              ) : (
                <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  カレンダーで予定設定可能
                </span>
              )}
            </div>

            <h2 className={styles.nextStepTitle} style={{ marginTop: '12px' }}>
              {primaryActionTitle}
            </h2>
            <p className={styles.nextStepSub}>{primaryActionReason}</p>
          </div>

          <div className={styles.heroCtaRow}>
            <Link href={primaryActionHref} className={styles.primaryStartBtn}>
              ▶ 今すぐ学習をはじめる
            </Link>
            <Link href="/drill?mode=recommend" className={styles.secondaryQuickBtn}>
              ⚡ 弱点ドリル
            </Link>
            <Link href="/flashcard" className={styles.secondaryQuickBtn}>
              📇 暗記カード ({dueFlashcardsCount}枚)
            </Link>
          </div>

          {nextTasks.length > 0 && (
            <div className={styles.compactMissionList}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#475569',
                }}
              >
                <span>📋 今日のミッション（シラバス連動・計 {nextTasks.length}件）</span>
                <Link href="/plan" style={{ color: '#1E3A5F', textDecoration: 'underline' }}>
                  全体計画 →
                </Link>
              </div>
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
                  className={styles.compactMissionRow}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '6px',
                        background: task.type === 'weakness' ? '#FEF3C7' : '#EEF2F6',
                        color: task.type === 'weakness' ? '#92400E' : '#1E3A5F',
                        flexShrink: 0,
                      }}
                    >
                      {task.subjectName || (task.type === 'weakness' ? '弱点' : '重点')}
                    </span>
                    <span
                      style={{
                        fontSize: '0.92rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {task.title}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', flexShrink: 0 }}>
                    約{task.estMinutes || 40}分 →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* Compact AI Comment Bar */}
          <div className={styles.aiStrip}>
            <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>✨</span>
            <div className={styles.aiStripText}>
              {aiSuggestionComment.replace(/[#*_`]/g, '')}
            </div>
            <button
              type="button"
              onClick={handleGenerateSuggestion}
              style={{
                flexShrink: 0,
                padding: '5px 10px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#1E3A5F',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              解説を見る
            </button>
          </div>
        </section>

        {/* Right: Habit Streak + Progress & KPIs */}
        <section className={styles.habitCard}>
          {/* Prominent Streak Hero */}
          <div className={styles.streakHero}>
            <div>
              <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#92400E' }}>
                🔥 継続記録（ストリーク）
              </div>
              <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#78350F', lineHeight: 1.2 }}>
                {streakCount}日連続 達成中！
              </div>
            </div>
            <span style={{ fontSize: '2rem' }}>🔥</span>
          </div>

          {/* 7-Day Activity Dots */}
          <div>
            <div
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#64748B',
                marginBottom: '8px',
              }}
            >
              直近7日間の学習リズム
            </div>
            <div className={styles.weekDotsRow}>
              {last7Days.map((d) => (
                <div key={d.dateStr} className={styles.weekDotCol}>
                  <div
                    className={`${styles.weekDotCircle} ${d.active ? styles.weekDotActive : ''}`}
                    title={d.dateStr}
                  >
                    {d.active ? '✓' : ''}
                  </div>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: d.isToday ? 800 : 600,
                      color: d.isToday ? '#1E3A5F' : '#64748B',
                    }}
                  >
                    {d.isToday ? '今日' : d.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Primary Goal Progress Bar */}
          <div
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '12px 14px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.84rem',
                fontWeight: 700,
                marginBottom: '8px',
              }}
            >
              <span style={{ color: '#0F172A' }}>🎯 {mainAchievement.school}</span>
              <span style={{ color: '#1E3A5F' }}>{mainAchievement.level}%</span>
            </div>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${mainAchievement.level}%`, background: '#1E3A5F' }}
              />
            </div>
          </div>

          {/* 3 Compact KPIs */}
          <div className={styles.kpiMiniGrid}>
            <div className={styles.kpiMiniTile}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>習得認定</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                {completedSet.size}
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>単元</span>
              </div>
            </div>
            <div className={styles.kpiMiniTile}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>テスト正答</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#2E7D5B', marginTop: '2px' }}>
                {testSummary.overallAccuracy}%
              </div>
            </div>
            <div className={styles.kpiMiniTile}>
              <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 700 }}>テキスト</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E3A5F', marginTop: '2px' }}>
                {totalTextbooksRead}
                <span style={{ fontSize: '0.72rem', fontWeight: 600 }}>冊</span>
              </div>
            </div>
          </div>

          {feedbackQueue.length > 0 && (
            <div style={{ fontSize: '0.78rem', color: '#92400E', background: '#FFFBEB', padding: '8px 10px', borderRadius: '8px', border: '1px solid #FDE68A' }}>
              📌 要復習キューが <strong>{feedbackQueue.length}件</strong> あります →{' '}
              <Link href="/drill?mode=recommend" style={{ fontWeight: 800, textDecoration: 'underline', color: '#92400E' }}>
                一覧を見る
              </Link>
            </div>
          )}
        </section>
      </div>

      {/* =========================================================
          SECOND LAYER: カレンダー & ドリルダウン詳細
         ========================================================= */}
      <div className={styles.grid}>
        {/* 📅 学習タイムマネジメント・簡易カレンダー */}
        <StudyCalendar
          dayPlans={dayPlans}
          studyTime={studyTime}
          recentLogs={recentLogs}
          onSavePlan={handleSaveDayPlan}
        />

        {/* Progressive Disclosure Panel: 詳細進捗 or 関連動画 */}
        <section className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              borderBottom: '1px solid #E2E8F0',
              paddingBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setActiveBottomTab('analytics')}
                className={activeBottomTab === 'analytics' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ padding: '7px 14px', fontSize: '0.86rem' }}
              >
                📊 目標達成度・30日ヒートマップ
              </button>
              <button
                type="button"
                onClick={() => setActiveBottomTab('videos')}
                className={activeBottomTab === 'videos' ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ padding: '7px 14px', fontSize: '0.86rem' }}
              >
                📺 関連授業動画 ({videos.length})
              </button>
            </div>
            <Link
              href="/exam-analysis"
              style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E3A5F' }}
            >
              📈 模試・成績分析を見る →
            </Link>
          </div>

          {activeBottomTab === 'analytics' ? (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px',
                  marginBottom: '16px',
                }}
              >
                {achievementsList.slice(0, 3).map((ach: any, idx: number) => (
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

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>
                  今週の重点科目:
                </span>
                {weakSubjects.map((subject: string, idx: number) => (
                  <span
                    key={idx}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.86rem',
                      background: '#F1F5F9',
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontWeight: 600,
                    }}
                  >
                    <span
                      className={styles.subjectDot}
                      style={{
                        backgroundColor:
                          idx === 0 ? '#1E3A5F' : idx === 1 ? '#2E7D5B' : '#B47B2B',
                      }}
                    ></span>
                    {subject}
                  </span>
                ))}
              </div>

              <h3 className={styles.subTitle} style={{ marginTop: '12px' }}>
                🔥 過去30日間の学習ヒートマップ
              </h3>
              <Heatmap studyTime={studyTime} />
            </div>
          ) : videos.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {videos.map((subjectData: any) => (
                <div key={subjectData.subject}>
                  <h3 className={styles.subTitle} style={{ marginBottom: '10px', marginTop: 0 }}>
                    📺 {subjectData.subject}
                  </h3>
                  <div className={styles.videoGrid}>
                    {subjectData.items.map((video: any) => (
                      <div
                        key={video.id.videoId}
                        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
                      >
                        <iframe
                          width="100%"
                          height="170"
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
                          style={{ fontSize: '0.8rem', padding: '5px' }}
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
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.videoCardPlaceholder}>
              <p>おすすめの授業動画を読み込み中です...</p>
            </div>
          )}
        </section>
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
