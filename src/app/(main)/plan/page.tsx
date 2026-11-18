'use client';

import { useState, useEffect, useMemo } from 'react';
import { useUser } from '@/lib/UserContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './plan.module.css';
import {
  buildUnifiedCatalog,
  findMatchingUnitsForTask,
  UnifiedUnit,
  TestRecordSummary,
  ContentItem,
  CurriculumSubject,
} from '@/lib/content-slots';

export default function PlanPage() {
  const {
    profile,
    setProfile,
    clearRebalanceAlert,
    studyData,
    catalog,
    isDataReady,
    updateLocalSyllabus,
  } = useUser();

  const [showCompleted, setShowCompleted] = useState(false);
  const [isGeneratingSyllabus, setIsGeneratingSyllabus] = useState(false);
  const [activeTabs, setActiveTabs] = useState<{ [phaseIdx: number]: number }>({});
  const [selectedPhaseIdx, setSelectedPhaseIdx] = useState<number>(0);
  const [showAllPhases, setShowAllPhases] = useState<boolean>(false);

  // Quick diagnostic modal state
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [customScoreInput, setCustomScoreInput] = useState('');

  const isTargetSet =
    profile.targetSchools &&
    profile.targetSchools.length > 0 &&
    !profile.targetSchools[0].includes('未設定');
  const mainTarget = isTargetSet ? profile.targetSchools[0] : '目標校未設定';
  const hasDeviation = typeof profile.deviationScore === 'number' && profile.deviationScore > 0;

  const syllabus = studyData.syllabus || [];
  const syllabusUpdatedAt = studyData.syllabusUpdatedAt || null;
  const rebalanceAlert =
    studyData.syllabusRebalanceAlert || profile.syllabusRebalanceAlert || null;
  const isLoading = !isDataReady && studyData.curriculum.length === 0;

  const router = useRouter();

  // Dismiss rebalance attention alert
  const handleDismissAlert = async () => {
    clearRebalanceAlert();
    try {
      await fetch('/api/db/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearRebalanceAlert' }),
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Generate or re-generate syllabus
  const generateSyllabus = async (reason?: string) => {
    setIsGeneratingSyllabus(true);
    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile, reason }),
      });
      const data = await res.json();
      if (data.syllabus && Array.isArray(data.syllabus)) {
        updateLocalSyllabus(data.syllabus, data.rebalanceAlert);
        if (data.rebalanceAlert) {
          setProfile({ ...profile, syllabusRebalanceAlert: data.rebalanceAlert });
        }
        alert(
          reason
            ? '学習計画の自動アップデートが完了しました！'
            : 'AIによる逆算学習シラバスの構築が完了しました！'
        );
      } else {
        throw new Error('Invalid format');
      }
    } catch (e) {
      alert('シラバスの生成に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsGeneratingSyllabus(false);
    }
  };

  // Apply quick level check score
  const handleApplyQuickScore = async (score: number) => {
    const updated = {
      ...profile,
      deviationScore: score,
      levelCheckCompleted: true,
      levelCheckResult: {
        score,
        level: score >= 60 ? '応用・発展' : score >= 50 ? '標準' : '基礎徹底',
        evaluatedAt: new Date().toISOString(),
        recommendedFocus:
          score >= 60
            ? '実戦演習と過去問'
            : score >= 50
            ? '標準典型問題の完全網羅'
            : '教科書概念と基礎ドリル',
      },
    };
    setProfile(updated);
    setShowLevelModal(false);

    setIsGeneratingSyllabus(true);
    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: updated, reason: 'level_check' }),
      });
      const data = await res.json();
      if (data.syllabus) {
        updateLocalSyllabus(data.syllabus, data.rebalanceAlert);
        alert(`偏差値目安（${score}）を設定し、シラバスを現在地に合わせて自動再編成しました！`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingSyllabus(false);
    }
  };

  const handleTaskClick = (
    task: any,
    catName?: string,
    unitOverride?: UnifiedUnit | null
  ) => {
    const subjHint = catName || task.catName || '';
    if (task.type === 'diagnostic') {
      router.push(
        `/drill?subject=${encodeURIComponent(
          subjHint || task.title.replace('【学力レベル診断】', '')
        )}&topic=レベルチェックテスト&mode=diagnostic&autostart=1`
      );
    } else {
      const targetUnit =
        unitOverride !== undefined
          ? unitOverride
          : findMatchingUnitsForTask(task.title, subjHint, catalog.units)[0] || null;
      const params = new URLSearchParams();
      if (targetUnit?.unitCode) params.set('unit', targetUnit.unitCode);
      if (task.title) params.set('task', task.title);
      if (subjHint) params.set('subject', subjHint);
      params.set('tab', 'material');
      params.set('direct', '1');
      router.push(`/lesson?${params.toString()}`);
    }
  };

  const toggleTaskCompletion = (e: React.MouseEvent, taskName: string) => {
    e.stopPropagation();
    const currentCompleted = profile.completedTasks || [];
    const newCompleted = currentCompleted.includes(taskName)
      ? currentCompleted.filter((t) => t !== taskName)
      : [...currentCompleted, taskName];
    setProfile({ ...profile, completedTasks: newCompleted });
  };

  const isTaskCompletedOrMastered = (task: any, catName: string): boolean => {
    if ((profile.completedTasks || []).includes(task.title)) return true;
    if ((studyData.masteredUnits || []).includes(task.title)) return true;
    const matched = findMatchingUnitsForTask(task.title, catName, catalog.units);
    if (matched.length > 0 && matched[0].status === 'mastered') return true;
    return false;
  };

  // Calculate overall progress & next pending task (prefer non-diagnostic study unit when available)
  let totalTasksAll = 0;
  let completedTasksAll = 0;
  let firstDiagnosticTask: { title: string; type?: string; catName: string; phaseIdx: number } | null = null;
  let firstStudyPendingTask: { title: string; type?: string; catName: string; phaseIdx: number } | null = null;
  let firstIncompletePhaseIdx = -1;

  for (let pIdx = 0; pIdx < syllabus.length; pIdx++) {
    const phase: any = syllabus[pIdx];
    let phaseIncomplete = false;
    for (const cat of phase.categories || []) {
      for (const t of cat.tasks || []) {
        totalTasksAll++;
        if (isTaskCompletedOrMastered(t, cat.name)) {
          completedTasksAll++;
        } else {
          phaseIncomplete = true;
          if (t.type === 'diagnostic') {
            if (!firstDiagnosticTask) {
              firstDiagnosticTask = { title: t.title, type: t.type, catName: cat.name, phaseIdx: pIdx };
            }
          } else if (!firstStudyPendingTask) {
            firstStudyPendingTask = { title: t.title, type: t.type, catName: cat.name, phaseIdx: pIdx };
          }
        }
      }
    }
    if (phaseIncomplete && firstIncompletePhaseIdx === -1) {
      firstIncompletePhaseIdx = pIdx;
    }
  }
  const nextPendingTask = firstStudyPendingTask || firstDiagnosticTask;
  const overallProgress =
    totalTasksAll === 0 ? 0 : Math.round((completedTasksAll / totalTasksAll) * 100);

  // Sync default phase to first phase with pending tasks when syllabus loads
  useEffect(() => {
    if (firstIncompletePhaseIdx >= 0) {
      setSelectedPhaseIdx(firstIncompletePhaseIdx);
    }
  }, [firstIncompletePhaseIdx]);

  const renderTaskRow = (task: any, catName: string, isCompletedView: boolean) => {
    const isWeakness = task.type === 'weakness';
    const isDiagnostic = task.type === 'diagnostic';
    const matchedUnits = isDiagnostic
      ? []
      : findMatchingUnitsForTask(task.title, catName, catalog.units);
    const primaryUnit: UnifiedUnit | null = matchedUnits.length > 0 ? matchedUnits[0] : null;

    const l1 = primaryUnit?.tests.l1;
    const l2 = primaryUnit?.tests.l2;
    const l3 = primaryUnit?.tests.l3;
    const recL1 = primaryUnit?.testRecords.l1;
    const recL2 = primaryUnit?.testRecords.l2;
    const recL3 = primaryUnit?.testRecords.l3;

    const formatLevelBtnLabel = (label: string, rec?: TestRecordSummary) => {
      if (!rec || rec.answeredCount === 0) return label;
      const acc = Math.round((rec.correctCount / rec.answeredCount) * 100);
      return `${label} (${acc}%)`;
    };

    return (
      <li
        key={task.id}
        className={styles.taskItemRich}
        onClick={() => handleTaskClick(task, catName, primaryUnit)}
        style={{
          opacity: isCompletedView ? 0.68 : 1,
          borderLeft: isDiagnostic
            ? '5px solid #8B5CF6'
            : isWeakness
            ? '5px solid #F59E0B'
            : primaryUnit?.material || (primaryUnit && primaryUnit.tests.all.length > 0)
            ? '5px solid #2563EB'
            : '1px solid #E2E8F0',
          backgroundColor: isDiagnostic ? '#F5F3FF' : '#F8FAFC',
        }}
      >
        <div className={styles.taskMainInfo}>
          <input
            type="checkbox"
            checked={isCompletedView}
            onChange={() => {}}
            onClick={e => toggleTaskCompletion(e, task.title)}
            style={{ transform: 'scale(1.25)', marginTop: '4px', cursor: 'pointer' }}
          />
          <div>
            {/* Unit Code & Breadcrumb */}
            {primaryUnit && (
              <div className={styles.taskMetaTop}>
                {primaryUnit.unitCode && (
                  <span className={styles.unitCodeBadge}>{primaryUnit.unitCode}</span>
                )}
                <span className={styles.unitBreadcrumb}>
                  {primaryUnit.largeName} › {primaryUnit.mediumName}
                </span>
                {primaryUnit.bestAccuracy !== null && (
                  <span
                    className={`${styles.masteryScoreBadge} ${
                      primaryUnit.bestAccuracy >= 80 && primaryUnit.totalAnswered >= 5
                        ? styles.badgeCleared
                        : styles.badgeStudying
                    }`}
                  >
                    {primaryUnit.bestAccuracy >= 80 && primaryUnit.totalAnswered >= 5
                      ? `👑 テスト習得済 (最高正答率 ${primaryUnit.bestAccuracy}%)`
                      : `🔥 テスト演習中 (正答率 ${primaryUnit.bestAccuracy}% / ${primaryUnit.totalAnswered}問回答)`}
                  </span>
                )}
              </div>
            )}

            {/* Task Title */}
            <div
              style={{
                fontWeight: isWeakness || isDiagnostic ? 800 : 700,
                fontSize: '1.02rem',
                color: isCompletedView
                  ? '#64748B'
                  : isDiagnostic
                  ? '#6D28D9'
                  : isWeakness
                  ? '#D97706'
                  : '#0F172A',
                textDecoration: isCompletedView ? 'line-through' : 'none',
              }}
            >
              {isDiagnostic && <span className={styles.diagnosticBadge}>🎯 レベル診断</span>}
              {isWeakness && '【弱点補強】'}
              {task.title}
            </div>
            {primaryUnit &&
              primaryUnit.smallName &&
              primaryUnit.smallName.replace(/[†‡*＊\s]/g, '') !==
                task.title.replace(/[†‡*＊\s]/g, '') && (
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px' }}>
                  📘 直結教材: <strong>{primaryUnit.unitCode || ''}</strong> 「{primaryUnit.smallName}」
                </div>
              )}
          </div>
        </div>

        {/* Direct Content & Test Action Chips */}
        <div className={styles.taskActionGroup} onClick={e => e.stopPropagation()}>
          {isDiagnostic ? (
            <button
              className={styles.actionChip}
              style={{ background: '#7C3AED', color: '#FFFFFF', borderColor: '#7C3AED' }}
              onClick={() => handleTaskClick(task, catName, null)}
            >
              📝 診断テストを受ける →
            </button>
          ) : (
            <>
              {/* Official HTML Textbook Button */}
              {primaryUnit?.material ? (
                <button
                  className={`${styles.actionChip} ${styles.chipMaterial}`}
                  onClick={() => handleTaskClick(task, catName, primaryUnit)}
                  title={`公式学習テキスト (${primaryUnit.material.title}) を開く`}
                >
                  📘 学習テキスト
                </button>
              ) : (
                <button
                  className={`${styles.actionChip} ${styles.chipBookshelf}`}
                  onClick={() => handleTaskClick(task, catName, primaryUnit)}
                  title="AIオンデマンド講義テキスト・動画で学ぶ"
                >
                  🤖 AI講義・動画
                </button>
              )}

              {/* Direct Level Test Buttons (L1 / L2 / L3) */}
              {l1 && (
                <button
                  className={`${styles.actionChip} ${styles.chipL1}`}
                  onClick={() => router.push(`/tests/${encodeURIComponent(l1.id)}`)}
                  title={`${l1.id}（基礎テスト）を直接受験する`}
                >
                  🟢 {formatLevelBtnLabel('L1基礎', recL1)}
                </button>
              )}
              {l2 && (
                <button
                  className={`${styles.actionChip} ${styles.chipL2}`}
                  onClick={() => router.push(`/tests/${encodeURIComponent(l2.id)}`)}
                  title={`${l2.id}（標準テスト）を直接受験する`}
                >
                  🔵 {formatLevelBtnLabel('L2標準', recL2)}
                </button>
              )}
              {l3 && (
                <button
                  className={`${styles.actionChip} ${styles.chipL3}`}
                  onClick={() => router.push(`/tests/${encodeURIComponent(l3.id)}`)}
                  title={`${l3.id}（応用テスト）を直接受験する`}
                >
                  🟠 {formatLevelBtnLabel('L3応用', recL3)}
                </button>
              )}

              {/* Fallback AI Drill if no HTML test is registered */}
              {!l1 && !l2 && !l3 && (
                <button
                  className={`${styles.actionChip} ${styles.chipBookshelf}`}
                  onClick={() =>
                    router.push(
                      `/drill?subject=${encodeURIComponent(
                        catName
                      )}&topic=${encodeURIComponent(
                        primaryUnit?.smallName || task.title
                      )}&unit=${encodeURIComponent(primaryUnit?.unitCode || '')}&autostart=1`
                    )
                  }
                >
                  ✏️ AI演習
                </button>
              )}
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h1 className={styles.title}>🗺️ 学習シラバス</h1>
            <p className={styles.subtitle}>
              目標校「<span className="text-gradient font-bold">{mainTarget}</span>
              」合格から逆算したロードマップと、各単元の「学習テキスト」「レベル別テスト」が直結しています。
            </p>
          </div>
          <Link
            href="/lesson"
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              textDecoration: 'none',
            }}
          >
            📚 学習コンテンツ本棚を開く →
          </Link>
        </div>
      </header>

      {/* 1. Rebalance Attention Banner */}
      {rebalanceAlert && (
        <div className={styles.rebalanceAlertBanner}>
          <div className={styles.rebalanceContent}>
            <span className={styles.rebalanceIcon}>🔔</span>
            <div>
              <div className={styles.rebalanceTitle}>【学習計画を自動アップデートしました】</div>
              <div className={styles.rebalanceText}>{rebalanceAlert.message}</div>
            </div>
          </div>
          <button className={styles.dismissBtn} onClick={handleDismissAlert}>
            確認しました ✕
          </button>
        </div>
      )}

      {/* 2. Unclear Level Warning & Level Check Card */}
      {!hasDeviation && isTargetSet && (
        <div className={styles.levelCheckCard}>
          <div className={styles.levelCheckInfo}>
            <span className={styles.levelCheckIcon}>🎯</span>
            <div>
              <div className={styles.levelCheckTitle}>現在の学力レベル（偏差値）が未診断です</div>
              <div className={styles.levelCheckDesc}>
                現在地と目標校の正確なギャップを測定することで、無理のない最も効率的な学習ルートを組み立てられます。
              </div>
            </div>
          </div>
          <div className={styles.levelCheckActions}>
            <button
              className={styles.btnDiagnostic}
              onClick={() => router.push('/drill?topic=総合実力診断テスト')}
            >
              📝 レベルチェックテストを受ける
            </button>
            <button className={styles.btnSetScore} onClick={() => setShowLevelModal(true)}>
              📊 目安偏差値を設定する
            </button>
          </div>
        </div>
      )}

      {!isTargetSet ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p>まずはプロフィール設定から目標校を入力してください。</p>
          <button
            className="btn btn-primary"
            onClick={() => router.push('/profile')}
            style={{ marginTop: '16px' }}
          >
            ⚙️ プロフィール設定へ
          </button>
        </div>
      ) : isLoading ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <div className={styles.spinner}></div>
          <p style={{ marginTop: '16px' }}>学習シラバスとコンテンツ連携データを読み込み中...</p>
        </div>
      ) : (
        <>
          {/* 3. Compact First-View Hero & Interactive Phase Stepper */}
          {syllabus.length > 0 && (
            <div className={styles.compactHeroCard}>
              <div className={styles.heroTopRow}>
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span className={styles.targetBadge}>🏁 {mainTarget}</span>
                    <span className={styles.currentBadge}>
                      {profile.schoolType === 'junior_high' ? '中学' : '高校'}
                      {profile.grade || 2}年生
                      {hasDeviation ? ` / 偏差値 ${profile.deviationScore}` : ''}
                    </span>
                    <span
                      className={styles.currentBadge}
                      style={{ background: '#ECFDF5', color: '#166534' }}
                    >
                      達成度 {overallProgress}% ({completedTasksAll}/{totalTasksAll}単元)
                    </span>
                  </div>
                  <div className={styles.overallProgressTrack}>
                    <div
                      className={styles.overallProgressFill}
                      style={{ width: `${overallProgress}%` }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {nextPendingTask && (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleTaskClick(nextPendingTask, nextPendingTask.catName)}
                      style={{ padding: '10px 18px', fontSize: '0.92rem' }}
                    >
                      ▶ 次の単元「{nextPendingTask.title.slice(0, 18)}
                      {nextPendingTask.title.length > 18 ? '…' : ''}」へ
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => generateSyllabus('manual_refresh')}
                    style={{ padding: '9px 14px', fontSize: '0.84rem' }}
                  >
                    🔄 再構築
                  </button>
                </div>
              </div>

              {/* Interactive Phase Stepper */}
              <div className={styles.phaseStepperGrid}>
                {syllabus.map((phase: any, idx: number) => {
                  let pTotal = 0;
                  let pDone = 0;
                  (phase.categories || []).forEach((cat: any) => {
                    (cat.tasks || []).forEach((t: any) => {
                      pTotal++;
                      if (isTaskCompletedOrMastered(t, cat.name)) pDone++;
                    });
                  });
                  const pPct = pTotal === 0 ? 0 : Math.round((pDone / pTotal) * 100);
                  const isStepActive = !showAllPhases && selectedPhaseIdx === idx;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setShowAllPhases(false);
                        setSelectedPhaseIdx(idx);
                      }}
                      className={`${styles.phaseStepBtn} ${
                        isStepActive ? styles.phaseStepActive : ''
                      }`}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E3A5F', textTransform: 'uppercase' }}>
                          {phase.phase}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: pPct === 100 ? '#2E7D5B' : '#64748B' }}>
                          {pDone}/{pTotal} ({pPct}%)
                        </span>
                      </div>
                      <div style={{ fontSize: '0.94rem', fontWeight: 700, color: '#0F172A' }}>
                        {phase.title}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748B' }}>
                        {phase.period}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.78rem', color: '#64748B' }}>
                <span>💡 テストで80%以上正解した単元は自動的に習得済みとして反映されます</span>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {syllabusUpdatedAt && (
                    <span>更新: {new Date(syllabusUpdatedAt).toLocaleDateString('ja-JP')}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAllPhases(!showAllPhases)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1E3A5F',
                      fontWeight: 700,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: '0.8rem',
                    }}
                  >
                    {showAllPhases ? '選択中のフェーズのみ表示' : '全フェーズを一覧表示'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 4. Main Syllabus Phases List */}
          <div className={styles.roadmap}>
            {isGeneratingSyllabus && (
              <div
                className={styles.loading}
                style={{
                  margin: '40px 0',
                  padding: '40px',
                  backgroundColor: '#F8FAFC',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  textAlign: 'center',
                }}
              >
                <div
                  className={styles.spinner}
                  style={{
                    margin: '0 auto 20px auto',
                    width: '40px',
                    height: '40px',
                    borderTopColor: '#1E3A5F',
                  }}
                ></div>
                <h3 style={{ color: '#1E293B', marginBottom: '8px' }}>
                  🔄 シラバスをAIが逆算構築中...
                </h3>
                <p style={{ color: '#64748B' }}>
                  目標校への逆算マイルストーン、現在の学力レベル、苦手科目を統合した無理のない学習計画を編成しています。
                  <br />
                  数十秒かかる場合がありますので、このままお待ちください。
                </p>
              </div>
            )}

            {!isGeneratingSyllabus && syllabus.length === 0 && (
              <div
                className={`glass-panel ${styles.emptyState}`}
                style={{ padding: '40px', textAlign: 'center' }}
              >
                <h3 style={{ marginBottom: '12px', color: '#334155' }}>学習計画が未作成です</h3>
                <p style={{ color: '#64748B', marginBottom: '24px' }}>
                  学年や目標校、現在の学力レベルに基づいて、合格から逆算したあなた専用のシラバスを生成します。
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => generateSyllabus()}
                  style={{ padding: '12px 24px', fontSize: '1.1rem' }}
                >
                  ✨ AIに合格逆算シラバスを構築させる
                </button>
              </div>
            )}

            {!isGeneratingSyllabus &&
              syllabus.length > 0 &&
              syllabus.map((phase: any, pIdx: number) => {
                if (!showAllPhases && pIdx !== selectedPhaseIdx) return null;
                let totalTasks = 0;
                let completedPhaseTasks = 0;
                (phase.categories || []).forEach((cat: any) => {
                  (cat.tasks || []).forEach((t: any) => {
                    totalTasks++;
                    if (isTaskCompletedOrMastered(t, cat.name)) completedPhaseTasks++;
                  });
                });
                const progress =
                  totalTasks === 0 ? 0 : Math.round((completedPhaseTasks / totalTasks) * 100);

                return (
                  <div key={pIdx} className={`glass-panel ${styles.phase}`}>
                    <div className={styles.phaseHeader}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div className={styles.phaseBadge}>{phase.phase}</div>
                        <h2>
                          {phase.title}（{phase.period}）
                        </h2>
                        {phase.targetMilestone && (
                          <span
                            style={{
                              fontSize: '0.85rem',
                              color: '#6366F1',
                              fontWeight: 600,
                              background: '#EEF2FF',
                              padding: '2px 8px',
                              borderRadius: '6px',
                            }}
                          >
                            🎯 {phase.targetMilestone}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        {progress}% 完了
                      </div>
                    </div>

                    <div className={styles.tabContainer}>
                      <div className={styles.tabHeader}>
                        {(phase.categories || []).map((cat: any, cIdx: number) => {
                          const totalCatTasks = (cat.tasks || []).length;
                          const completedCatTasks = (cat.tasks || []).filter((task: any) =>
                            isTaskCompletedOrMastered(task, cat.name)
                          ).length;
                          const catProgress =
                            totalCatTasks === 0
                              ? 0
                              : Math.round((completedCatTasks / totalCatTasks) * 100);
                          const isActive = (activeTabs[pIdx] || 0) === cIdx;

                          return (
                            <button
                              key={cIdx}
                              className={`${styles.tabButton} ${isActive ? styles.activeTab : ''}`}
                              onClick={() => setActiveTabs({ ...activeTabs, [pIdx]: cIdx })}
                            >
                              {cat.name}{' '}
                              <span style={{ fontSize: '0.8rem', opacity: 0.8, marginLeft: '4px' }}>
                                ({catProgress}%)
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className={styles.tabContent}>
                        {(phase.categories || []).map((cat: any, cIdx: number) => {
                          const isActive = (activeTabs[pIdx] || 0) === cIdx;
                          if (!isActive) return null;

                          const pendingTasks = (cat.tasks || []).filter(
                            (task: any) => !isTaskCompletedOrMastered(task, cat.name)
                          );
                          const completedTasks = (cat.tasks || []).filter((task: any) =>
                            isTaskCompletedOrMastered(task, cat.name)
                          );

                          if (
                            pendingTasks.length === 0 &&
                            completedTasks.length > 0 &&
                            !showCompleted
                          ) {
                            return (
                              <p
                                key={cIdx}
                                style={{
                                  color: '#64748B',
                                  textAlign: 'center',
                                  padding: '20px',
                                }}
                              >
                                🎉 この科目のすべてのタスクが完了（習得）しました！
                              </p>
                            );
                          }

                          return (
                            <div key={cIdx} className={styles.majorCategory} style={{ margin: 0 }}>
                              <ul className={styles.taskList} style={{ paddingLeft: 0 }}>
                                {pendingTasks.map((task: any) =>
                                  renderTaskRow(task, cat.name, false)
                                )}

                                {showCompleted &&
                                  completedTasks.map((task: any) =>
                                    renderTaskRow(task, cat.name, true)
                                  )}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

            {!isGeneratingSyllabus && syllabus.length > 0 && (
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#64748B',
                    textDecoration: 'underline',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  {showCompleted
                    ? '完了・習得済みのタスクを隠す'
                    : '完了・習得済みのタスクを表示する'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Quick Level Setting Modal */}
      {showLevelModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLevelModal(false)}>
          <div
            className={styles.modalContent}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '520px' }}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>📊 現在の目安偏差値を設定</h3>
              <button className={styles.iconBtn} onClick={() => setShowLevelModal(false)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5 }}>
              直近の模試や定期テストの感触から、近いレベルを選択してください。
              設定したレベルに応じて、AIがシラバスを自動的に最適化します。
            </p>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginTop: '8px',
              }}
            >
              <button
                className="btn btn-secondary"
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => handleApplyQuickScore(45)}
              >
                <div>
                  <strong>基礎徹底コース（目安偏差値 40〜45）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    教科書の基本概念から丁寧にステップアップ
                  </div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => handleApplyQuickScore(52)}
              >
                <div>
                  <strong>標準着実コース（目安偏差値 50〜53）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    基礎〜共通テスト・私大標準の典型問題を完成
                  </div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => handleApplyQuickScore(60)}
              >
                <div>
                  <strong>上位・MARCH突破コース（目安偏差値 58〜62）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    応用演習と入試頻出パターンの網羅
                  </div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{
                  textAlign: 'left',
                  padding: '12px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onClick={() => handleApplyQuickScore(67)}
              >
                <div>
                  <strong>難関・早慶国公立コース（目安偏差値 65〜）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>
                    ハイレベル記述・過去問実践演習を早期開始
                  </div>
                </div>
                <span>選択 →</span>
              </button>
            </div>

            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #E2E8F0',
              }}
            >
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>
                数値を直接入力:
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="80"
                  placeholder="例: 54.0"
                  value={customScoreInput}
                  onChange={e => setCustomScoreInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                  }}
                />
                <button
                  className="btn btn-primary"
                  disabled={!customScoreInput}
                  onClick={() => {
                    const score = parseFloat(customScoreInput);
                    if (!isNaN(score) && score > 0) {
                      handleApplyQuickScore(score);
                    }
                  }}
                >
                  適用
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
