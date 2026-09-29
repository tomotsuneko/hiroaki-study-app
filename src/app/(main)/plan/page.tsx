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
  const { profile, setProfile, saveNote } = useUser();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);

  const isTargetSet = profile.targetSchools && profile.targetSchools.length > 0 && !profile.targetSchools[0].includes('未設定');
  const mainTarget = isTargetSet ? profile.targetSchools[0] : '未設定';

  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [isGeneratingSyllabus, setIsGeneratingSyllabus] = useState(false);

  useEffect(() => {
    async function fetchSyllabus() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/db/daily');
        const data = await res.json();
        if (data.syllabus && Array.isArray(data.syllabus)) {
          setSyllabus(data.syllabus);
        } else {
          setSyllabus([]);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
    fetchSyllabus();
  }, []);

  const generateSyllabus = async () => {
    setIsGeneratingSyllabus(true);
    try {
      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
         setSyllabus(data);
         alert('AIによる最適な学習シラバスの構築が完了しました！');
      } else {
         throw new Error("Invalid format");
      }
    } catch (e) {
      alert('シラバスの生成に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsGeneratingSyllabus(false);
    }
  };

  const router = useRouter();

  const handleTaskClick = (taskName: string) => {
    router.push(`/lesson?task=${encodeURIComponent(taskName)}`);
  };

  const toggleTaskCompletion = (e: React.MouseEvent, taskName: string) => {
    e.stopPropagation();
    const currentCompleted = profile.completedTasks || [];
    const newCompleted = currentCompleted.includes(taskName) 
      ? currentCompleted.filter(t => t !== taskName)
      : [...currentCompleted, taskName];
    setProfile({ ...profile, completedTasks: newCompleted });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>学習シラバス</h1>
        <p className={styles.subtitle}>
          目標校「<span className="text-gradient font-bold">{mainTarget}</span>」合格に向けたロードマップです。項目をクリックするとAIが解説します。
        </p>
      </header>

      {!isTargetSet ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p>まずはプロフィール設定から目標校を入力してください。</p>
        </div>
      ) : isLoading ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <div className={styles.spinner}></div>
          <p style={{ marginTop: '16px' }}>学習データを読み込み中...</p>
        </div>
      ) : (
        <div className={styles.roadmap}>
          {isGeneratingSyllabus && (
            <div className={styles.loading} style={{ margin: '40px 0', padding: '40px', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
              <div className={styles.spinner} style={{ margin: '0 auto 20px auto', width: '40px', height: '40px', borderTopColor: '#3B82F6' }}></div>
              <h3 style={{ color: '#1E293B', marginBottom: '8px' }}>🔄 シラバスを生成中...</h3>
              <p style={{ color: '#64748B' }}>あなたの学校の進度や目標校のレベルに合わせて、専用の学習計画をAIが構築しています。<br/>数十秒かかる場合がありますので、このままお待ちください。</p>
            </div>
          )}

          {!isGeneratingSyllabus && syllabus.length === 0 && (
            <div className={`glass-panel ${styles.emptyState}`} style={{ padding: '40px', textAlign: 'center' }}>
              <h3 style={{ marginBottom: '12px', color: '#334155' }}>学習計画が未作成です</h3>
              <p style={{ color: '#64748B', marginBottom: '24px' }}>目標校やプロフィールに基づいて、あなた専用のシラバスを生成します。</p>
              <button className="btn btn-primary" onClick={generateSyllabus} style={{ padding: '12px 24px', fontSize: '1.1rem' }}>
                ✨ AIにシラバスを構築させる
              </button>
            </div>
          )}

          {!isGeneratingSyllabus && syllabus.length > 0 && (
            <div style={{ marginBottom: '20px', textAlign: 'right' }}>
              <button className="btn btn-secondary" onClick={generateSyllabus} style={{ fontSize: '0.85rem' }}>🔄 シラバスを再構築 (現在のプロフィールに基づく)</button>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className={styles.phaseBadge}>{phase.phase}</div>
                    <h2>{phase.title}（{phase.period}）</h2>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    {progress}% 完了
                  </div>
                </div>
                
                {(phase.categories || []).map((cat: any, cIdx: number) => {
                  const pendingTasks = (cat.tasks || []).filter((task: any) => !(profile.completedTasks?.includes(task.title)));
                  const completedTasks = (cat.tasks || []).filter((task: any) => profile.completedTasks?.includes(task.title));
                  
                  if (pendingTasks.length === 0 && completedTasks.length > 0 && !showCompleted) {
                    return null; // Category fully complete, hide if not showing completed
                  }

                  return (
                  <div key={cIdx} className={styles.majorCategory}>
                    <h3 className={styles.majorTitle}>{cat.name}</h3>
                    <ul className={styles.taskList}>
                      {pendingTasks.map((task: any) => {
                        const isWeakness = task.type === 'weakness';
                        return (
                          <li key={task.id} className={styles.taskItem} onClick={() => handleTaskClick(task.title)} style={{ borderLeft: isWeakness ? '3px solid #f59e0b' : 'none' }}>
                            <input type="checkbox" checked={false} onChange={() => {}} onClick={(e) => toggleTaskCompletion(e, task.title)} style={{ transform: 'scale(1.2)' }} />
                            <span style={{ fontWeight: isWeakness ? 'bold' : 'normal', color: isWeakness ? '#d97706' : 'inherit' }}>
                              {isWeakness ? '【弱点補強】' : ''}{task.title}
                            </span>
                          </li>
                        )
                      })}
                      
                      {showCompleted && completedTasks.map((task: any) => {
                        const isWeakness = task.type === 'weakness';
                        return (
                          <li key={task.id} className={styles.taskItem} onClick={() => handleTaskClick(task.title)} style={{ opacity: 0.5, borderLeft: isWeakness ? '3px solid #f59e0b' : 'none' }}>
                            <input type="checkbox" checked={true} onChange={() => {}} onClick={(e) => toggleTaskCompletion(e, task.title)} style={{ transform: 'scale(1.2)' }} />
                            <span style={{ textDecoration: 'line-through', fontWeight: isWeakness ? 'bold' : 'normal', color: isWeakness ? '#d97706' : 'inherit' }}>
                              {isWeakness ? '【弱点補強】' : ''}{task.title}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  );
                })}
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
      )}

    </div>
  );
}
