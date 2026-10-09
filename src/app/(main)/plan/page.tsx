'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { useUser } from '@/lib/UserContext';
import { useRouter } from 'next/navigation';
import styles from './plan.module.css';

export default function PlanPage() {
  const { profile, setProfile, clearRebalanceAlert } = useUser();
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isGeneratingSyllabus, setIsGeneratingSyllabus] = useState(false);
  const [activeTabs, setActiveTabs] = useState<{ [phaseIdx: number]: number }>({});
  
  // Quick diagnostic modal state
  const [showLevelModal, setShowLevelModal] = useState(false);
  const [customScoreInput, setCustomScoreInput] = useState('');

  const isTargetSet = profile.targetSchools && profile.targetSchools.length > 0 && !profile.targetSchools[0].includes('未設定');
  const mainTarget = isTargetSet ? profile.targetSchools[0] : '目標校未設定';
  const hasDeviation = typeof profile.deviationScore === 'number' && profile.deviationScore > 0;

  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [syllabusUpdatedAt, setSyllabusUpdatedAt] = useState<string | null>(null);
  const [rebalanceAlert, setRebalanceAlert] = useState<{ reason: string; message: string; timestamp: string } | null>(null);

  const router = useRouter();

  useEffect(() => {
    async function fetchSyllabus() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/db/daily');
        const data = await res.json();
        if (data.syllabus && Array.isArray(data.syllabus)) {
          setSyllabus(data.syllabus);
          setSyllabusUpdatedAt(data.syllabusUpdatedAt || null);
        } else {
          setSyllabus([]);
        }

        // Check rebalance alert from DB or Profile
        if (data.syllabusRebalanceAlert) {
          setRebalanceAlert(data.syllabusRebalanceAlert);
        } else if (profile.syllabusRebalanceAlert) {
          setRebalanceAlert(profile.syllabusRebalanceAlert);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSyllabus();
  }, []);

  // Dismiss rebalance attention alert
  const handleDismissAlert = async () => {
    setRebalanceAlert(null);
    clearRebalanceAlert();
    try {
      await fetch('/api/db/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearRebalanceAlert' })
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
        setSyllabus(data.syllabus);
        setSyllabusUpdatedAt(new Date().toISOString());
        if (data.rebalanceAlert) {
          setRebalanceAlert(data.rebalanceAlert);
          setProfile({ ...profile, syllabusRebalanceAlert: data.rebalanceAlert });
        }
        alert(reason ? '学習計画の自動アップデートが完了しました！' : 'AIによる逆算学習シラバスの構築が完了しました！');
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
        recommendedFocus: score >= 60 ? '実戦演習と過去問' : score >= 50 ? '標準典型問題の完全網羅' : '教科書概念と基礎ドリル'
      }
    };
    setProfile(updated);
    setShowLevelModal(false);

    // Auto-rebalance syllabus with the new level
    setIsGeneratingSyllabus(true);
    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: updated, reason: 'level_check' }),
      });
      const data = await res.json();
      if (data.syllabus) {
        setSyllabus(data.syllabus);
        setSyllabusUpdatedAt(new Date().toISOString());
        alert(`偏差値目安（${score}）を設定し、シラバスを現在地に合わせて自動再編成しました！`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingSyllabus(false);
    }
  };

  const handleTaskClick = (task: any) => {
    if (task.type === 'diagnostic') {
      router.push(`/drill?subject=${encodeURIComponent(task.title.replace('【学力レベル診断】', ''))}&topic=レベルチェックテスト`);
    } else {
      router.push(`/lesson?task=${encodeURIComponent(task.title)}`);
    }
  };

  const toggleTaskCompletion = (e: React.MouseEvent, taskName: string) => {
    e.stopPropagation();
    const currentCompleted = profile.completedTasks || [];
    const newCompleted = currentCompleted.includes(taskName)
      ? currentCompleted.filter(t => t !== taskName)
      : [...currentCompleted, taskName];
    setProfile({ ...profile, completedTasks: newCompleted });
  };

  // Calculate overall progress
  let totalTasksAll = 0;
  let completedTasksAll = 0;
  syllabus.forEach((phase: any) => {
    (phase.categories || []).forEach((cat: any) => {
      (cat.tasks || []).forEach((t: any) => {
        totalTasksAll++;
        if ((profile.completedTasks || []).includes(t.title)) completedTasksAll++;
      });
    });
  });
  const overallProgress = totalTasksAll === 0 ? 0 : Math.round((completedTasksAll / totalTasksAll) * 100);

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>学習シラバス</h1>
        <p className={styles.subtitle}>
          目標校「<span className="text-gradient font-bold">{mainTarget}</span>」合格から逆算したロードマップです。
        </p>
      </header>

      {/* 1. Rebalance Attention Banner (when automatic reorganization occurs) */}
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
            <button
              className={styles.btnSetScore}
              onClick={() => setShowLevelModal(true)}
            >
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
          <p style={{ marginTop: '16px' }}>学習データを読み込み中...</p>
        </div>
      ) : (
        <>
          {/* 3. Reverse Planning Roadmap Summary Card */}
          {syllabus.length > 0 && (
            <div className={styles.roadmapSummaryCard}>
              <div className={styles.summaryHeader}>
                <div className={styles.summaryTitle}>
                  <span>🗺️</span> 合格逆算ロードマップ（現在地と合格までの道筋）
                </div>
                <div className={styles.statusBadges}>
                  <span className={styles.currentBadge}>
                    現在地: {profile.schoolType === 'junior_high' ? '中学' : '高校'}{profile.grade || 2}年生
                    {hasDeviation ? ` / 偏差値 ${profile.deviationScore}` : ' / 偏差値未診断'}
                  </span>
                  <span className={styles.targetBadge}>
                    🏁 第一志望: {mainTarget}
                  </span>
                  <span className={styles.currentBadge} style={{ background: '#ECFDF5', color: '#059669' }}>
                    達成度: {overallProgress}%
                  </span>
                </div>
              </div>

              {/* Milestones Timeline */}
              <div className={styles.milestonesTimeline}>
                {syllabus.map((phase: any, idx: number) => (
                  <div key={idx} className={styles.milestoneStep}>
                    <div className={styles.milestonePhase}>{phase.phase}</div>
                    <div className={styles.milestoneTitle}>{phase.title}</div>
                    <div className={styles.milestonePeriod}>時期: {phase.period}</div>
                    <div className={styles.milestoneGoal}>
                      <strong>🎯 到達目標:</strong> {phase.targetMilestone || '標準典型問題の完成'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Main Syllabus Phases List */}
          <div className={styles.roadmap}>
            {isGeneratingSyllabus && (
              <div className={styles.loading} style={{ margin: '40px 0', padding: '40px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
                <div className={styles.spinner} style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', borderTopColor: '#3B82F6' }}></div>
                <h3 style={{ color: '#1E293B', marginBottom: '8px' }}>🔄 シラバスをAIが逆算構築中...</h3>
                <p style={{ color: '#64748B' }}>
                  目標校への逆算マイルストーン、現在の学力レベル、苦手科目を統合した無理のない学習計画を編成しています。<br/>
                  数十秒かかる場合がありますので、このままお待ちください。
                </p>
              </div>
            )}

            {!isGeneratingSyllabus && syllabus.length === 0 && (
              <div className={`glass-panel ${styles.emptyState}`} style={{ padding: '40px', textAlign: 'center' }}>
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

            {!isGeneratingSyllabus && syllabus.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                {syllabusUpdatedAt && (
                  <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                    最終更新: {new Date(syllabusUpdatedAt).toLocaleString('ja-JP')}
                  </span>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={() => generateSyllabus('manual_refresh')}
                  style={{ fontSize: '0.85rem' }}
                >
                  🔄 最新のプロフィールに基づきシラバスを再構築
                </button>
              </div>
            )}

            {!isGeneratingSyllabus && syllabus.length > 0 && syllabus.map((phase: any, pIdx: number) => {
              let totalTasks = 0;
              let completedPhaseTasks = 0;
              (phase.categories || []).forEach((cat: any) => {
                (cat.tasks || []).forEach((t: any) => {
                  totalTasks++;
                  if ((profile.completedTasks || []).includes(t.title)) completedPhaseTasks++;
                });
              });
              const progress = totalTasks === 0 ? 0 : Math.round((completedPhaseTasks / totalTasks) * 100);

              return (
                <div key={pIdx} className={`glass-panel ${styles.phase}`}>
                  <div className={styles.phaseHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div className={styles.phaseBadge}>{phase.phase}</div>
                      <h2>{phase.title}（{phase.period}）</h2>
                      {phase.targetMilestone && (
                        <span style={{ fontSize: '0.85rem', color: '#6366F1', fontWeight: 600, background: '#EEF2FF', padding: '2px 8px', borderRadius: '6px' }}>
                          🎯 {phase.targetMilestone}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {progress}% 完了
                    </div>
                  </div>

                  <div className={styles.tabContainer}>
                    <div className={styles.tabHeader}>
                      {(phase.categories || []).map((cat: any, cIdx: number) => {
                        const totalCatTasks = (cat.tasks || []).length;
                        const completedCatTasks = (cat.tasks || []).filter((task: any) => profile.completedTasks?.includes(task.title)).length;
                        const catProgress = totalCatTasks === 0 ? 0 : Math.round((completedCatTasks / totalCatTasks) * 100);
                        const isActive = (activeTabs[pIdx] || 0) === cIdx;

                        return (
                          <button
                            key={cIdx}
                            className={`${styles.tabButton} ${isActive ? styles.activeTab : ''}`}
                            onClick={() => setActiveTabs({ ...activeTabs, [pIdx]: cIdx })}
                          >
                            {cat.name} <span style={{ fontSize: '0.8rem', opacity: 0.8, marginLeft: '4px' }}>({catProgress}%)</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className={styles.tabContent}>
                      {(phase.categories || []).map((cat: any, cIdx: number) => {
                        const isActive = (activeTabs[pIdx] || 0) === cIdx;
                        if (!isActive) return null;

                        const pendingTasks = (cat.tasks || []).filter((task: any) => !(profile.completedTasks?.includes(task.title)));
                        const completedTasks = (cat.tasks || []).filter((task: any) => profile.completedTasks?.includes(task.title));

                        if (pendingTasks.length === 0 && completedTasks.length > 0 && !showCompleted) {
                          return (
                            <p key={cIdx} style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>
                              🎉 この科目のすべてのタスクが完了しました！
                            </p>
                          );
                        }

                        return (
                          <div key={cIdx} className={styles.majorCategory} style={{ margin: 0 }}>
                            <ul className={styles.taskList} style={{ paddingLeft: 0 }}>
                              {pendingTasks.map((task: any) => {
                                const isWeakness = task.type === 'weakness';
                                const isDiagnostic = task.type === 'diagnostic';

                                return (
                                  <li
                                    key={task.id}
                                    className={styles.taskItem}
                                    onClick={() => handleTaskClick(task)}
                                    style={{
                                      borderLeft: isDiagnostic
                                        ? '4px solid #8B5CF6'
                                        : isWeakness
                                        ? '4px solid #F59E0B'
                                        : 'none',
                                      backgroundColor: isDiagnostic ? '#F5F3FF' : '#F4F7FE'
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={false}
                                      onChange={() => {}}
                                      onClick={(e) => toggleTaskCompletion(e, task.title)}
                                      style={{ transform: 'scale(1.2)' }}
                                    />
                                    <span style={{ fontWeight: (isWeakness || isDiagnostic) ? 'bold' : 'normal', color: isDiagnostic ? '#6D28D9' : isWeakness ? '#D97706' : 'inherit' }}>
                                      {isDiagnostic && <span className={styles.diagnosticBadge}>🎯 レベル診断</span>}
                                      {isWeakness && '【弱点補強】'}
                                      {task.title}
                                    </span>
                                  </li>
                                );
                              })}

                              {showCompleted && completedTasks.map((task: any) => {
                                const isWeakness = task.type === 'weakness';
                                const isDiagnostic = task.type === 'diagnostic';

                                return (
                                  <li
                                    key={task.id}
                                    className={styles.taskItem}
                                    onClick={() => handleTaskClick(task)}
                                    style={{
                                      opacity: 0.5,
                                      borderLeft: isDiagnostic
                                        ? '4px solid #8B5CF6'
                                        : isWeakness
                                        ? '4px solid #F59E0B'
                                        : 'none',
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={true}
                                      onChange={() => {}}
                                      onClick={(e) => toggleTaskCompletion(e, task.title)}
                                      style={{ transform: 'scale(1.2)' }}
                                    />
                                    <span style={{ textDecoration: 'line-through', color: '#64748B' }}>
                                      {isDiagnostic && '【レベル診断】'}
                                      {isWeakness && '【弱点補強】'}
                                      {task.title}
                                    </span>
                                  </li>
                                );
                              })}
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
                  style={{ background: 'none', border: 'none', color: '#64748B', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.9rem' }}
                >
                  {showCompleted ? '完了済みのタスクを隠す' : '完了済みのタスクを表示する'}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Quick Level Setting Modal */}
      {showLevelModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLevelModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>📊 現在の目安偏差値を設定</h3>
              <button className={styles.iconBtn} onClick={() => setShowLevelModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#64748B', lineHeight: 1.5 }}>
              直近の模試や定期テストの感触から、近いレベルを選択してください。
              設定したレベルに応じて、AIがシラバスを自動的に最適化します。
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => handleApplyQuickScore(45)}
              >
                <div>
                  <strong>基礎徹底コース（目安偏差値 40〜45）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>教科書の基本概念から丁寧にステップアップ</div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => handleApplyQuickScore(52)}
              >
                <div>
                  <strong>標準着実コース（目安偏差値 50〜53）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>基礎〜共通テスト・私大標準の典型問題を完成</div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => handleApplyQuickScore(60)}
              >
                <div>
                  <strong>上位・MARCH突破コース（目安偏差値 58〜62）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>応用演習と入試頻出パターンの網羅</div>
                </div>
                <span>選択 →</span>
              </button>

              <button
                className="btn btn-secondary"
                style={{ textAlign: 'left', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onClick={() => handleApplyQuickScore(67)}
              >
                <div>
                  <strong>難関・早慶国公立コース（目安偏差値 65〜）</strong>
                  <div style={{ fontSize: '0.8rem', color: '#64748B' }}>ハイレベル記述・過去問実践演習を早期開始</div>
                </div>
                <span>選択 →</span>
              </button>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E2E8F0' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#334155' }}>数値を直接入力:</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="number"
                  step="0.1"
                  min="30"
                  max="80"
                  placeholder="例: 54.0"
                  value={customScoreInput}
                  onChange={(e) => setCustomScoreInput(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
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
