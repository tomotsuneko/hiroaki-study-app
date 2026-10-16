'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './drill.module.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import {
  buildUnifiedCatalog,
  findMatchingUnitsForTask,
  UnifiedUnit,
  TestRecordSummary,
  ContentItem,
  CurriculumSubject,
} from '@/lib/content-slots';

type Question = {
  id: number;
  level?: string;
  unit?: string;
  question: string;
  hint: string;
  answer: string;
  keyPoint?: string;
};

type Evaluation = {
  id: number;
  isCorrect: boolean;
  feedback: string;
};

function DrillCenterContent() {
  const { profile, setProfile, saveNote } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();

  const paramSubject = searchParams.get('subject') || '';
  const paramTopic = searchParams.get('topic') || searchParams.get('task') || '';
  const paramUnitCode = searchParams.get('unit') || '';
  const paramMode = searchParams.get('mode') || '';

  // 4 Practical Modes:
  // 'recommend' (Push: 弱点補強・AI推奨)
  // 'official'  (Pull: 公式テスト問題集 L1/L2/L3)
  // 'custom'    (Pull: 単元・難易度別 AIカスタム演習)
  // 'exam'      (Mock/Diag: 模試実戦総合 & 学力診断テスト)
  const [activeTab, setActiveTab] = useState<'recommend' | 'official' | 'custom' | 'exam'>('recommend');

  // Master & User Data
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [materials, setMaterials] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  const [userRecords, setUserRecords] = useState<Record<string, TestRecordSummary>>({});
  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState({
    totalTestsTaken: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    overallAccuracy: 0,
  });
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Official tab filter state
  const [officialSubjectId, setOfficialSubjectId] = useState<string>('high_school_数学');
  const [officialSearch, setOfficialSearch] = useState<string>('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Custom / Exam configuration state
  const [selectedSubject, setSelectedSubject] = useState<string>('数学');
  const [selectedLargeCat, setSelectedLargeCat] = useState<string>('すべて');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('');
  const [difficulty, setDifficulty] = useState<'基礎' | '標準' | '応用'>('標準');
  const [drillSubMode, setDrillSubMode] = useState<'unit' | 'weakness'>('unit');
  const [examType, setExamType] = useState<'comprehensive' | 'diagnostic'>('comprehensive');
  const [questionCount, setQuestionCount] = useState<number>(5);

  // Active Test Runner State
  const [testState, setTestState] = useState<'idle' | 'generating' | 'testing' | 'evaluating' | 'result'>('idle');
  const [activeRunMeta, setActiveRunMeta] = useState<{
    subject: string;
    topic: string;
    unitCode: string;
    mode: 'unit' | 'weakness' | 'comprehensive' | 'diagnostic';
    difficulty: string;
  }>({ subject: '数学', topic: '', unitCode: '', mode: 'unit', difficulty: '標準' });

  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [showHints, setShowHints] = useState<Record<number, boolean>>({});
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [addedCardIds, setAddedCardIds] = useState<Record<number, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isUpdatingSyllabus, setIsUpdatingSyllabus] = useState(false);

  // Load all data
  useEffect(() => {
    async function loadAll() {
      setIsLoadingData(true);
      try {
        const [curRes, matRes, testRes, recRes, dailyRes] = await Promise.all([
          fetch('/api/admin/master-db'),
          fetch('/api/admin/materials-list'),
          fetch('/api/admin/tests-list'),
          fetch('/api/tests/record'),
          fetch('/api/db/daily'),
        ]);

        const [curData, matData, testData, recData, dailyData] = await Promise.all([
          curRes.json().catch(() => ({})),
          matRes.json().catch(() => ({})),
          testRes.json().catch(() => ({})),
          recRes.json().catch(() => ({})),
          dailyRes.json().catch(() => ({})),
        ]);

        const curList = curData.masterDb || curData.curriculum || [];
        if (Array.isArray(curList)) setCurriculum(curList);

        const matList = matData.materials || [];
        if (Array.isArray(matList)) setMaterials(matList);

        const testList = testData.tests || testData.materials || [];
        if (Array.isArray(testList)) setTests(testList);

        const recMap: Record<string, TestRecordSummary> = {};
        const rawResults = recData.results || recData.records || [];
        if (Array.isArray(rawResults)) {
          rawResults.forEach((r: any) => {
            if (r.testId) recMap[r.testId] = r;
          });
        }
        setUserRecords(recMap);
        setSummaryStats({
          totalTestsTaken: recData.totalTestsTaken || 0,
          totalAnswered: recData.totalAnswered || 0,
          totalCorrect: recData.totalCorrect || 0,
          overallAccuracy: recData.overallAccuracy || 0,
        });

        if (dailyData.syllabus && Array.isArray(dailyData.syllabus)) {
          setSyllabus(dailyData.syllabus);
        }
      } catch (e) {
        console.error('Failed to load drill data:', e);
      } finally {
        setIsLoadingData(false);
      }
    }
    loadAll();
  }, []);

  // Build Unified Catalog
  const catalog = useMemo(() => {
    return buildUnifiedCatalog(
      curriculum,
      materials,
      tests,
      userRecords,
      profile.completedTasks || []
    );
  }, [curriculum, materials, tests, userRecords, profile.completedTasks]);

  // Seamless Handover from URL Query Params (?subject=...&topic=...&unit=...&mode=...)
  useEffect(() => {
    if (!paramSubject && !paramTopic && !paramUnitCode && !paramMode) return;

    const cleanSubj = paramSubject.replace(/^high_school_/, '').trim();
    if (cleanSubj && cleanSubj !== '直前の学習内容') {
      setSelectedSubject(cleanSubj);
    }

    // Match against catalog units if possible
    if (catalog.units.length > 0 && (paramTopic || paramUnitCode)) {
      const matched = findMatchingUnitsForTask(
        paramUnitCode || paramTopic,
        cleanSubj,
        catalog.units
      );
      if (matched.length > 0) {
        const u = matched[0];
        setSelectedSubject(u.subjectName);
        setSelectedLargeCat(u.largeName);
        setSelectedTopic(u.smallName);
        setSelectedUnitCode(u.unitCode || '');
      } else if (paramTopic) {
        setSelectedTopic(paramTopic);
      }
    } else if (paramTopic) {
      setSelectedTopic(paramTopic);
    }

    // Switch to the intended tab based on params
    if (
      paramMode === 'diagnostic' ||
      paramTopic.includes('診断') ||
      paramTopic.includes('レベルチェック')
    ) {
      setActiveTab('exam');
      setExamType('diagnostic');
    } else if (paramMode === 'comprehensive' || paramTopic.includes('模試')) {
      setActiveTab('exam');
      setExamType('comprehensive');
    } else if (paramMode === 'official') {
      setActiveTab('official');
    } else if (paramTopic || paramSubject || paramUnitCode) {
      setActiveTab('custom');
      if (paramMode === 'weakness') {
        setDrillSubMode('weakness');
      }
    }
  }, [paramSubject, paramTopic, paramUnitCode, paramMode, catalog.units]);

  // Countdown timer for Mock Exam / Diagnostic mode
  useEffect(() => {
    if (testState !== 'testing' || remainingSeconds === null) return;
    if (remainingSeconds <= 0) return;
    const timer = setInterval(() => {
      setRemainingSeconds(prev => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [testState, remainingSeconds]);

  // Push Recommendations (Weakness & Syllabus & Review Units)
  const weakReviewUnits = useMemo(() => {
    return catalog.units
      .filter(u => u.totalAnswered > 0 && (u.bestAccuracy === null || u.bestAccuracy < 80))
      .sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0))
      .slice(0, 6);
  }, [catalog.units]);

  const syllabusPushTasks = useMemo(() => {
    const list: { title: string; subjectName: string; type: string; unit: UnifiedUnit | null }[] = [];
    const seen = new Set<string>();
    for (const phase of syllabus) {
      for (const cat of phase.categories || []) {
        for (const t of cat.tasks || []) {
          if (list.length >= 6) break;
          if ((profile.completedTasks || []).includes(t.title)) continue;
          if (t.type === 'diagnostic') continue;
          if (seen.has(t.title)) continue;
          seen.add(t.title);
          const matched = findMatchingUnitsForTask(t.title, cat.name, catalog.units);
          list.push({
            title: t.title,
            subjectName: cat.name,
            type: t.type,
            unit: matched.length > 0 ? matched[0] : null,
          });
        }
      }
    }
    return list;
  }, [syllabus, profile.completedTasks, catalog.units]);

  // Matched Unit for Custom Form
  const matchedCustomUnit = useMemo(() => {
    if (!selectedTopic && !selectedUnitCode) return null;
    const found = findMatchingUnitsForTask(
      selectedUnitCode || selectedTopic,
      selectedSubject,
      catalog.units
    );
    return found.length > 0 ? found[0] : null;
  }, [selectedTopic, selectedUnitCode, selectedSubject, catalog.units]);

  // Start AI Drill / Comprehensive Exam / Diagnostic Test
  const startAiTest = async (overrideParams?: {
    subject?: string;
    topic?: string;
    unitCode?: string;
    mode?: 'unit' | 'weakness' | 'comprehensive' | 'diagnostic';
    difficulty?: string;
    count?: number;
  }) => {
    const runSubj = overrideParams?.subject || selectedSubject || '数学';
    const runTopic =
      overrideParams?.topic !== undefined ? overrideParams.topic : selectedTopic;
    const runUnitCode =
      overrideParams?.unitCode !== undefined
        ? overrideParams.unitCode
        : matchedCustomUnit?.unitCode || selectedUnitCode;
    const runMode =
      overrideParams?.mode ||
      (activeTab === 'exam' ? examType : drillSubMode);
    const runDiff = overrideParams?.difficulty || difficulty;
    const runCount = overrideParams?.count || questionCount;

    setActiveRunMeta({
      subject: runSubj,
      topic: runTopic,
      unitCode: runUnitCode || '',
      mode: runMode,
      difficulty: runDiff,
    });

    setTestState('generating');
    setQuestions([]);
    setAnswers({});
    setShowHints({});
    setEvaluations([]);
    setAddedCardIds({});

    try {
      const res = await fetch('/api/drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: runSubj,
          topic: runTopic,
          unitCode: runUnitCode,
          mode: runMode,
          difficulty: runDiff,
          questionCount: runCount,
          profile,
        }),
      });
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Empty questions');
      }
      setQuestions(data);
      // Set countdown timer (3 minutes per question) for exam/diagnostic modes
      if (runMode === 'comprehensive' || runMode === 'diagnostic') {
        setRemainingSeconds(data.length * 180);
      } else {
        setRemainingSeconds(null);
      }
      setTestState('testing');
    } catch (e) {
      alert('問題の生成に失敗しました。もう一度お試しください。');
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
          subject: activeRunMeta.subject,
          topic: activeRunMeta.topic,
          mode: activeRunMeta.mode,
          questions,
          answers,
          profile,
        }),
      });
      const data = await res.json();
      setEvaluations(Array.isArray(data) ? data : []);
      setTestState('result');
    } catch (e) {
      alert('採点に失敗しました。もう一度お試しください。');
      setTestState('testing');
    }
  };

  // Add a question's keyPoint / Q&A directly to Flashcards
  const handleAddQuestionToFlashcard = async (q: Question) => {
    try {
      const frontText = `【${activeRunMeta.topic || activeRunMeta.subject}】\n${q.question}`;
      const backText = q.keyPoint
        ? `**【重要ポイント】**\n${q.keyPoint}\n\n**【解答・解説】**\n${q.answer}`
        : q.answer;

      const res = await fetch('/api/flashcard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_cards',
          cards: [
            {
              subject: activeRunMeta.subject,
              topic: activeRunMeta.topic || q.unit || activeRunMeta.subject,
              unitCode: activeRunMeta.unitCode,
              front: frontText,
              back: backText,
            },
          ],
        }),
      });
      if (res.ok) {
        setAddedCardIds(prev => ({ ...prev, [q.id]: true }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate diagnostic deviation score & apply to profile/syllabus
  const correctCount = evaluations.filter(e => e.isCorrect).length;
  const totalQ = questions.length || 5;
  const estimatedDeviation = useMemo(() => {
    const ratio = correctCount / totalQ;
    return Math.round(42 + ratio * 24); // 0% -> 42, 60% -> 56, 100% -> 66
  }, [correctCount, totalQ]);

  const handleApplyDiagnosticScore = async () => {
    setIsUpdatingSyllabus(true);
    try {
      const updated = {
        ...profile,
        deviationScore: estimatedDeviation,
        levelCheckCompleted: true,
        levelCheckResult: {
          score: estimatedDeviation,
          level:
            estimatedDeviation >= 60
              ? '応用・発展'
              : estimatedDeviation >= 50
              ? '標準'
              : '基礎徹底',
          evaluatedAt: new Date().toISOString(),
          recommendedFocus:
            estimatedDeviation >= 60
              ? '実戦演習と過去問'
              : estimatedDeviation >= 50
              ? '標準典型問題の完全網羅'
              : '教科書概念と基礎ドリル',
        },
      };
      setProfile(updated);

      await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: updated, reason: 'level_check' }),
      });
      alert(
        `診断結果（推定偏差値 ${estimatedDeviation}）をプロフィールに保存し、学習シラバスを最新状態に再編成しました！`
      );
      router.push('/plan');
    } catch (e) {
      console.error(e);
    } finally {
      setIsUpdatingSyllabus(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Subject options from catalog
  const subjectCatalogForCustom = useMemo(() => {
    return (
      catalog.subjects.find(
        s => s.subjectName.includes(selectedSubject) || selectedSubject.includes(s.subjectName)
      ) || catalog.subjects[0]
    );
  }, [catalog.subjects, selectedSubject]);

  const officialSubjectCatalog = useMemo(() => {
    return (
      catalog.subjects.find(s => s.subjectId === officialSubjectId) ||
      catalog.subjects[0] ||
      null
    );
  }, [catalog.subjects, officialSubjectId]);

  return (
    <div className={styles.container}>
      {/* 1. Header & Global Stats */}
      <header className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>📝 AIドリル・実践テストセンター</h1>
          <p className={styles.subtitle}>
            「弱点分析によるプッシュ型補強」「公式3段階テスト問題集」「単元別カスタムAI演習」「模試・学力診断テスト」を統合。<br />
            間違えた問題はワンクリックで暗記カードや学習ノートに登録し、確実な定着へ繋げられます。
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>📝 受験済テスト</span>
            <span className={styles.statValue}>{summaryStats.totalTestsTaken} 回</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>✍️ 累計回答数</span>
            <span className={styles.statValue}>{summaryStats.totalAnswered} 問</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>🎯 全体正答率</span>
            <span className={styles.statValue} style={{ color: '#6EE7B7' }}>
              {summaryStats.overallAccuracy}%
            </span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>🚨 要復習単元</span>
            <span className={styles.statValue} style={{ color: '#FCA5A5' }}>
              {weakReviewUnits.length} 単元
            </span>
          </div>
        </div>
      </header>

      {/* Handover Context Banner when navigated from another page */}
      {(paramSubject || paramTopic || paramUnitCode) && testState === 'idle' && (
        <div className={styles.contextBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1.3rem' }}>🔗</span>
            <div>
              <strong style={{ color: '#1E40AF', fontSize: '0.95rem' }}>
                学習コンテキストを引き継ぎました：
                {selectedSubject}
                {selectedTopic ? ` › 「${selectedTopic}」` : ''}
                {matchedCustomUnit?.unitCode ? ` (${matchedCustomUnit.unitCode})` : ''}
              </strong>
              <div style={{ fontSize: '0.82rem', color: '#1D4ED8' }}>
                遷移元の単元・テーマが自動セットされています。下のボタンからすぐに演習を開始できます。
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {matchedCustomUnit?.tests.l1 && (
              <Link
                href={`/tests/${encodeURIComponent(matchedCustomUnit.tests.l1.id)}`}
                className="btn btn-secondary"
                style={{ fontSize: '0.84rem', padding: '8px 14px', textDecoration: 'none' }}
              >
                🟢 公式L1テストを開く
              </Link>
            )}
            <button
              className="btn btn-primary"
              style={{ fontSize: '0.86rem', padding: '8px 18px' }}
              onClick={() => startAiTest()}
            >
              🚀 今すぐ「{selectedTopic || selectedSubject}」の演習を開始 →
            </button>
          </div>
        </div>
      )}

      {/* 2. 4-Mode Navigation Tabs */}
      {testState === 'idle' && (
        <div className={styles.modeTabs}>
          <button
            className={`${styles.modeTab} ${activeTab === 'recommend' ? styles.modeTabActive : ''}`}
            onClick={() => setActiveTab('recommend')}
          >
            <div className={styles.modeTabTitle}>🎯 弱点補強・おすすめ (Push)</div>
            <div className={styles.modeTabDesc}>
              テスト誤答単元やシラバスからAIが今解くべき課題を自動提示
            </div>
          </button>

          <button
            className={`${styles.modeTab} ${activeTab === 'official' ? styles.modeTabActive : ''}`}
            onClick={() => setActiveTab('official')}
          >
            <div className={styles.modeTabTitle}>📖 単元別 公式テスト問題集</div>
            <div className={styles.modeTabDesc}>
              カリキュラム全単元の基礎(L1)・標準(L2)・応用(L3)テストを受験
            </div>
          </button>

          <button
            className={`${styles.modeTab} ${activeTab === 'custom' ? styles.modeTabActive : ''}`}
            onClick={() => setActiveTab('custom')}
          >
            <div className={styles.modeTabTitle}>⚡ 単元選択 AIカスタム特訓 (Pull)</div>
            <div className={styles.modeTabDesc}>
              科目・単元・難易度を自由に選んで公式教材連動の記述5問を生成
            </div>
          </button>

          <button
            className={`${styles.modeTab} ${activeTab === 'exam' ? styles.modeTabActive : ''}`}
            onClick={() => setActiveTab('exam')}
          >
            <div className={styles.modeTabTitle}>🏆 模試実戦・学力診断テスト</div>
            <div className={styles.modeTabDesc}>
              制限時間付きの単元横断総合テスト＆偏差値算出レベルチェック
            </div>
          </button>
        </div>
      )}

      {/* =========================================================
          ACTIVE TEST RUNNER (Shared across modes when running)
         ========================================================= */}
      {testState !== 'idle' && (
        <div className={styles.panelCard}>
          {testState === 'generating' && (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div className={styles.spinner} />
              <h3 style={{ margin: '0 0 8px 0', color: '#0F172A' }}>
                🤖 「{activeRunMeta.subject}
                {activeRunMeta.topic ? `：${activeRunMeta.topic}` : ''}」の実践問題を生成中...
              </h3>
              <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
                {activeRunMeta.unitCode
                  ? `公式学習テキスト（${activeRunMeta.unitCode}）の内容と目標校レベルを参照して作問しています`
                  : '目標校レベルと学習履歴に合わせて良問を選定しています'}
              </p>
            </div>
          )}

          {testState === 'testing' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  paddingBottom: '16px',
                  marginBottom: '20px',
                  borderBottom: '2px solid #F1F5F9',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      padding: '3px 10px',
                      borderRadius: '999px',
                    }}
                  >
                    {activeRunMeta.mode === 'diagnostic'
                      ? '📊 学力レベル診断テスト'
                      : activeRunMeta.mode === 'comprehensive'
                      ? '🏆 模試実戦・総合テスト'
                      : activeRunMeta.mode === 'weakness'
                      ? '🎯 弱点克服ドリル'
                      : `⚡ 単元別演習 (${activeRunMeta.difficulty})`}
                  </span>
                  <h2 style={{ margin: '6px 0 0 0', fontSize: '1.35rem', color: '#0F172A' }}>
                    {activeRunMeta.subject}
                    {activeRunMeta.topic ? ` › ${activeRunMeta.topic}` : ''}
                  </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {remainingSeconds !== null && (
                    <span className={styles.timerBadge}>
                      ⏱️ 残り時間 {formatTimer(remainingSeconds)}
                    </span>
                  )}
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: '0.84rem', padding: '8px 14px' }}
                    onClick={() => setTestState('idle')}
                  >
                    中断して戻る
                  </button>
                </div>
              </div>

              {questions.map((q, idx) => (
                <div key={q.id || idx} className={styles.questionCard}>
                  <div className={styles.questionHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '1.05rem', color: '#1E293B' }}>
                        第 {idx + 1} 問
                      </strong>
                      {q.level && (
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: '#E2E8F0',
                            color: '#334155',
                          }}
                        >
                          {q.level}
                        </span>
                      )}
                      {q.unit && (
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>({q.unit})</span>
                      )}
                    </div>

                    {q.hint && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowHints(prev => ({ ...prev, [q.id]: !prev[q.id] }))
                        }
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: '#D97706',
                          background: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        💡 {showHints[q.id] ? 'ヒントを隠す' : '着眼点ヒントを見る'}
                      </button>
                    )}
                  </div>

                  <div className="markdown-body" style={{ marginBottom: '14px', fontSize: '1rem' }}>
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {q.question}
                    </ReactMarkdown>
                  </div>

                  {showHints[q.id] && q.hint && (
                    <div
                      style={{
                        background: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        marginBottom: '12px',
                        fontSize: '0.88rem',
                        color: '#92400E',
                      }}
                    >
                      <strong>💡 ヒント:</strong> {q.hint}
                    </div>
                  )}

                  <textarea
                    className={styles.textarea}
                    rows={3}
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="解答・途中式・考え方を入力してください（分かる範囲の部分解答でもAIが添削します）..."
                  />
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '14px 32px', fontSize: '1.05rem', fontWeight: 800 }}
                  onClick={submitAnswers}
                  disabled={Object.keys(answers).length === 0}
                >
                  ✅ 解答を提出してAI添削・採点を受ける
                </button>
              </div>
            </div>
          )}

          {testState === 'evaluating' && (
            <div style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div className={styles.spinner} />
              <h3 style={{ margin: '0 0 8px 0', color: '#0F172A' }}>
                ✍️ AIチューターがあなたの解答を1問ずつ添削・採点中...
              </h3>
              <p style={{ color: '#64748B', fontSize: '0.9rem', margin: 0 }}>
                正誤判定と、つまずきポイントの解説を作成しています
              </p>
            </div>
          )}

          {testState === 'result' && (
            <div>
              {/* Score Banner */}
              <div
                style={{
                  background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                  color: '#FFFFFF',
                  borderRadius: '18px',
                  padding: '24px 28px',
                  marginBottom: '24px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.84rem', color: '#94A3B8', fontWeight: 700 }}>
                    採点結果：{activeRunMeta.subject}
                    {activeRunMeta.topic ? ` › ${activeRunMeta.topic}` : ''}
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, marginTop: '4px' }}>
                    {correctCount} / {totalQ} 問正解（正答率 {Math.round((correctCount / totalQ) * 100)}%）
                  </div>
                </div>

                {activeRunMeta.mode === 'diagnostic' && (
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '14px',
                      padding: '12px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.76rem', color: '#CBD5E1' }}>診断推定レベル</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FDE68A' }}>
                        目安偏差値 {estimatedDeviation}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      disabled={isUpdatingSyllabus}
                      onClick={handleApplyDiagnosticScore}
                      style={{ fontSize: '0.86rem', padding: '10px 16px' }}
                    >
                      {isUpdatingSyllabus
                        ? '🔄 シラバス更新中...'
                        : '🎯 この診断結果をシラバスに反映する'}
                    </button>
                  </div>
                )}
              </div>

              {/* Per-Question Evaluation & Action Bridges */}
              {questions.map((q, idx) => {
                const ev = evaluations.find(e => e.id === q.id) || evaluations[idx];
                const isCor = ev?.isCorrect ?? false;

                return (
                  <div
                    key={q.id || idx}
                    style={{
                      marginBottom: '20px',
                      padding: '22px',
                      borderRadius: '16px',
                      background: isCor ? '#F0FDF4' : '#FEF2F2',
                      border: `1px solid ${isCor ? '#BBF7D0' : '#FECACA'}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                        marginBottom: '12px',
                      }}
                    >
                      <h3 style={{ margin: 0, fontSize: '1.1rem', color: isCor ? '#166534' : '#991B1B' }}>
                        第 {idx + 1} 問：{isCor ? '✅ 正解！' : '❌ 要復習'}
                      </h3>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleAddQuestionToFlashcard(q)}
                          disabled={addedCardIds[q.id]}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            background: addedCardIds[q.id] ? '#DCFCE7' : '#FFFFFF',
                            color: addedCardIds[q.id] ? '#15803D' : '#1E293B',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: addedCardIds[q.id] ? 'default' : 'pointer',
                          }}
                        >
                          {addedCardIds[q.id]
                            ? '✅ 暗記カードに追加済'
                            : '📇 この問題の急所を暗記カードに追加'}
                        </button>

                        <button
                          onClick={() => {
                            saveNote(
                              `演習復習: ${activeRunMeta.topic || activeRunMeta.subject} (第${idx + 1}問)`,
                              `### 問題\n${q.question}\n\n### あなたの解答\n${answers[q.id] || '未回答'}\n\n### AI添削・解説\n${ev?.feedback || ''}\n\n### 模範解答・ポイント\n${q.answer}`
                            );
                            alert('学習ノートに保存しました！');
                          }}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            background: '#FFFFFF',
                            color: '#1E293B',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          📚 学習ノートに保存
                        </button>
                      </div>
                    </div>

                    <div
                      className="markdown-body"
                      style={{
                        background: '#FFFFFF',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        marginBottom: '12px',
                        fontSize: '0.94rem',
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                        {q.question}
                      </ReactMarkdown>
                    </div>

                    <div style={{ marginBottom: '12px', fontSize: '0.9rem', color: '#334155' }}>
                      <strong>あなたの解答:</strong> {answers[q.id] || '（未入力）'}
                    </div>

                    <div
                      className="markdown-body"
                      style={{
                        background: '#FFFFFF',
                        padding: '16px',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                      }}
                    >
                      <div style={{ fontWeight: 800, color: '#1E40AF', marginBottom: '6px' }}>
                        🤖 AI講師の添削フィードバック & 模範解説
                      </div>
                      <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                        {`${ev?.feedback || ''}\n\n---\n**【模範解答・解法】**\n${q.answer}`}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}

              {/* Next Action Bridges */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '20px',
                  borderTop: '1px solid #E2E8F0',
                }}
              >
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <Link
                    href={`/lesson?task=${encodeURIComponent(
                      activeRunMeta.topic || activeRunMeta.subject
                    )}`}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none' }}
                  >
                    📘 「{activeRunMeta.topic || activeRunMeta.subject}」のテキストを復習する
                  </Link>
                  <Link
                    href={`/flashcard?subject=${encodeURIComponent(
                      activeRunMeta.subject
                    )}&topic=${encodeURIComponent(activeRunMeta.topic || '')}&unit=${encodeURIComponent(
                      activeRunMeta.unitCode || ''
                    )}`}
                    className="btn btn-secondary"
                    style={{ textDecoration: 'none' }}
                  >
                    📇 この単元の暗記カードへ進む
                  </Link>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => startAiTest(activeRunMeta)}>
                    🔄 新しい類題でもう一度解く
                  </button>
                  <button className="btn btn-primary" onClick={() => setTestState('idle')}>
                    演習トップへ戻る
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODE 1: PUSH RECOMMENDATIONS (弱点補強・AI推奨)
         ========================================================= */}
      {testState === 'idle' && activeTab === 'recommend' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 1A. Weak Units detected from Test History */}
          <section className={styles.panelCard}>
            <h2 className={styles.sectionTitle}>
              🚨 テスト履歴から検出された「要復習・弱点単元」（正答率80%未満）
            </h2>
            <p className={styles.sectionSub}>
              過去に受験した単元テストでつまずいた単元です。再テストまたはAI弱点ドリルで80%以上（👑習得）を目指しましょう。
            </p>

            {weakReviewUnits.length > 0 ? (
              <div className={styles.recommendGrid}>
                {weakReviewUnits.map(u => (
                  <div
                    key={u.unitKey}
                    className={styles.recommendCard}
                    style={{ borderLeft: '5px solid #EF4444' }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            background: '#FEE2E2',
                            color: '#B91C1C',
                            padding: '2px 8px',
                            borderRadius: '6px',
                          }}
                        >
                          {u.unitCode || u.largeName} / 正答率 {u.bestAccuracy}%
                        </span>
                        <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                          {u.largeName} › {u.mediumName}
                        </span>
                      </div>
                      <strong style={{ fontSize: '1.05rem', color: '#0F172A' }}>
                        {u.smallName}
                      </strong>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {u.tests.l1 && (
                        <Link
                          href={`/tests/${encodeURIComponent(u.tests.l1.id)}`}
                          className="btn btn-primary"
                          style={{
                            fontSize: '0.8rem',
                            padding: '6px 12px',
                            textDecoration: 'none',
                          }}
                        >
                          🟢 L1テスト再挑戦
                        </Link>
                      )}
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                        onClick={() =>
                          startAiTest({
                            subject: u.subjectName,
                            topic: u.smallName,
                            unitCode: u.unitCode || '',
                            mode: 'weakness',
                            difficulty: '基礎',
                          })
                        }
                      >
                        ⚡ AI弱点5問特訓
                      </button>
                      <Link
                        href={`/lesson?task=${encodeURIComponent(u.smallName)}&tab=material`}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '6px 12px',
                          textDecoration: 'none',
                        }}
                      >
                        📘 テキスト復習
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '24px',
                  background: '#F8FAFC',
                  borderRadius: '12px',
                  color: '#475569',
                  fontSize: '0.9rem',
                }}
              >
                現在、正答率80%未満の要復習テストはありません。下のシラバス連動課題または公式テスト問題集から新しい単元に挑戦しましょう！
              </div>
            )}
          </section>

          {/* 1B. Syllabus & Profile Weakness Push */}
          <section className={styles.panelCard}>
            <h2 className={styles.sectionTitle}>
              🗺️ 個別シラバス & 苦手分野からのプッシュ演習課題
            </h2>
            <p className={styles.sectionSub}>
              あなたの目標校逆算シラバスの進行中タスクと、プロフィール・模試分析の苦手分野から厳選した演習メニューです。
            </p>

            <div className={styles.recommendGrid}>
              {syllabusPushTasks.map((item, idx) => (
                <div
                  key={idx}
                  className={styles.recommendCard}
                  style={{
                    borderLeft:
                      item.type === 'weakness' ? '5px solid #F59E0B' : '5px solid #2563EB',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          background: item.type === 'weakness' ? '#FEF3C7' : '#DBEAFE',
                          color: item.type === 'weakness' ? '#B45309' : '#1D4ED8',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {item.type === 'weakness' ? '🔥 シラバス弱点補強' : '🗺️ シラバス重点単元'}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                        {item.subjectName}
                      </span>
                    </div>
                    <strong style={{ fontSize: '1.02rem', color: '#0F172A' }}>{item.title}</strong>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {item.unit?.tests.l1 && (
                      <Link
                        href={`/tests/${encodeURIComponent(item.unit.tests.l1.id)}`}
                        className="btn btn-primary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '6px 12px',
                          textDecoration: 'none',
                        }}
                      >
                        🟢 公式L1テスト
                      </Link>
                    )}
                    {item.unit?.tests.l2 && (
                      <Link
                        href={`/tests/${encodeURIComponent(item.unit.tests.l2.id)}`}
                        className="btn btn-secondary"
                        style={{
                          fontSize: '0.8rem',
                          padding: '6px 12px',
                          textDecoration: 'none',
                        }}
                      >
                        🔵 公式L2テスト
                      </Link>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      onClick={() =>
                        startAiTest({
                          subject: item.subjectName,
                          topic: item.title,
                          unitCode: item.unit?.unitCode || '',
                          mode: item.type === 'weakness' ? 'weakness' : 'unit',
                          difficulty: '標準',
                        })
                      }
                    >
                      ⚡ AI記述5問演習
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =========================================================
          MODE 2: OFFICIAL UNIT TESTS (単元別 公式テスト問題集)
         ========================================================= */}
      {testState === 'idle' && activeTab === 'official' && (
        <div className={styles.panelCard}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '18px',
            }}
          >
            <div>
              <h2 className={styles.sectionTitle}>📖 カリキュラム単元別 テスト問題集</h2>
              <p className={styles.sectionSub} style={{ margin: 0 }}>
                各単元の「L1基礎」「L2標準」「L3応用」テストの受験、および公式テキスト・暗記カードへの直行が可能です。
              </p>
            </div>

            <input
              type="text"
              className={styles.textInput}
              style={{ minWidth: '260px' }}
              placeholder="🔍 単元名・コード(数Ⅰ-001)で検索..."
              value={officialSearch}
              onChange={e => setOfficialSearch(e.target.value)}
            />
          </div>

          {/* Subject Pills */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px' }}>
            {catalog.subjects.map(subj => (
              <button
                key={subj.subjectId}
                onClick={() => setOfficialSubjectId(subj.subjectId)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '999px',
                  border: '1px solid',
                  borderColor:
                    officialSubjectId === subj.subjectId ? '#2563EB' : '#CBD5E1',
                  background:
                    officialSubjectId === subj.subjectId ? '#2563EB' : '#F8FAFC',
                  color: officialSubjectId === subj.subjectId ? '#FFFFFF' : '#334155',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {subj.subjectName} (テスト{subj.filledTests} / 全{subj.totalUnits}単元)
              </button>
            ))}
          </div>

          {isLoadingData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
              読み込み中...
            </div>
          ) : officialSubjectCatalog ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {officialSubjectCatalog.largeCategories.map(cat => {
                const filteredUnits = cat.units.filter(u => {
                  if (!officialSearch.trim()) return true;
                  const q = officialSearch.trim().toLowerCase();
                  return `${u.unitCode || ''} ${u.mediumName} ${u.smallName}`
                    .toLowerCase()
                    .includes(q);
                });
                if (filteredUnits.length === 0) return null;

                const isCollapsed = collapsedCategories[cat.name] ?? false;

                return (
                  <div
                    key={cat.name}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: '14px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      onClick={() =>
                        setCollapsedCategories(p => ({ ...p, [cat.name]: !p[cat.name] }))
                      }
                      style={{
                        padding: '14px 18px',
                        background: '#F8FAFC',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderBottom: isCollapsed ? 'none' : '1px solid #E2E8F0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span>{isCollapsed ? '▶' : '▼'}</span>
                        <strong style={{ fontSize: '1.08rem', color: '#0F172A' }}>
                          {cat.name}
                        </strong>
                        <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
                          ({filteredUnits.length} 単元 / 公式テスト収録 {cat.filledTests} 単元)
                        </span>
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#2563EB', fontWeight: 700 }}>
                        {isCollapsed ? '展開する' : '折りたたむ'}
                      </span>
                    </div>

                    {!isCollapsed && (
                      <div
                        style={{
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                        }}
                      >
                        {filteredUnits.map(u => {
                          const l1Rec = u.testRecords.l1;
                          const l2Rec = u.testRecords.l2;
                          const l3Rec = u.testRecords.l3;

                          return (
                            <div
                              key={u.unitKey}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 14px',
                                background: '#FAFAFA',
                                borderRadius: '10px',
                                border: '1px solid #F1F5F9',
                                flexWrap: 'wrap',
                                gap: '10px',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: '220px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span
                                    style={{
                                      fontFamily: 'monospace',
                                      fontWeight: 800,
                                      fontSize: '0.8rem',
                                      background: '#E2E8F0',
                                      color: '#334155',
                                      padding: '2px 7px',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    {u.unitCode || `No.${u.no}`}
                                  </span>
                                  <strong style={{ fontSize: '0.96rem', color: '#0F172A' }}>
                                    {u.smallName}
                                  </strong>
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                                  {u.mediumName}
                                </div>
                              </div>

                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <Link
                                  href={`/lesson?task=${encodeURIComponent(u.smallName)}&tab=material`}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                  }}
                                >
                                  📘 テキスト
                                </Link>

                                <Link
                                  href={`/flashcard?subject=${encodeURIComponent(
                                    u.subjectName
                                  )}&topic=${encodeURIComponent(u.smallName)}&unit=${encodeURIComponent(
                                    u.unitCode || ''
                                  )}`}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    textDecoration: 'none',
                                  }}
                                >
                                  📇 暗記カード
                                </Link>

                                {u.tests.l1 && (
                                  <Link
                                    href={`/tests/${encodeURIComponent(u.tests.l1.id)}`}
                                    style={{
                                      padding: '5px 11px',
                                      background: l1Rec ? '#DCFCE7' : '#FFFFFF',
                                      color: '#047857',
                                      border: '1px solid #6EE7B7',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    🟢 L1基礎
                                    {l1Rec && l1Rec.answeredCount > 0
                                      ? ` (${Math.round((l1Rec.correctCount / l1Rec.answeredCount) * 100)}%)`
                                      : ''}
                                  </Link>
                                )}

                                {u.tests.l2 && (
                                  <Link
                                    href={`/tests/${encodeURIComponent(u.tests.l2.id)}`}
                                    style={{
                                      padding: '5px 11px',
                                      background: l2Rec ? '#DBEAFE' : '#FFFFFF',
                                      color: '#1D4ED8',
                                      border: '1px solid #93C5FD',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    🔵 L2標準
                                    {l2Rec && l2Rec.answeredCount > 0
                                      ? ` (${Math.round((l2Rec.correctCount / l2Rec.answeredCount) * 100)}%)`
                                      : ''}
                                  </Link>
                                )}

                                {u.tests.l3 && (
                                  <Link
                                    href={`/tests/${encodeURIComponent(u.tests.l3.id)}`}
                                    style={{
                                      padding: '5px 11px',
                                      background: l3Rec ? '#FFEDD5' : '#FFFFFF',
                                      color: '#C2410C',
                                      border: '1px solid #FDBA74',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      textDecoration: 'none',
                                    }}
                                  >
                                    🟠 L3応用
                                    {l3Rec && l3Rec.answeredCount > 0
                                      ? ` (${Math.round((l3Rec.correctCount / l3Rec.answeredCount) * 100)}%)`
                                      : ''}
                                  </Link>
                                )}

                                {!u.tests.l1 && !u.tests.l2 && !u.tests.l3 && (
                                  <button
                                    onClick={() =>
                                      startAiTest({
                                        subject: u.subjectName,
                                        topic: u.smallName,
                                        unitCode: u.unitCode || '',
                                        mode: 'unit',
                                        difficulty: '標準',
                                      })
                                    }
                                    style={{
                                      padding: '5px 11px',
                                      background: '#EFF6FF',
                                      color: '#1D4ED8',
                                      border: '1px solid #93C5FD',
                                      borderRadius: '6px',
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    ⚡ AI演習を生成
                                  </button>
                                )}
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
          ) : null}
        </div>
      )}

      {/* =========================================================
          MODE 3: PULL CUSTOM AI DRILL (単元・難易度選択カスタム特訓)
         ========================================================= */}
      {testState === 'idle' && activeTab === 'custom' && (
        <div className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>
            ⚡ 単元・難易度を選べる AIカスタム記述特訓（公式テキスト連動）
          </h2>
          <p className={styles.sectionSub}>
            カリキュラムから学びたい単元と難易度を選択（または自由入力）してください。登録済みの公式学習テキストがある単元は、自動的にテキストの定義・例題に準拠した問題を生成します。
          </p>

          <div className={styles.configGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>1. 科目を選択</label>
              <select
                className={styles.selectInput}
                value={selectedSubject}
                onChange={e => {
                  setSelectedSubject(e.target.value);
                  setSelectedLargeCat('すべて');
                  setSelectedTopic('');
                  setSelectedUnitCode('');
                }}
              >
                {catalog.subjects.map(s => (
                  <option key={s.subjectId} value={s.subjectName}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>2. 分野（大分類）で絞り込み</label>
              <select
                className={styles.selectInput}
                value={selectedLargeCat}
                onChange={e => setSelectedLargeCat(e.target.value)}
              >
                <option value="すべて">すべての分野</option>
                {(subjectCatalogForCustom?.largeCategories || []).map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>3. カリキュラム単元を選択</label>
              <select
                className={styles.selectInput}
                value={selectedTopic}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedTopic(val);
                  const found = findMatchingUnitsForTask(val, selectedSubject, catalog.units);
                  setSelectedUnitCode(found[0]?.unitCode || '');
                }}
              >
                <option value="">-- 単元を選択（または下で自由入力） --</option>
                {(subjectCatalogForCustom?.largeCategories || [])
                  .filter(c => selectedLargeCat === 'すべて' || c.name === selectedLargeCat)
                  .flatMap(c =>
                    c.units.map(u => (
                      <option key={u.unitKey} value={u.smallName}>
                        [{u.unitCode || c.name}] {u.smallName}
                        {u.material ? ' 📘' : ''}
                      </option>
                    ))
                  )}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>または単元・テーマを直接入力</label>
              <input
                type="text"
                className={styles.textInput}
                placeholder="例: 二次関数の最大最小、仮定法過去..."
                value={selectedTopic}
                onChange={e => setSelectedTopic(e.target.value)}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>4. 難易度レベル</label>
              <select
                className={styles.selectInput}
                value={difficulty}
                onChange={e => setDifficulty(e.target.value as any)}
              >
                <option value="基礎">🟢 基礎（教科書・基本公式の定着）</option>
                <option value="標準">🔵 標準（共通テスト・入試典型問題）</option>
                <option value="応用">🟠 応用（難関大・複合思考問題）</option>
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>5. 出題フォーカス & 問題数</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className={styles.selectInput}
                  style={{ flex: 1 }}
                  value={drillSubMode}
                  onChange={e => setDrillSubMode(e.target.value as any)}
                >
                  <option value="unit">王道良問演習</option>
                  <option value="weakness">弱点・つまずき解消</option>
                </select>
                <select
                  className={styles.selectInput}
                  value={questionCount}
                  onChange={e => setQuestionCount(Number(e.target.value))}
                >
                  <option value={3}>3問</option>
                  <option value={5}>5問</option>
                </select>
              </div>
            </div>
          </div>

          {matchedCustomUnit && (
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
              }}
            >
              <div style={{ fontSize: '0.86rem', color: '#334155' }}>
                <strong>選択中の単元:</strong> [{matchedCustomUnit.unitCode || matchedCustomUnit.largeName}]{' '}
                {matchedCustomUnit.smallName}{' '}
                {matchedCustomUnit.material && (
                  <span
                    style={{
                      marginLeft: '8px',
                      background: '#DBEAFE',
                      color: '#1D4ED8',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                    }}
                  >
                    📘 公式学習テキスト連携ON
                  </span>
                )}
              </div>
              {matchedCustomUnit.tests.l1 && (
                <Link
                  href={`/tests/${encodeURIComponent(matchedCustomUnit.tests.l1.id)}`}
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#047857',
                    textDecoration: 'underline',
                  }}
                >
                  📝 この単元の公式30問テスト(L1/L2/L3)を受ける場合はこちら →
                </Link>
              )}
            </div>
          )}

          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '14px', fontSize: '1.05rem', fontWeight: 800 }}
            onClick={() => startAiTest()}
          >
            🚀 「{selectedSubject}
            {selectedTopic ? `：${selectedTopic}` : ''}」（{difficulty}・{questionCount}問）の特訓を開始する
          </button>
        </div>
      )}

      {/* =========================================================
          MODE 4: MOCK EXAM & DIAGNOSTIC (総合・模試形式テスト)
         ========================================================= */}
      {testState === 'idle' && activeTab === 'exam' && (
        <div className={styles.panelCard}>
          <h2 className={styles.sectionTitle}>
            🏆 模試実戦・総合テスト & 学力レベル診断（制限時間タイマー付き）
          </h2>
          <p className={styles.sectionSub}>
            複数単元を横断する模試形式の総合テストや、現在の目安偏差値を測定してシラバスに反映する学力診断テストを受験できます。
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            <div
              onClick={() => setExamType('comprehensive')}
              style={{
                padding: '20px',
                borderRadius: '16px',
                border: `2px solid ${examType === 'comprehensive' ? '#2563EB' : '#E2E8F0'}`,
                background: examType === 'comprehensive' ? '#EFF6FF' : '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '1.08rem', color: '#0F172A', marginBottom: '6px' }}>
                🔥 科目・分野横断「模試実戦総合テスト」
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.5 }}>
                定期試験や共通テスト・志望校入試を想定し、選択した科目・大分類の全範囲から横断的に5問出題します（制限時間15分）。
              </p>
            </div>

            <div
              onClick={() => setExamType('diagnostic')}
              style={{
                padding: '20px',
                borderRadius: '16px',
                border: `2px solid ${examType === 'diagnostic' ? '#7C3AED' : '#E2E8F0'}`,
                background: examType === 'diagnostic' ? '#F5F3FF' : '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '1.08rem', color: '#4C1D95', marginBottom: '6px' }}>
                📊 学力レベル診断テスト（偏差値算出 & シラバス自動反映）
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#5B21B6', lineHeight: 1.5 }}>
                基礎（偏差値45）〜標準（偏差値55）〜応用（偏差値65）のグラデーション問題を解き、現在地偏差値を診断して学習シラバスを最適化します。
              </p>
            </div>
          </div>

          <div className={styles.configGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>対象科目</label>
              <select
                className={styles.selectInput}
                value={selectedSubject}
                onChange={e => {
                  setSelectedSubject(e.target.value);
                  setSelectedLargeCat('すべて');
                }}
              >
                {catalog.subjects.map(s => (
                  <option key={s.subjectId} value={s.subjectName}>
                    {s.subjectName}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>出題範囲（大分類）</label>
              <select
                className={styles.selectInput}
                value={selectedLargeCat}
                onChange={e => setSelectedLargeCat(e.target.value)}
              >
                <option value="すべて">{selectedSubject} 全範囲総合</option>
                {(subjectCatalogForCustom?.largeCategories || []).map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} 総合
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '15px',
              fontSize: '1.05rem',
              fontWeight: 800,
              background: examType === 'diagnostic' ? '#7C3AED' : undefined,
            }}
            onClick={() =>
              startAiTest({
                subject: selectedSubject,
                topic:
                  selectedLargeCat === 'すべて'
                    ? `${selectedSubject} 総合実戦`
                    : `${selectedLargeCat} 総合実戦`,
                unitCode: '',
                mode: examType,
                difficulty: '標準',
                count: 5,
              })
            }
          >
            {examType === 'diagnostic'
              ? `📊 「${selectedSubject}」の学力レベル診断テストを開始する（制限時間15分）`
              : `🔥 「${
                  selectedLargeCat === 'すべて' ? selectedSubject : selectedLargeCat
                }」の模試実戦総合テストを開始する（制限時間15分）`}
          </button>
        </div>
      )}
    </div>
  );
}

export default function DrillPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>}>
      <DrillCenterContent />
    </Suspense>
  );
}
