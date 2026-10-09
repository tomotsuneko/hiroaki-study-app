'use client';

import { useState, useEffect } from 'react';
import styles from './dashboard.module.css';
import planStyles from '../plan/plan.module.css'; // Reuse modal styles
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
  // 過去30日間の日付を生成
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().split('T')[0];
  });

  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '10px' }}>
      {days.map(day => {
        const minutes = studyTime?.[day] || 0;
        let opacity = 0.1;
        if (minutes > 0) opacity = 0.3;
        if (minutes > 25) opacity = 0.6;
        if (minutes > 60) opacity = 1.0;
        
        return (
          <div 
            key={day} 
            title={`${day}: ${minutes}分`}
            style={{ 
              width: '16px', height: '16px', borderRadius: '4px',
              backgroundColor: `rgba(59, 130, 246, ${opacity})`, // primary color
              border: '1px solid rgba(0,0,0,0.05)'
            }} 
          />
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { profile, saveNote } = useUser();
  const [videos, setVideos] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [aiContent, setAiContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [dailyAnalysis, setDailyAnalysis] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [studyTime, setStudyTime] = useState<Record<string, number>>({});
  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [dayPlans, setDayPlans] = useState<Record<string, DayPlan>>({});
  const [rebalanceAlert, setRebalanceAlert] = useState<{ reason: string; message: string; timestamp: string } | null>(null);

  useEffect(() => {
    async function fetchDB() {
      try {
        const res = await fetch('/api/db/daily');
        const data = await res.json();
        setDailyAnalysis(data.dailyAnalysis);
        setRecentLogs(data.recentLogs);
        setStudyTime(data.studyTime || {});
        if (data.syllabus) setSyllabus(data.syllabus);
        if (data.dayPlans) setDayPlans(data.dayPlans);
        if (data.syllabusRebalanceAlert) {
          setRebalanceAlert(data.syllabusRebalanceAlert);
        } else if (profile.syllabusRebalanceAlert) {
          setRebalanceAlert(profile.syllabusRebalanceAlert);
        }
      } catch(e) {
        console.error(e);
      }
    }
    fetchDB();
  }, [profile.syllabusRebalanceAlert]);

  const handleSaveDayPlan = async (plan: DayPlan) => {
    setDayPlans(prev => ({ ...prev, [plan.date]: plan }));
    try {
      await fetch('/api/db/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'saveDayPlan', data: plan })
      });
    } catch (e) {
      console.error('Failed to save day plan', e);
    }
  };

  const runDailyBatch = async () => {
    alert("日次分析バッチ処理を開始します（モックアップ）...");
    try {
      const res = await fetch('/api/cron/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile }),
      });
      const data = await res.json();
      setDailyAnalysis(data);
      alert("日次分析が完了し、データベースが更新されました！");
    } catch (e) {
      alert("エラーが発生しました。");
    }
  };

  const baseSubjects = dailyAnalysis?.recommendedSubjects?.length > 0 
    ? dailyAnalysis.recommendedSubjects 
    : (profile.weakSubjects?.length > 0 ? profile.weakSubjects : []);
  
  const allDefaults = ["英語", "数学", "国語", "物理", "化学"];
  let paddedSubjects = [...baseSubjects];
  
  if (profile.weakSubjects?.length > 0) {
    for (const sub of profile.weakSubjects) {
      if (paddedSubjects.length >= 3) break;
      const isIncluded = paddedSubjects.some((existing: string) => existing.includes(sub) || sub.includes(existing));
      if (!isIncluded) paddedSubjects.push(sub);
    }
  }
  
  for (const sub of allDefaults) {
    if (paddedSubjects.length >= 3) break;
    const isIncluded = paddedSubjects.some((existing: string) => existing.includes(sub) || sub.includes(existing));
    if (!isIncluded) paddedSubjects.push(sub);
  }
  
  const weakSubjects = paddedSubjects.slice(0, 3);
  const currentFocus = weakSubjects[0];
  const achievementLevel = dailyAnalysis?.achievementLevel || 25;
  const aiSuggestionComment = dailyAnalysis?.aiComment || `目標校に向けて、本日は**「${currentFocus}」**の基礎固めを推奨します。前回のテストで少し躓いていたポイントを復習しましょう！`;

  useEffect(() => {
    async function fetchVideos() {
      try {
        const subjectsToFetch = weakSubjects.slice(0, 3);
        const promises = subjectsToFetch.map((subject: string) => 
          fetch(`/api/youtube?q=${encodeURIComponent(subject + " 基礎")}`).then(res => res.json())
        );
        const results = await Promise.all(promises);
        
        const allVideos = results.map((data, index) => ({
          subject: subjectsToFetch[index],
          items: data.items || []
        }));
        setVideos(allVideos);
      } catch (e) {
        console.error(e);
      }
    }
    fetchVideos();
  }, [JSON.stringify(weakSubjects)]);

  const handleGenerateSuggestion = async () => {
    setShowModal(true);
    setIsGenerating(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          history: [], 
          message: `現在の目標校「${mainTarget}」に向けて、今の注力課題である「${currentFocus}」について、本日の最適な学習内容を総合的に提案し、ポイントを解説してください。モチベーションが上がるようにお願いします。`,
          profile
        }),
      });
      const data = await res.json();
      setAiContent(data.text);
      // DBにログを残す
      fetch('/api/db/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chat', data: { topic: '推奨学習生成', subject: currentFocus } })
      });
    } catch (e) {
      setAiContent('エラーが発生しました。時間をおいてお試しください。');
    } finally {
      setIsGenerating(false);
    }
  };

  const mainTarget = profile.targetSchools && profile.targetSchools.length > 0 && !profile.targetSchools[0].includes('未設定') ? profile.targetSchools[0] : '未設定';

  // Find next uncompleted tasks from syllabus
  const nextTasks = [];
  if (syllabus && syllabus.length > 0) {
    for (const phase of syllabus) {
      if (nextTasks.length >= 2) break;
      for (const cat of phase.categories) {
        if (nextTasks.length >= 2) break;
        for (const task of cat.tasks) {
          if (!(profile.completedTasks || []).includes(task.title)) {
            nextTasks.push(task);
            if (nextTasks.length >= 2) break;
          }
        }
      }
    }
  }

  return (
    <div className={styles.container}>
      {rebalanceAlert && (
        <div style={{
          backgroundColor: '#FFFBEB',
          color: '#92400E',
          padding: '14px 20px',
          borderRadius: '12px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(245, 158, 11, 0.1)',
          borderLeft: '4px solid #F59E0B'
        }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '2px' }}>🔔 【学習シラバス自動アップデート】</strong>
            <span style={{ fontSize: '0.9rem' }}>{rebalanceAlert.message}</span>
          </div>
          <Link href="/plan" className="btn btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap', marginLeft: '16px', fontSize: '0.88rem' }}>
            シラバスを確認
          </Link>
        </div>
      )}

      {profile.needsProfileUpdate && (
        <div style={{
          backgroundColor: '#FEF08A',
          color: '#854D0E',
          padding: '16px',
          borderRadius: '12px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          borderLeft: '4px solid #EAB308'
        }}>
          <div>
            <strong style={{ display: 'block', marginBottom: '4px' }}>🌸 ご進学・進級おめでとうございます！</strong>
            <span>4月1日を経過したため、学年が上がりました。学校名や科などの新しい所属情報をプロフィールから更新してください。</span>
          </div>
          <Link href="/profile" className="btn btn-primary" style={{ padding: '8px 16px', whiteSpace: 'nowrap', marginLeft: '16px' }}>
            プロフィールを更新
          </Link>
        </div>
      )}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>ダッシュボード</h1>
          <p className={styles.greeting}>おかえりなさい、<span className="text-gradient" style={{fontWeight: 'bold'}}>{profile.name}</span>さん！今日の学習を始めましょう。</p>
        </div>
        <div className={styles.headerRight} style={{ display: 'flex', gap: '10px' }}>
          <button onClick={runDailyBatch} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>🔄 日次バッチ実行 (管理用)</button>
          <div className={styles.streakBadge}>
            <span className={styles.fireIcon}>🔥</span>
            <span className={styles.streakCount}>3日連続</span>
          </div>
        </div>
      </header>

      <div className={styles.grid}>
        <section className={`glass-panel animate-fade-in ${styles.section} ${styles.aiSuggestion}`}>
          <h2 className={styles.sectionTitle}>✨ チューターコメント (日次分析結果)</h2>
          <div className={`${styles.aiText} markdown-body`}>
            <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{aiSuggestionComment}</ReactMarkdown>
          </div>
          <div className={styles.actionButtons}>
            <button className="btn btn-primary" onClick={handleGenerateSuggestion}>
              本日の推奨課題に取り組む
            </button>
          </div>
        </section>

        {/* 📅 学習タイムマネジメント・簡易カレンダー */}
        <StudyCalendar
          dayPlans={dayPlans}
          studyTime={studyTime}
          recentLogs={recentLogs}
          onSavePlan={handleSaveDayPlan}
        />

        {nextTasks.length > 0 && (
          <section className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}>
            <h2 className={styles.sectionTitle}>🎯 今日のミッション (シラバスから抜粋)</h2>
            <div style={{ display: 'grid', gap: '12px' }}>
              {nextTasks.map((task: any, idx: number) => (
                <div key={idx} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  padding: '16px', background: '#F8FAFC', borderRadius: '12px', borderLeft: task.type === 'weakness' ? '4px solid #f59e0b' : '4px solid #3b82f6'
                }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: task.type === 'weakness' ? '#d97706' : '#2563eb', marginBottom: '4px', display: 'block' }}>
                      {task.type === 'weakness' ? '【弱点克服】' : '【基本ルート】'}
                    </span>
                    <strong style={{ fontSize: '1.1rem' }}>{task.title}</strong>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {dailyAnalysis?.miniLesson && (
          <section className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}>
            <h2 className={styles.sectionTitle}>📚 今日のミニレッスン (基礎の復習)</h2>
            <div className={styles.miniLessonCard}>
              <h3 style={{ fontSize: '1.2rem', marginBottom: '10px', color: 'var(--accent-primary)' }}>{dailyAnalysis.miniLesson.title}</h3>
              <div className="markdown-body" style={{ marginBottom: '20px' }}>
                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{dailyAnalysis.miniLesson.content}</ReactMarkdown>
              </div>
              
              <div className={styles.quizBox} style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h4 style={{ marginBottom: '15px' }}>📝 確認テスト: <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]} components={{p: 'span'}}>{dailyAnalysis.miniLesson.question}</ReactMarkdown></h4>
                <div style={{ display: 'grid', gap: '10px' }}>
                  {dailyAnalysis.miniLesson.options.map((opt: string, i: number) => (
                    <button 
                      key={i} 
                      className="btn btn-secondary" 
                      style={{ textAlign: 'left', padding: '12px' }}
                      onClick={() => {
                        if (i === dailyAnalysis.miniLesson.correctAnswerIndex) {
                          alert('✅ 正解！\n\n' + dailyAnalysis.miniLesson.explanation);
                          fetch('/api/db/daily', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'miniLesson', data: { passed: true } }) });
                        } else {
                          alert('❌ 惜しい！\n\n' + dailyAnalysis.miniLesson.explanation);
                        }
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <section className={`glass-panel animate-fade-in ${styles.section} ${styles.fullWidth}`}>
          <h2 className={styles.sectionTitle}>📊 目標達成度</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '16px' }}>
            {(dailyAnalysis?.achievements || (profile.targetSchools.length > 0 ? profile.targetSchools : ["未設定"]).map((s: string, i: number) => ({ school: s, level: 25 - i*5 }))).slice(0,3).map((ach: any, idx: number) => (
              <div key={idx} className={styles.progressItem}>
                <div className={styles.progressHeader}>
                  <span style={{ fontWeight: idx === 0 ? 'bold' : 'normal', color: idx === 0 ? 'var(--accent-primary)' : 'inherit' }}>
                    {idx === 0 ? '🎯 第一志望: ' : (idx === 1 ? '🎯 第二志望: ' : '🎯 第三志望: ')} {ach.school}
                  </span>
                  <span style={{ fontWeight: 'bold' }}>{ach.level}%</span>
                </div>
                <div className={styles.progressBarBg}>
                  <div className={styles.progressBarFill} style={{ width: `${ach.level}%`, opacity: idx === 0 ? 1 : 0.7 }}></div>
                </div>
              </div>
            ))}
          </div>
          
          <h3 className={styles.subTitle}>今週の重点科目（自動算出）</h3>
          <ul className={styles.subjectList}>
            {weakSubjects.map((subject: string, idx: number) => (
              <li key={idx}><span className={styles.subjectDot} style={{backgroundColor: idx === 0 ? '#3b82f6' : (idx===1 ? '#10b981' : '#f59e0b')}}></span>{subject}</li>
            ))}
          </ul>
          
          <h3 className={styles.subTitle} style={{ marginTop: '24px' }}>🔥 過去30日間の学習ヒートマップ</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>タイマーで記録された集中時間</p>
          <Heatmap studyTime={studyTime} />
        </section>

        {videos.length > 0 ? (
          videos.map((subjectData: any) => (
            <section key={subjectData.subject} className={`glass-panel animate-fade-in ${styles.section} ${styles.videoSection}`}>
              <h2 className={styles.sectionTitle}>📺 関連授業動画 ({subjectData.subject})</h2>
              <div className={styles.videoGrid}>
                {subjectData.items.map((video: any) => (
                  <div key={video.id.videoId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <iframe 
                      width="100%" 
                      height="180" 
                      src={`https://www.youtube.com/embed/${video.id.videoId}?rel=0`} 
                      title={video.snippet.title}
                      frameBorder="0" 
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                      allowFullScreen
                      style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    ></iframe>
                    <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '4px' }} onClick={() => {
                      saveNote(video.snippet.title, `[動画リンク](https://www.youtube.com/watch?v=${video.id.videoId})\n\nここに動画のメモを書き込んでください。`);
                      alert('ノートに動画リンクを保存しました！');
                    }}>
                      📝 ノートに保存して見返す
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <section className={`glass-panel animate-fade-in ${styles.section} ${styles.videoSection}`}>
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
          <div className={`${planStyles.modalContent} ${isExpanded ? planStyles.expanded : ''}`} onClick={e => e.stopPropagation()}>
            <div className={planStyles.modalHeader}>
              <h2 className={planStyles.modalTitle}>本日の推奨学習: {currentFocus}</h2>
              <div className={planStyles.modalControls}>
                <button className={planStyles.iconBtn} onClick={() => setIsExpanded(!isExpanded)}>
                  {isExpanded ? '縮小' : '拡大'}
                </button>
                <button className={planStyles.iconBtn} onClick={() => setShowModal(false)}>×</button>
              </div>
            </div>
            
            {isGenerating ? (
              <div className={planStyles.loading}>
                <div className={planStyles.spinner}></div>
                <p>AIが学習のポイントを生成中...</p>
              </div>
            ) : (
              <div className={`${planStyles.generatedContent} markdown-body`}>
                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{aiContent}</ReactMarkdown>
                
                <div className={styles.directLinks}>
                  <h3>🚀 さっそく学習を始める</h3>
                  <div className={styles.linkGrid}>
                    <Link href={`/drill?subject=${currentFocus}`} className="btn btn-primary">✏️ AIドリルを解く</Link>
                    <Link href={`/flashcard?subject=${currentFocus}`} className="btn btn-secondary">🗂️ 暗記カード</Link>
                    <button onClick={() => window.dispatchEvent(new CustomEvent('startPomodoro', { detail: { task: currentFocus } }))} className="btn btn-secondary">⏱️ 集中タイマー</button>
                  </div>
                </div>

                <div className={planStyles.modalActions}>
                  <button className="btn btn-secondary" onClick={() => {
                    saveNote(`推奨学習: ${currentFocus}`, aiContent);
                    alert('「学習ノート」に保存しました！');
                  }}>ノートに保存</button>
                  <button className="btn btn-primary" onClick={() => window.location.href=`/chat?initialMessage=${encodeURIComponent(`${currentFocus} の学習を進めたいです。先程の提案の続きからお願いします。`)}`}>AIとさらに学ぶ</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
