'use client';

import { useState } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';
import styles from './drill.module.css';

import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

type Question = { id: number; question: string; hint: string; answer: string; };
type Evaluation = { id: number; isCorrect: boolean; feedback: string; };

function DrillContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const contextSubject = searchParams.get('subject');

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>AI ドリル (テスト)</h1>
        <p className={styles.subtitle}>
          {mainSchool} 合格に向けた、あなた専用のピンポイント問題（5問）です。
        </p>
      </header>

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
    </div>
  );
}

import { Suspense } from 'react';
export default function DrillPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DrillContent />
    </Suspense>
  );
}
