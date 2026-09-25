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

  const isTargetSet = profile.targetSchools && profile.targetSchools.length > 0 && !profile.targetSchools[0].includes('未設定');
  const mainTarget = isTargetSet ? profile.targetSchools[0] : '未設定';

  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [isGeneratingSyllabus, setIsGeneratingSyllabus] = useState(false);

  useEffect(() => {
    async function fetchSyllabus() {
      try {
        const res = await fetch('/api/db/daily');
        const data = await res.json();
        if (data.syllabus) {
          setSyllabus(data.syllabus);
        }
      } catch (e) {
        console.error(e);
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
      setSyllabus(data);
      alert('AIによる最適な学習シラバスの構築が完了しました！');
    } catch (e) {
      alert('シラバスの生成に失敗しました。');
    } finally {
      setIsGeneratingSyllabus(false);
    }
  };

  const router = useRouter();

  const handleTaskClick = (taskName: string) => {
    router.push(`/lesson?task=${encodeURIComponent(taskName)}`);
  };

  const closeTaskModal = () => {
    setSelectedTask(null);
    setGeneratedContent('');
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
        <h1 className={styles.title}>学習計画 (シラバス)</h1>
        <p className={styles.subtitle}>
          目標校「<span className="text-gradient font-bold">{mainTarget}</span>」合格に向けたロードマップです。項目をクリックするとAIが解説します。
        </p>
      </header>

      {!isTargetSet ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p>まずはプロフィール設定から目標校を入力してください。</p>
        </div>
      ) : (
        <div className={styles.roadmap}>
          {isGeneratingSyllabus && (
            <div className={styles.loading}>
              <div className={styles.spinner}></div>
              <p>AIが志望校と弱点に基づき、最適なシラバスを構築中...</p>
            </div>
          )}

          {!isGeneratingSyllabus && syllabus.length === 0 && (
            <div className={`glass-panel ${styles.emptyState}`}>
              <p>シラバスがまだ生成されていません。</p>
              <button className="btn btn-primary" onClick={generateSyllabus} style={{ marginTop: '16px' }}>AIにシラバスを構築させる</button>
            </div>
          )}

          {!isGeneratingSyllabus && syllabus.length > 0 && (
            <div style={{ marginBottom: '20px', textAlign: 'right' }}>
              <button className="btn btn-secondary" onClick={generateSyllabus} style={{ fontSize: '0.85rem' }}>🔄 シラバスを再構築 (現在のプロフィールに基づく)</button>
            </div>
          )}

          {!isGeneratingSyllabus && syllabus.length > 0 && syllabus.map((phase: any, pIdx: number) => {
            // Count progress for this phase
            let totalTasks = 0;
            let completedPhaseTasks = 0;
            phase.categories.forEach((cat: any) => {
              cat.tasks.forEach((t: any) => {
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
                
                {phase.categories.map((cat: any, cIdx: number) => (
                  <div key={cIdx} className={styles.majorCategory}>
                    <h3 className={styles.majorTitle}>{cat.name}</h3>
                    <ul className={styles.taskList}>
                      {cat.tasks.map((task: any) => {
                        const isCompleted = profile.completedTasks?.includes(task.title);
                        const isWeakness = task.type === 'weakness';
                        return (
                          <li key={task.id} className={styles.taskItem} onClick={() => handleTaskClick(task.title)} style={{ opacity: isCompleted ? 0.6 : 1, borderLeft: isWeakness ? '3px solid #f59e0b' : 'none' }}>
                            <input type="checkbox" checked={isCompleted} onChange={() => {}} onClick={(e) => toggleTaskCompletion(e, task.title)} style={{ transform: 'scale(1.2)' }} />
                            <span style={{ textDecoration: isCompleted ? 'line-through' : 'none', fontWeight: isWeakness ? 'bold' : 'normal', color: isWeakness ? '#d97706' : 'inherit' }}>
                              {isWeakness ? '【弱点補強】' : ''}{task.title}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
