'use client';

import { useState, useEffect, Suspense } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './drill.module.css';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { buildSubjectSlots, ContentSlot } from '@/lib/content-slots';

type Question = { id: number; question: string; hint: string; answer: string; };
type Evaluation = { id: number; isCorrect: boolean; feedback: string; };

function DrillContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const contextSubject = searchParams.get('subject');

  // タブ: 'official' (数学Ⅰ問題集 315テスト) | 'ai' (AIピンポイント生成)
  const [activeTab, setActiveTab] = useState<'official' | 'ai'>('official');

  // 公式テスト一覧用ステート
  const [curriculum, setCurriculum] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [userRecords, setUserRecords] = useState<Record<string, any>>({});
  const [summaryStats, setSummaryStats] = useState<{
    totalTestsTaken: number;
    totalAnswered: number;
    totalCorrect: number;
    overallAccuracy: number;
  }>({ totalTestsTaken: 0, totalAnswered: 0, totalCorrect: 0, overallAccuracy: 0 });
  const [isLoadingOfficial, setIsLoadingOfficial] = useState(true);
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // AI即時ドリル用ステート
  const [testState, setTestState] = useState<'idle' | 'generating' | 'testing' | 'evaluating' | 'result'>('idle');
  const subjects = contextSubject 
    ? [contextSubject] 
    : (profile.weakSubjects.length > 0 ? profile.weakSubjects : ["数学II", "英語長文", "物理基礎"]);
  const [subjectIndex, setSubjectIndex] = useState(0);
  const currentSubject = subjects[subjectIndex];

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [reflection, setReflection] = useState('3');

  // 公式テスト一覧・ユーザー実績の取得
  useEffect(() => {
    async function loadOfficialTests() {
      try {
        setIsLoadingOfficial(true);
        const [masterRes, testsRes, recordRes] = await Promise.all([
          fetch('/api/admin/master-db'),
          fetch('/api/admin/tests-list'),
          fetch('/api/tests/record')
        ]);

        const masterData = await masterRes.json();
        const testsData = await testsRes.json();
        const recordData = await recordRes.json();

        if (masterData.masterDb) setCurriculum(masterData.masterDb);
        if (testsData.tests) setTests(testsData.tests);

        if (recordData.success && recordData.results) {
          const recMap: Record<string, any> = {};
          recordData.results.forEach((r: any) => {
            recMap[r.testId] = r;
          });
          setUserRecords(recMap);
          setSummaryStats({
            totalTestsTaken: recordData.totalTestsTaken || 0,
            totalAnswered: recordData.totalAnswered || 0,
            totalCorrect: recordData.totalCorrect || 0,
            overallAccuracy: recordData.overallAccuracy || 0
          });
        }
      } catch (err) {
        console.error('Failed to load official tests:', err);
      } finally {
        setIsLoadingOfficial(false);
      }
    }

    loadOfficialTests();
  }, []);

  // AI即時生成ドリルの開始
  const startTest = async () => {
    setTestState('generating');
    try {
      const res = await fetch('/api/drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: currentSubject, profile }),
      });
      const data = await res.json();
      setQuestions(data);
      setAnswers({});
      setTestState('testing');
    } catch(e) {
      alert("問題の生成に失敗しました。もう一度お試しください。");
      setTestState('idle');
    }
  };

  const submitAnswers = async () => {
    setTestState('evaluating');
    try {
      const res = await fetch('/api/drill/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          subject: currentSubject, 
          questions: questions,
          answers: answers,
          profile 
        }),
      });
      const data = await res.json();
      setEvaluations(data);
      setTestState('result');
    } catch(e) {
      alert("採点に失敗しました。もう一度お試しください。");
      setTestState('testing');
    }
  };

  const finishTest = () => {
    setTestState('idle');
    setAnswers({});
    setQuestions([]);
    setEvaluations([]);
  };

  const cycleSubject = () => {
    setSubjectIndex((prev) => (prev + 1) % subjects.length);
  };

  const mainSchool = profile.targetSchools && profile.targetSchools[0] ? profile.targetSchools[0] : '志望校';

  // 数学Ⅰ のカリキュラムとテストをマッピング
  const mathSubject = curriculum.find(s => s.id === 'high_school_数学' || s.subjectName === '数学');
  const mathTests = tests.filter(t => t.subject === 'high_school_数学' || t.title.startsWith('数Ⅰ'));
  const { categories } = mathSubject ? buildSubjectSlots(mathSubject, mathTests) : { categories: [] };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>📝 テスト・演習ドリル</h1>
        <p className={styles.subtitle}>
          単元ごとの問題演習と採点、弱点克服のための個別ドリルです。
        </p>

        {/* タブ切り替えバー */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginTop: '20px',
          borderBottom: '2px solid #E2E8F0',
          paddingBottom: '2px'
        }}>
          <button
            onClick={() => setActiveTab('official')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: activeTab === 'official' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'official' ? '3px solid #2563EB' : '3px solid transparent',
              marginBottom: '-5px',
              transition: 'all 0.2s ease'
            }}
          >
            📖 数学Ⅰ 単元別テスト問題集 (全315テスト)
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              color: activeTab === 'ai' ? '#2563EB' : '#64748B',
              borderBottom: activeTab === 'ai' ? '3px solid #2563EB' : '3px solid transparent',
              marginBottom: '-5px',
              transition: 'all 0.2s ease'
            }}
          >
            🤖 AI即時生成ドリル (5問特訓)
          </button>
        </div>
      </header>

      {/* 1. 数学Ⅰ 公式テスト問題集 タブ */}
      {activeTab === 'official' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* ユーザー実績サマリーカード */}
          <div className="glass-panel" style={{
            padding: '20px 24px',
            borderRadius: '12px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div>
              <div style={{ fontSize: '0.88rem', color: '#64748B' }}>あなたの数学Ⅰ 演習実績</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#0F172A' }}>
                  {summaryStats.totalTestsTaken}
                </span>
                <span style={{ color: '#64748B', fontSize: '0.9rem' }}>/ 315 テスト受講中</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>累計回答数</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#2563EB' }}>
                  {summaryStats.totalAnswered} <span style={{ fontSize: '0.8rem' }}>問</span>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>累計正解数</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#10B981' }}>
                  {summaryStats.totalCorrect} <span style={{ fontSize: '0.8rem' }}>問</span>
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>全体正答率</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#D97706' }}>
                  {summaryStats.overallAccuracy} <span style={{ fontSize: '0.8rem' }}>%</span>
                </div>
              </div>
            </div>
          </div>

          {/* テスト一覧（大分類アコーディオン） */}
          {isLoadingOfficial ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>テスト一覧を読み込み中...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {categories.map((cat, catIdx) => {
                const isCollapsed = collapsedCategories[cat.name] ?? false;
                const toggle = () => setCollapsedCategories(p => ({ ...p, [cat.name]: !p[cat.name] }));

                return (
                  <div key={catIdx} style={{
                    border: '1px solid #E2E8F0',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    backgroundColor: 'white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                  }}>
                    {/* 大分類バー */}
                    <div
                      onClick={toggle}
                      style={{
                        padding: '12px 18px',
                        backgroundColor: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        userSelect: 'none',
                        borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{isCollapsed ? '▶' : '▼'}</span>
                        <strong style={{ fontSize: '1.05rem', color: '#1E293B' }}>{cat.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>({cat.slots.length} 単元)</span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#3B82F6', fontWeight: '500' }}>
                        {isCollapsed ? '展開する' : '折りたたむ'}
                      </span>
                    </div>

                    {/* 単元スロット一覧 */}
                    {!isCollapsed && (
                      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {cat.slots.map(slot => {
                          const l1Rec = slot.levels.l1 ? userRecords[slot.levels.l1.id] : null;
                          const l2Rec = slot.levels.l2 ? userRecords[slot.levels.l2.id] : null;
                          const l3Rec = slot.levels.l3 ? userRecords[slot.levels.l3.id] : null;

                          return (
                            <div key={slot.no} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              padding: '10px 14px',
                              backgroundColor: '#FAFAFA',
                              borderRadius: '8px',
                              border: '1px solid #EEF2F6',
                              flexWrap: 'wrap',
                              gap: '12px'
                            }}>
                              <div style={{ flex: 1, minWidth: '220px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{
                                    fontFamily: 'monospace',
                                    fontWeight: 'bold',
                                    fontSize: '0.88rem',
                                    color: '#475569',
                                    backgroundColor: '#E2E8F0',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                  }}>
                                    {slot.expectedTitle || `No.${slot.no}`}
                                  </span>
                                  <strong style={{ fontSize: '0.98rem', color: '#1E293B' }}>
                                    {slot.smallName}
                                  </strong>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                                  中分類: {slot.mediumName}
                                </div>
                              </div>

                              {/* レベル別テストボタン */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {/* L1 基礎 */}
                                {slot.levels.l1 ? (
                                  <Link
                                    href={`/tests/${encodeURIComponent(slot.levels.l1.id)}`}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: l1Rec ? '#DCFCE7' : '#FFFFFF',
                                      color: l1Rec ? '#166534' : '#059669',
                                      border: `1px solid ${l1Rec ? '#86EFAC' : '#A7F3D0'}`,
                                      borderRadius: '6px',
                                      fontSize: '0.82rem',
                                      fontWeight: 'bold',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    🟢 基礎
                                    {l1Rec && (
                                      <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.9 }}>
                                        ({l1Rec.correctCount}/{l1Rec.answeredCount}問)
                                      </span>
                                    )}
                                  </Link>
                                ) : null}

                                {/* L2 標準 */}
                                {slot.levels.l2 ? (
                                  <Link
                                    href={`/tests/${encodeURIComponent(slot.levels.l2.id)}`}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: l2Rec ? '#DBEAFE' : '#FFFFFF',
                                      color: l2Rec ? '#1E40AF' : '#2563EB',
                                      border: `1px solid ${l2Rec ? '#93C5FD' : '#BFDBFE'}`,
                                      borderRadius: '6px',
                                      fontSize: '0.82rem',
                                      fontWeight: 'bold',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    🔵 標準
                                    {l2Rec && (
                                      <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.9 }}>
                                        ({l2Rec.correctCount}/{l2Rec.answeredCount}問)
                                      </span>
                                    )}
                                  </Link>
                                ) : null}

                                {/* L3 応用 */}
                                {slot.levels.l3 ? (
                                  <Link
                                    href={`/tests/${encodeURIComponent(slot.levels.l3.id)}`}
                                    style={{
                                      padding: '6px 12px',
                                      backgroundColor: l3Rec ? '#FFEDD5' : '#FFFFFF',
                                      color: l3Rec ? '#9A3412' : '#EA580C',
                                      border: `1px solid ${l3Rec ? '#FDBA74' : '#FED7AA'}`,
                                      borderRadius: '6px',
                                      fontSize: '0.82rem',
                                      fontWeight: 'bold',
                                      textDecoration: 'none',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '4px'
                                    }}
                                  >
                                    🟠 応用
                                    {l3Rec && (
                                      <span style={{ fontSize: '0.75rem', marginLeft: '4px', opacity: 0.9 }}>
                                        ({l3Rec.correctCount}/{l3Rec.answeredCount}問)
                                      </span>
                                    )}
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. AI即時生成ドリル タブ */}
      {activeTab === 'ai' && (
        <div className={`glass-panel ${styles.drillCard}`}>
          {testState === 'idle' && (
            <div className={styles.idleState}>
              <div className={styles.icon}>🎯</div>
              <h2>今日の小テストに挑戦しますか？</h2>
              <p>現在の科目: <strong>{currentSubject}</strong></p>
              <div style={{display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '16px'}}>
                <button className="btn btn-secondary" onClick={cycleSubject}>別の科目へ</button>
                <button className="btn btn-primary" onClick={startTest}>テストを開始する</button>
              </div>
            </div>
          )}

          {testState === 'generating' && (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>あなたに最適な問題（全5問）を生成中...</p>
            </div>
          )}

          {testState === 'testing' && (
            <div className={styles.testingState}>
              {questions.map((q, idx) => (
                <div key={q.id} style={{marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #E9EDF7'}}>
                  <h3 className={styles.boxTitle}>問題 {idx + 1}</h3>
                  <div className="markdown-body" style={{marginBottom: '16px'}}>
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q.question}</ReactMarkdown>
                  </div>
                  <textarea 
                    className={styles.textarea} 
                    rows={3} 
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers({...answers, [q.id]: e.target.value})}
                    placeholder="解答や考え方を入力..."
                  ></textarea>
                </div>
              ))}
              
              <button 
                className={`btn btn-primary ${styles.submitBtn}`} 
                onClick={submitAnswers}
                disabled={Object.keys(answers).length === 0}
              >
                5問まとめて提出して採点する
              </button>
            </div>
          )}

          {testState === 'evaluating' && (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>AIチューターが全解答を分析・採点中...</p>
            </div>
          )}

          {testState === 'result' && (
            <div className={styles.resultState}>
              <h2 className={styles.boxTitle} style={{fontSize: '1.5rem', textAlign: 'center'}}>採点結果</h2>
              
              {evaluations.map((ev, idx) => {
                const q = questions.find(qu => qu.id === ev.id);
                return (
                  <div key={ev.id} style={{marginBottom: '32px', padding: '24px', backgroundColor: ev.isCorrect ? '#F0FDF4' : '#FEF2F2', borderRadius: '12px'}}>
                    <h3 className={styles.boxTitle}>
                      問題 {idx + 1} {ev.isCorrect ? '✅ 正解！' : '❌ 惜しい！'}
                    </h3>
                    <div className="markdown-body" style={{marginBottom: '16px', fontSize: '0.9rem', color: '#666'}}>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{q?.question || ''}</ReactMarkdown>
                    </div>
                    <div style={{marginBottom: '16px'}}>
                      <strong>あなたの解答: </strong> {answers[ev.id]}
                    </div>
                    <div className="markdown-body" style={{backgroundColor: 'white', padding: '16px', borderRadius: '8px'}}>
                      <h4 style={{marginTop: 0}}>AIからのフィードバック</h4>
                      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{ev.feedback}</ReactMarkdown>
                    </div>
                  </div>
                );
              })}

              <div className={styles.reflectionBox}>
                <h3 className={styles.boxTitle}>自己評価（リフレクション）</h3>
                <p>今回のテストの理解度はどれくらいでしたか？</p>
                <div className={styles.ratingGroup}>
                  {[1, 2, 3, 4, 5].map(num => (
                    <label key={num} className={styles.radioLabel}>
                      <input 
                        type="radio" 
                        name="reflection" 
                        value={num} 
                        checked={reflection === String(num)}
                        onChange={e => setReflection(e.target.value)}
                      />
                      <span>{num}</span>
                    </label>
                  ))}
                </div>
              </div>

              <button className={`btn btn-primary ${styles.finishBtn}`} onClick={finishTest}>
                結果を保存して終了する
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DrillPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DrillContent />
    </Suspense>
  );
}
