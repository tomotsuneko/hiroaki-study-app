'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams, useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import Link from 'next/link';
import styles from './lesson.module.css';
import {
  buildUnifiedCatalog,
  findMatchingUnitsForTask,
  UnifiedUnit,
  TestRecordSummary,
  ContentItem,
  CurriculumSubject,
} from '@/lib/content-slots';

function getBookSpineColor(largeName: string, subjectName: string): string {
  if (largeName.includes('数学Ⅰ')) return '#2563EB';
  if (largeName.includes('数学Ａ')) return '#7C3AED';
  if (largeName.includes('数学Ⅱ')) return '#0284C7';
  if (largeName.includes('数学Ｂ')) return '#4F46E5';
  if (largeName.includes('数学Ⅲ') || largeName.includes('数学Ｃ')) return '#1E40AF';
  if (largeName.includes('物理')) return '#0D9488';
  if (largeName.includes('化学')) return '#EA580C';
  if (largeName.includes('生物')) return '#16A34A';
  if (largeName.includes('地学')) return '#D97706';
  if (subjectName.includes('英語')) return '#0EA5E9';
  if (subjectName.includes('国語')) return '#E11D48';
  if (subjectName.includes('社会')) return '#B45309';
  if (subjectName.includes('情報')) return '#475569';
  return '#3B82F6';
}

function getSubjectIcon(subjectName: string): string {
  if (subjectName.includes('数学')) return '📐';
  if (subjectName.includes('英語')) return '🔤';
  if (subjectName.includes('理科')) return '🔬';
  if (subjectName.includes('社会')) return '🌍';
  if (subjectName.includes('国語')) return '✒️';
  if (subjectName.includes('情報')) return '💻';
  return '📘';
}

function BookCard({
  unit,
  onSelect,
  badgeOverride,
}: {
  unit: UnifiedUnit;
  onSelect: (u: UnifiedUnit) => void;
  badgeOverride?: string;
}) {
  const spineColor = getBookSpineColor(unit.largeName, unit.subjectName);
  const hasMaterial = Boolean(unit.material);
  const hasTests = unit.tests.all.length > 0;
  const isUpcoming = !hasMaterial && !hasTests;

  const renderLevelDot = (
    label: string,
    item?: ContentItem,
    rec?: TestRecordSummary
  ) => {
    if (!item) {
      return (
        <span key={label} className={`${styles.levelDot} ${styles.dotMissing}`} title={`${label}: 未収録`}>
          {label}
        </span>
      );
    }
    if (rec && rec.answeredCount > 0) {
      const acc = Math.round((rec.correctCount / rec.answeredCount) * 100);
      const isCleared = acc >= 80 && rec.answeredCount >= 5;
      return (
        <span
          key={label}
          className={`${styles.levelDot} ${isCleared ? styles.dotCleared : styles.dotStudying}`}
          title={`${label}: 正答率 ${acc}% (${rec.correctCount}/${rec.answeredCount}問)`}
        >
          {label}:{acc}%
        </span>
      );
    }
    return (
      <span key={label} className={`${styles.levelDot} ${styles.dotAvailable}`} title={`${label}: 受験可能`}>
        {label}
      </span>
    );
  };

  return (
    <div
      className={`${styles.bookCard} ${isUpcoming ? styles.bookCardUpcoming : ''}`}
      style={{ borderLeftColor: spineColor }}
      onClick={() => onSelect(unit)}
    >
      <div>
        <div className={styles.bookTopRow}>
          <span className={styles.bookCode}>{unit.unitCode || unit.largeName}</span>
          {badgeOverride ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusStudying}`}>
              {badgeOverride}
            </span>
          ) : unit.status === 'mastered' ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusMastered}`}>👑 習得済</span>
          ) : unit.status === 'studying' ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusStudying}`}>
              🔖 学習中 {unit.bestAccuracy !== null ? `${unit.bestAccuracy}%` : ''}
            </span>
          ) : unit.status === 'ready' ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusReady}`}>収録済</span>
          ) : (
            <span className={`${styles.bookStatusBadge} ${styles.statusUpcoming}`}>AI対応</span>
          )}
        </div>

        <h4 className={styles.bookTitle}>{unit.smallName}</h4>
        <div style={{ fontSize: '0.73rem', color: '#64748B', marginBottom: '6px' }}>
          {unit.largeName} › {unit.mediumName}
        </div>
      </div>

      <div className={styles.bookBelt}>
        <span
          className={`${styles.materialPill} ${
            hasMaterial ? styles.materialHasHtml : styles.materialAiFallback
          }`}
        >
          {hasMaterial ? '📘 教材' : '🤖 AI解説'}
        </span>

        <div className={styles.levelDots}>
          {renderLevelDot('L1', unit.tests.l1, unit.testRecords.l1)}
          {renderLevelDot('L2', unit.tests.l2, unit.testRecords.l2)}
          {renderLevelDot('L3', unit.tests.l3, unit.testRecords.l3)}
        </div>
      </div>
    </div>
  );
}

function LessonBookshelfContent() {
  const { profile, setProfile, saveNote } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTask = searchParams.get('task') || searchParams.get('unit');
  const requestedTab = searchParams.get('tab'); // 'material' | 'test' | 'video'

  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  const [materials, setMaterials] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  const [userRecords, setUserRecords] = useState<Record<string, TestRecordSummary>>({});
  const [syllabus, setSyllabus] = useState<any[]>([]);
  const [dailyLearningContents, setDailyLearningContents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Bookshelf UI filters
  const [activeSubjectId, setActiveSubjectId] = useState<string>('all');
  const [activeLargeCategory, setActiveLargeCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'studying' | 'mastered'>('available');

  // Selected Unit Modal state
  const [selectedUnit, setSelectedUnit] = useState<UnifiedUnit | null>(null);
  const [modalTab, setModalTab] = useState<'material' | 'test' | 'video'>('material');
  const [materialHtml, setMaterialHtml] = useState<string | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [aiGeneratedNote, setAiGeneratedNote] = useState<string>('');
  const [generatingAiNote, setGeneratingAiNote] = useState(false);
  const [unitVideos, setUnitVideos] = useState<any[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

  // Fetch all master & user data
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const [curRes, matRes, testRes, recRes, dailyRes] = await Promise.all([
          fetch('/api/admin/master-db'),
          fetch('/api/admin/materials-list'),
          fetch('/api/admin/tests-list'),
          fetch('/api/tests/record'),
          fetch('/api/db/daily'),
        ]);

        const [curData, matData, testData, recData, dailyData] = await Promise.all([
          curRes.json(),
          matRes.json(),
          testRes.json(),
          recRes.json(),
          dailyRes.json(),
        ]);

        if (curData.success && Array.isArray(curData.curriculum)) {
          setCurriculum(curData.curriculum);
        }
        if (matData.success && Array.isArray(matData.materials)) {
          setMaterials(matData.materials);
        }
        if (testData.success && Array.isArray(testData.materials)) {
          setTests(testData.materials);
        }
        if (recData.success && recData.records) {
          setUserRecords(recData.records);
        }
        if (dailyData.syllabus && Array.isArray(dailyData.syllabus)) {
          setSyllabus(dailyData.syllabus);
        }
        if (dailyData.dailyAnalysis?.learningContents) {
          setDailyLearningContents(dailyData.dailyAnalysis.learningContents);
        } else if (dailyData.dailyAnalysis?.learningContent) {
          setDailyLearningContents([dailyData.dailyAnalysis.learningContent]);
        }
      } catch (e) {
        console.error('Failed to load bookshelf catalog:', e);
      } finally {
        setLoading(false);
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

  // Handle URL ?task=xxx deep-link to open the book automatically
  useEffect(() => {
    if (!requestedTask || catalog.units.length === 0) return;
    const matched = findMatchingUnitsForTask(requestedTask, undefined, catalog.units);
    if (matched.length > 0) {
      const target = matched[0];
      setSelectedUnit(target);
      setActiveSubjectId(target.subjectId);
      setStatusFilter('all');
      if (requestedTab === 'test' || requestedTab === 'video' || requestedTab === 'material') {
        setModalTab(requestedTab);
      } else if (target.material) {
        setModalTab('material');
      } else if (target.tests.all.length > 0) {
        setModalTab('test');
      } else {
        setModalTab('material');
      }
    }
  }, [requestedTask, requestedTab, catalog.units]);

  // Load HTML content when a unit is opened in the modal
  useEffect(() => {
    if (!selectedUnit) {
      setMaterialHtml(null);
      setAiGeneratedNote('');
      setUnitVideos([]);
      return;
    }

    // Check if dailyLearningContents already has markdown for this unit
    const existingDaily = dailyLearningContents.find(
      c =>
        c.taskTitle &&
        (c.taskTitle.includes(selectedUnit.smallName) ||
          selectedUnit.smallName.includes(c.taskTitle))
    );
    if (existingDaily?.textMarkdown) {
      setAiGeneratedNote(existingDaily.textMarkdown);
    } else {
      setAiGeneratedNote('');
    }

    if (selectedUnit.material) {
      setLoadingMaterial(true);
      fetch(`/api/materials/${encodeURIComponent(selectedUnit.material.id)}`)
        .then(r => r.json())
        .then(d => {
          if (d.success && d.material?.content) {
            setMaterialHtml(d.material.content);
          } else {
            setMaterialHtml(null);
          }
        })
        .catch(() => setMaterialHtml(null))
        .finally(() => setLoadingMaterial(false));
    } else {
      setMaterialHtml(null);
    }
  }, [selectedUnit, dailyLearningContents]);

  // Load YouTube videos when modal tab is 'video'
  useEffect(() => {
    if (!selectedUnit || modalTab !== 'video') return;
    setLoadingVideos(true);
    const q = `${selectedUnit.largeName} ${selectedUnit.smallName} 高校 授業`;
    fetch(`/api/youtube?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => setUnitVideos(d.items || []))
      .catch(() => setUnitVideos([]))
      .finally(() => setLoadingVideos(false));
  }, [selectedUnit, modalTab]);

  // Generate AI Textbook Note on demand if HTML material is not yet uploaded
  const handleGenerateAiNote = async (unit: UnifiedUnit) => {
    setGeneratingAiNote(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: [],
          message: `高校「${unit.largeName}（${unit.mediumName}）」の単元「${unit.smallName}」について、受験生向けの分かりやすい学習講義テキストを作成してください。
1. 単元の 핵심ポイント・定義・公式の解説
2. 具体的な例題とステップバイステップの解法
3. 試験で狙われやすい注意点・つまずきやすいポイント
を含めてマークダウン（数式はLaTeX形式）で丁寧に解説してください。`,
          profile,
        }),
      });
      const data = await res.json();
      if (data.text) {
        setAiGeneratedNote(data.text);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingAiNote(false);
    }
  };

  // Toggle syllabus task completion from inside the book modal
  const handleToggleUnitMastery = (unit: UnifiedUnit) => {
    const current = profile.completedTasks || [];
    const exists = current.includes(unit.smallName);
    const updated = exists
      ? current.filter(t => t !== unit.smallName)
      : [...current, unit.smallName];
    setProfile({ ...profile, completedTasks: updated });
  };

  // Build Featured "Pickup Shelf" (Syllabus active tasks + Weakness/Studying units)
  const pickupUnits = useMemo(() => {
    const picked: { unit: UnifiedUnit; reason: string }[] = [];
    const seen = new Set<string>();

    // 1. Currently studying units (especially those with accuracy < 80% for review)
    catalog.units.forEach(u => {
      if (u.totalAnswered > 0 && u.status !== 'mastered' && !seen.has(u.unitKey)) {
        seen.add(u.unitKey);
        picked.push({
          unit: u,
          reason: u.bestAccuracy !== null && u.bestAccuracy < 75 ? '🎯 弱点復習' : '🔖 学習中',
        });
      }
    });

    // 2. Uncompleted tasks from the user's Individual Syllabus
    if (syllabus && syllabus.length > 0) {
      for (const phase of syllabus) {
        for (const cat of phase.categories || []) {
          for (const task of cat.tasks || []) {
            if (picked.length >= 6) break;
            if ((profile.completedTasks || []).includes(task.title)) continue;
            if (task.type === 'diagnostic') continue;
            const matched = findMatchingUnitsForTask(task.title, cat.name, catalog.units);
            if (matched.length > 0 && !seen.has(matched[0].unitKey)) {
              seen.add(matched[0].unitKey);
              picked.push({
                unit: matched[0],
                reason: task.type === 'weakness' ? '🔥 弱点シラバス' : '🗺️ シラバス推奨',
              });
            }
          }
        }
      }
    }

    // 3. Fallback: pick first ready units with both material & tests
    if (picked.length < 6) {
      for (const u of catalog.units) {
        if (picked.length >= 6) break;
        if (!seen.has(u.unitKey) && u.material && u.tests.all.length > 0) {
          seen.add(u.unitKey);
          picked.push({ unit: u, reason: '⭐ おすすめ単元' });
        }
      }
    }

    return picked.slice(0, 6);
  }, [catalog.units, syllabus, profile.completedTasks]);

  // Overall Stats
  const totalMaterialsCount = useMemo(
    () => catalog.units.filter(u => u.material !== null).length,
    [catalog.units]
  );
  const totalTestUnitsCount = useMemo(
    () => catalog.units.filter(u => u.tests.all.length > 0).length,
    [catalog.units]
  );
  const studyingCount = useMemo(
    () => catalog.units.filter(u => u.status === 'studying').length,
    [catalog.units]
  );
  const masteredCount = useMemo(
    () => catalog.units.filter(u => u.status === 'mastered').length,
    [catalog.units]
  );

  // Filtered Subjects & Large Categories for Bookshelf display
  const activeSubjectObj = useMemo(
    () => catalog.subjects.find(s => s.subjectId === activeSubjectId) || null,
    [catalog.subjects, activeSubjectId]
  );

  const visibleSubjects = useMemo(() => {
    if (activeSubjectId === 'all') {
      // Show subjects that have at least one material/test or match search, or all if statusFilter === 'all'
      return catalog.subjects;
    }
    return catalog.subjects.filter(s => s.subjectId === activeSubjectId);
  }, [catalog.subjects, activeSubjectId]);

  const filterUnit = (u: UnifiedUnit): boolean => {
    if (activeLargeCategory !== 'all' && u.largeName !== activeLargeCategory) {
      return false;
    }
    if (statusFilter === 'available') {
      if (!u.material && u.tests.all.length === 0 && u.totalAnswered === 0) return false;
    } else if (statusFilter === 'studying') {
      if (u.status !== 'studying' && u.status !== 'ready') return false;
    } else if (statusFilter === 'mastered') {
      if (u.status !== 'mastered') return false;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${u.unitCode || ''} ${u.largeName} ${u.mediumName} ${u.smallName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  if (loading) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', color: '#475569' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📚</div>
        <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
          学習コンテンツ本棚を読み込み中...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 1. Header & Library Summary */}
      <header className={styles.headerCard}>
        <div className={styles.headerLeft}>
          <h1 className={styles.title}>📚 学習コンテンツ本棚</h1>
          <p className={styles.subtitle}>
            カリキュラム全単元の「公式学習テキスト」と「3段階レベル別テスト（基礎・標準・応用）」を統合。<br />
            本棚から学びたい単元の本をピックアップして、インプットから演習・採点まで一貫して進められます。
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>📘 収録テキスト</span>
            <span className={styles.statValue}>{totalMaterialsCount} 冊</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>📝 テスト収録単元</span>
            <span className={styles.statValue}>{totalTestUnitsCount} 単元</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>🔖 学習中</span>
            <span className={styles.statValue} style={{ color: '#93C5FD' }}>
              {studyingCount} 単元
            </span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>👑 習得済</span>
            <span className={styles.statValue} style={{ color: '#6EE7B7' }}>
              {masteredCount} 単元
            </span>
          </div>
        </div>
      </header>

      {/* 2. Featured Pickup Shelf (Syllabus & Weakness Linked) */}
      {pickupUnits.length > 0 && !searchQuery && (
        <section className={styles.pickupSection}>
          <div className={styles.pickupHeader}>
            <div>
              <h2 className={styles.pickupTitle}>
                🌟 あなたへのピックアップ棚（学習シラバス・テスト履歴連動）
              </h2>
              <span className={styles.pickupSub}>
                個別シラバスの直近課題や、テスト結果から復習が推奨される単元を最上段にピックアップしています
              </span>
            </div>
            <Link
              href="/plan"
              style={{
                fontSize: '0.84rem',
                fontWeight: 700,
                color: '#92400E',
                background: '#FEF3C7',
                border: '1px solid #F59E0B',
                padding: '6px 14px',
                borderRadius: '999px',
                textDecoration: 'none',
              }}
            >
              🗺️ 学習シラバス全体を見る →
            </Link>
          </div>

          <div className={`${styles.shelfBoard} ${styles.shelfBoardWood}`}>
            <div className={styles.booksGrid}>
              {pickupUnits.map(({ unit, reason }) => (
                <BookCard
                  key={`pickup-${unit.unitKey}`}
                  unit={unit}
                  badgeOverride={reason}
                  onSelect={u => {
                    setSelectedUnit(u);
                    setModalTab(u.material ? 'material' : u.tests.all.length > 0 ? 'test' : 'material');
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* 3. Bookshelf Controls (Subject Tabs, Category Pills, Search, Filter) */}
      <section className={styles.controlsPanel}>
        <div className={styles.subjectTabs}>
          <button
            className={`${styles.subjectTab} ${activeSubjectId === 'all' ? styles.subjectTabActive : ''}`}
            onClick={() => {
              setActiveSubjectId('all');
              setActiveLargeCategory('all');
            }}
          >
            <span>📚 全科目</span>
            <span className={styles.subjectCountBadge}>
              {totalMaterialsCount + totalTestUnitsCount > 0 ? `${totalMaterialsCount}冊` : '全単元'}
            </span>
          </button>

          {catalog.subjects.map(subj => {
            const hasContentCount = subj.largeCategories.reduce(
              (acc, c) =>
                acc + c.units.filter(u => u.material !== null || u.tests.all.length > 0).length,
              0
            );
            return (
              <button
                key={subj.subjectId}
                className={`${styles.subjectTab} ${
                  activeSubjectId === subj.subjectId ? styles.subjectTabActive : ''
                }`}
                onClick={() => {
                  setActiveSubjectId(subj.subjectId);
                  setActiveLargeCategory('all');
                  // まだ教材が未登録の科目を開いた場合は全カリキュラム枠を自動表示
                  if (hasContentCount === 0 && statusFilter === 'available') {
                    setStatusFilter('all');
                  }
                }}
              >
                <span>
                  {getSubjectIcon(subj.subjectName)} {subj.subjectName}
                </span>
                <span className={styles.subjectCountBadge}>
                  {hasContentCount > 0 ? `${hasContentCount}単元` : `${subj.totalUnits}枠`}
                </span>
              </button>
            );
          })}

          {dailyLearningContents.length > 0 && (
            <button
              className={`${styles.subjectTab} ${
                activeSubjectId === 'daily_ai' ? styles.subjectTabActive : ''
              }`}
              onClick={() => setActiveSubjectId('daily_ai')}
            >
              <span>🤖 本日のAI重点パック ({dailyLearningContents.length})</span>
            </button>
          )}
        </div>

        {activeSubjectId !== 'daily_ai' && (
          <div className={styles.filterRow}>
            {/* Large Category Pills when a specific subject is selected */}
            <div className={styles.categoryPills}>
              {activeSubjectObj && (
                <>
                  <button
                    className={`${styles.categoryPill} ${
                      activeLargeCategory === 'all' ? styles.categoryPillActive : ''
                    }`}
                    onClick={() => setActiveLargeCategory('all')}
                  >
                    すべて ({activeSubjectObj.totalUnits})
                  </button>
                  {activeSubjectObj.largeCategories.map(cat => (
                    <button
                      key={cat.name}
                      className={`${styles.categoryPill} ${
                        activeLargeCategory === cat.name ? styles.categoryPillActive : ''
                      }`}
                      onClick={() => setActiveLargeCategory(cat.name)}
                    >
                      {cat.name} (教材{cat.filledMaterials} / テスト{cat.filledTests})
                    </button>
                  ))}
                </>
              )}
            </div>

            <div className={styles.searchAndStatus}>
              <div className={styles.searchInputWrapper}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="単元名・分野・コード(例: 二次関数, 数Ⅰ-001)で検索..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className={styles.statusSelect}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
              >
                <option value="available">📘 収録済コンテンツのみ表示</option>
                <option value="all">🗂️ カリキュラム全枠を表示（AI対応含む）</option>
                <option value="studying">🔖 学習中・未習得のみ</option>
                <option value="mastered">👑 習得済のみ</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* 4A. Daily AI Learning Package View (Preserved & Integrated) */}
      {activeSubjectId === 'daily_ai' ? (
        <div className={styles.largeCategoryBlock}>
          <div className={styles.largeCategoryHeader}>
            <h2 className={styles.largeCategoryTitle}>🤖 本日のAI重点学習パッケージ</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {dailyLearningContents.map((content: any, idx: number) => (
              <div
                key={idx}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: '16px',
                  padding: '24px',
                  background: '#F8FAFC',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    flexWrap: 'wrap',
                    gap: '12px',
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B' }}>
                    テーマ：{content.taskTitle}
                  </h3>
                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('startPomodoro', { detail: { task: content.taskTitle } })
                      )
                    }
                    className="btn btn-primary"
                  >
                    ⏱️ タイマー開始
                  </button>
                </div>
                <div
                  className="markdown-body"
                  style={{
                    background: '#FFFFFF',
                    padding: '20px',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                  }}
                >
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                    {content.textMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* 4B. Main Bookshelf View */
        <div className={styles.bookcaseContainer}>
          {visibleSubjects.map(subj => {
            const visibleCategories = subj.largeCategories
              .map(cat => {
                const filteredGroups = cat.mediumGroups
                  .map(g => ({
                    name: g.name,
                    units: g.units.filter(filterUnit),
                  }))
                  .filter(g => g.units.length > 0);
                return {
                  ...cat,
                  filteredGroups,
                  visibleCount: filteredGroups.reduce((acc, g) => acc + g.units.length, 0),
                };
              })
              .filter(cat => cat.visibleCount > 0);

            if (visibleCategories.length === 0) return null;

            return visibleCategories.map(cat => (
              <section key={`${subj.subjectId}-${cat.name}`} className={styles.largeCategoryBlock}>
                <div className={styles.largeCategoryHeader}>
                  <h2 className={styles.largeCategoryTitle}>
                    <span>{getSubjectIcon(subj.subjectName)}</span>
                    <span>{cat.name}</span>
                    {cat.prefix && <span className={styles.prefixBadge}>{cat.prefix}</span>}
                  </h2>
                  <div className={styles.largeCategoryStats}>
                    <span>全 {cat.units.length} 単元</span>
                    <span>•</span>
                    <span style={{ color: '#2563EB' }}>📘 テキスト {cat.filledMaterials} 冊</span>
                    <span>•</span>
                    <span style={{ color: '#059669' }}>📝 テスト {cat.filledTests} 単元</span>
                  </div>
                </div>

                {cat.filteredGroups.map(group => (
                  <div key={group.name} className={styles.shelfGroup}>
                    <div className={styles.shelfLabelRow}>
                      <div className={styles.shelfMediumTitle}>
                        <span>📂 {group.name}</span>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            color: '#64748B',
                            fontWeight: 600,
                          }}
                        >
                          ({group.units.length}冊)
                        </span>
                      </div>
                    </div>

                    <div className={styles.shelfBoard}>
                      <div className={styles.booksGrid}>
                        {group.units.map(unit => (
                          <BookCard
                            key={unit.unitKey}
                            unit={unit}
                            onSelect={u => {
                              setSelectedUnit(u);
                              setModalTab(
                                u.material ? 'material' : u.tests.all.length > 0 ? 'test' : 'material'
                              );
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            ));
          })}

          {/* Empty state when filter matches nothing */}
          {visibleSubjects.every(subj =>
            subj.largeCategories.every(cat => cat.units.filter(filterUnit).length === 0)
          ) && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '20px',
                border: '1px solid #E2E8F0',
                padding: '48px 24px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '2.4rem', marginBottom: '12px' }}>🔍</div>
              <h3 style={{ margin: '0 0 8px 0', color: '#1E293B' }}>
                条件に一致する学習コンテンツが見つかりません
              </h3>
              <p style={{ color: '#64748B', fontSize: '0.92rem', marginBottom: '20px' }}>
                まだ公式HTML教材が登録されていない科目・単元も、全枠表示に切り替えることでAI講義テキストや演習を利用できます。
              </p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                  setActiveLargeCategory('all');
                }}
              >
                🗂️ カリキュラム全枠を表示する
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. Book Reader & Test Station Modal */}
      {selectedUnit && (
        <div className={styles.modalOverlay} onClick={() => setSelectedUnit(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalBreadcrumb}>
                  <span
                    style={{
                      background: '#EEF2FF',
                      color: '#4338CA',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontWeight: 800,
                    }}
                  >
                    {selectedUnit.unitCode || selectedUnit.largeName}
                  </span>
                  <span>
                    {selectedUnit.subjectName} › {selectedUnit.largeName} › {selectedUnit.mediumName}
                  </span>
                </div>
                <h2 className={styles.modalUnitTitle}>{selectedUnit.smallName}</h2>
              </div>

              <div className={styles.modalHeaderActions}>
                <button
                  onClick={() => handleToggleUnitMastery(selectedUnit)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#10B981'
                      : '#CBD5E1',
                    background: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#ECFDF5'
                      : '#FFFFFF',
                    color: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#047857'
                      : '#334155',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  {(profile.completedTasks || []).includes(selectedUnit.smallName)
                    ? '👑 シラバス習得済 (解除)'
                    : '✅ この単元を習得済にする'}
                </button>

                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('startPomodoro', {
                        detail: { task: `${selectedUnit.largeName}: ${selectedUnit.smallName}` },
                      })
                    )
                  }
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid #BFDBFE',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  ⏱️ 集中タイマー
                </button>

                <button
                  onClick={() => setSelectedUnit(null)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: '#475569',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Mode Tabs */}
            <div className={styles.modalTabs}>
              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'material' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('material')}
              >
                <span>📘 学習テキストを読む</span>
                {selectedUnit.material && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: '#DBEAFE',
                      color: '#1D4ED8',
                      padding: '2px 7px',
                      borderRadius: '999px',
                    }}
                  >
                    公式HTML
                  </span>
                )}
              </button>

              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'test' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('test')}
              >
                <span>📝 理解度テスト (基礎・標準・応用)</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    background: selectedUnit.tests.all.length > 0 ? '#DCFCE7' : '#F1F5F9',
                    color: selectedUnit.tests.all.length > 0 ? '#15803D' : '#64748B',
                    padding: '2px 7px',
                    borderRadius: '999px',
                  }}
                >
                  {selectedUnit.tests.all.length > 0
                    ? `${selectedUnit.tests.all.length}レベル収録`
                    : 'AIドリル連動'}
                </span>
              </button>

              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'video' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('video')}
              >
                <span>📺 参考動画 & AIチューター質問</span>
              </button>
            </div>

            {/* Modal Content Area */}
            <div className={styles.modalBody}>
              {/* TAB 1: LEARNING MATERIAL */}
              {modalTab === 'material' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '12px' }}>
                  {selectedUnit.material ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', color: '#475569', fontWeight: 600 }}>
                          📖 公式学習コンテンツ: <strong>{selectedUnit.material.title}</strong>
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setModalTab('test')}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              border: '1px solid #10B981',
                              background: '#ECFDF5',
                              color: '#047857',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              cursor: 'pointer',
                            }}
                          >
                            📝 この単元の確認テストへ進む →
                          </button>
                          <Link
                            href={`/materials/${encodeURIComponent(selectedUnit.material.id)}`}
                            style={{
                              padding: '6px 14px',
                              borderRadius: '8px',
                              border: '1px solid #CBD5E1',
                              background: '#F8FAFC',
                              color: '#334155',
                              fontWeight: 700,
                              fontSize: '0.82rem',
                              textDecoration: 'none',
                            }}
                          >
                            ↗ 全画面ページで開く
                          </Link>
                        </div>
                      </div>

                      {loadingMaterial ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
                          テキストを読み込み中...
                        </div>
                      ) : materialHtml ? (
                        <iframe
                          srcDoc={materialHtml}
                          style={{
                            flex: 1,
                            width: '100%',
                            minHeight: '520px',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            background: '#FFFFFF',
                          }}
                          title={selectedUnit.smallName}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                        />
                      ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#EF4444' }}>
                          教材データの取得に失敗しました。
                        </div>
                      )}
                    </>
                  ) : (
                    /* AI Fallback Textbook Generator when HTML material is not yet uploaded */
                    <div
                      style={{
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '28px',
                        background: '#F8FAFC',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '12px',
                          marginBottom: '16px',
                        }}
                      >
                        <div>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 700,
                              color: '#6366F1',
                              background: '#EEF2FF',
                              padding: '3px 10px',
                              borderRadius: '999px',
                            }}
                          >
                            🤖 AIオンデマンド講義テキスト
                          </span>
                          <h3 style={{ margin: '8px 0 4px 0', color: '#0F172A' }}>
                            {selectedUnit.largeName}「{selectedUnit.smallName}」の要点講義
                          </h3>
                          <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748B' }}>
                            この単元の公式HTML教材は現在準備中です。AIチューターがその場で単元の公式・例題・要点を講義します。
                          </p>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            className="btn btn-primary"
                            disabled={generatingAiNote}
                            onClick={() => handleGenerateAiNote(selectedUnit)}
                          >
                            {generatingAiNote
                              ? '🔄 AI講義を生成中...'
                              : aiGeneratedNote
                              ? '🔄 AI講義を再生成'
                              : '✨ AI講義テキストを生成する'}
                          </button>
                          {aiGeneratedNote && (
                            <button
                              className="btn btn-secondary"
                              onClick={() => {
                                saveNote(
                                  `${selectedUnit.largeName}: ${selectedUnit.smallName}`,
                                  aiGeneratedNote
                                );
                                alert('学習ノートに保存しました！');
                              }}
                            >
                              📚 学習ノートに保存
                            </button>
                          )}
                        </div>
                      </div>

                      {generatingAiNote ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#475569' }}>
                          <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🤖</div>
                          AIチューターが「{selectedUnit.smallName}」のわかりやすい解説・例題を作成しています...
                        </div>
                      ) : aiGeneratedNote ? (
                        <div
                          className="markdown-body"
                          style={{
                            background: '#FFFFFF',
                            padding: '24px',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                          }}
                        >
                          <ReactMarkdown
                            remarkPlugins={[remarkMath, remarkGfm]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {aiGeneratedNote}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div
                          style={{
                            background: '#FFFFFF',
                            border: '1px dashed #CBD5E1',
                            borderRadius: '12px',
                            padding: '36px',
                            textAlign: 'center',
                            color: '#64748B',
                          }}
                        >
                          右上の「✨ AI講義テキストを生成する」ボタンを押すと、この単元の基礎概念・公式・典型例題を即座に生成します。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LEVEL TESTS (L1 / L2 / L3) */}
              {modalTab === 'test' && (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ margin: '0 0 6px 0', color: '#0F172A' }}>
                      📝 単元理解度テスト（3段階レベル別演習）
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748B' }}>
                      基礎（L1）→ 標準（L2）→ 応用（L3）の順にステップアップしましょう。回答実績と正答率はあなたのアカウントに自動記録されます。
                    </p>
                  </div>

                  {selectedUnit.tests.all.length > 0 ? (
                    <div className={styles.testCardsGrid}>
                      {(
                        [
                          {
                            key: 'l1',
                            title: 'L1 基礎テスト',
                            desc: '教科書の基本定義・公式の直接適用を確認する基礎問題集（30問）',
                            color: '#10B981',
                            bg: '#ECFDF5',
                            item: selectedUnit.tests.l1,
                            rec: selectedUnit.testRecords.l1,
                          },
                          {
                            key: 'l2',
                            title: 'L2 標準テスト',
                            desc: '定期テスト高得点〜共通テスト・入試標準レベルの典型問題集（30問）',
                            color: '#2563EB',
                            bg: '#EFF6FF',
                            item: selectedUnit.tests.l2,
                            rec: selectedUnit.testRecords.l2,
                          },
                          {
                            key: 'l3',
                            title: 'L3 応用テスト',
                            desc: '入試実戦・複合的な思考力を養う発展問題集（30問）',
                            color: '#EA580C',
                            bg: '#FFF7ED',
                            item: selectedUnit.tests.l3,
                            rec: selectedUnit.testRecords.l3,
                          },
                        ] as const
                      ).map(lv => {
                        const ans = lv.rec?.answeredCount || 0;
                        const cor = lv.rec?.correctCount || 0;
                        const fc = lv.rec?.firstCorrectCount || 0;
                        const total = lv.rec?.totalQuestions || 30;
                        const acc = ans > 0 ? Math.round((cor / ans) * 100) : 0;

                        return (
                          <div
                            key={lv.key}
                            className={styles.testLevelCard}
                            style={{ borderTop: `5px solid ${lv.color}` }}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  marginBottom: '10px',
                                }}
                              >
                                <span
                                  style={{
                                    background: lv.bg,
                                    color: lv.color,
                                    fontWeight: 800,
                                    fontSize: '0.85rem',
                                    padding: '4px 12px',
                                    borderRadius: '999px',
                                  }}
                                >
                                  {lv.title}
                                </span>
                                {ans > 0 ? (
                                  <span
                                    style={{
                                      fontSize: '0.8rem',
                                      fontWeight: 800,
                                      color: acc >= 80 ? '#15803D' : '#1D4ED8',
                                    }}
                                  >
                                    {acc >= 80 && ans >= 5 ? '👑 クリア済' : '🔥 挑戦中'} (正答率 {acc}%)
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>未受験</span>
                                )}
                              </div>

                              <p
                                style={{
                                  fontSize: '0.85rem',
                                  color: '#475569',
                                  lineHeight: 1.5,
                                  margin: '0 0 14px 0',
                                }}
                              >
                                {lv.desc}
                              </p>

                              {lv.item && (
                                <div
                                  style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    fontSize: '0.82rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      marginBottom: '6px',
                                    }}
                                  >
                                    <span style={{ color: '#64748B' }}>回答進捗:</span>
                                    <strong>
                                      {ans} / {total} 問
                                    </strong>
                                  </div>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      marginBottom: '6px',
                                    }}
                                  >
                                    <span style={{ color: '#64748B' }}>正解数 (初回正解):</span>
                                    <strong style={{ color: '#16A34A' }}>
                                      {cor} 問 ({fc} 問)
                                    </strong>
                                  </div>
                                  <div
                                    style={{
                                      height: '6px',
                                      background: '#E2E8F0',
                                      borderRadius: '999px',
                                      overflow: 'hidden',
                                      marginTop: '6px',
                                    }}
                                  >
                                    <div
                                      style={{
                                        width: `${Math.min(100, Math.round((ans / total) * 100))}%`,
                                        height: '100%',
                                        background: lv.color,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {lv.item ? (
                              <button
                                onClick={() =>
                                  router.push(`/tests/${encodeURIComponent(lv.item!.id)}`)
                                }
                                style={{
                                  width: '100%',
                                  padding: '12px',
                                  borderRadius: '10px',
                                  border: 'none',
                                  background: lv.color,
                                  color: '#FFFFFF',
                                  fontWeight: 800,
                                  fontSize: '0.92rem',
                                  cursor: 'pointer',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                }}
                              >
                                {ans > 0 ? '🚀 続きからテストを受ける →' : '🚀 テストを開始する →'}
                              </button>
                            ) : (
                              <div
                                style={{
                                  textAlign: 'center',
                                  padding: '10px',
                                  background: '#F1F5F9',
                                  color: '#94A3B8',
                                  borderRadius: '8px',
                                  fontSize: '0.84rem',
                                  fontWeight: 600,
                                }}
                              >
                                未収録
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '32px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>✏️</div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#0F172A' }}>
                        AIインタラクティブ演習でこの単元をテストする
                      </h4>
                      <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '20px' }}>
                        この単元のHTMLテスト問題集は現在準備中です。AIドリル機能を使って「{selectedUnit.smallName}」の確認テストをその場で生成・採点できます。
                      </p>
                      <button
                        className="btn btn-primary"
                        onClick={() =>
                          router.push(
                            `/drill?subject=${encodeURIComponent(
                              selectedUnit.subjectName
                            )}&topic=${encodeURIComponent(selectedUnit.smallName)}`
                          )
                        }
                      >
                        🚀 AIドリルで「{selectedUnit.smallName}」を解く →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VIDEOS & AI TUTOR */}
              {modalTab === 'video' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div
                    style={{
                      background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                      border: '1px solid #C7D2FE',
                      borderRadius: '16px',
                      padding: '20px 24px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', color: '#312E81', fontSize: '1.1rem' }}>
                        💬 AIチューターに「{selectedUnit.smallName}」を質問する
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.86rem', color: '#4338CA' }}>
                        テキストやテストで分からなかった問題を、対話形式で噛み砕いて教えてもらえます。
                      </p>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        router.push(
                          `/chat?initialMessage=${encodeURIComponent(
                            `${selectedUnit.largeName}の「${selectedUnit.smallName}」について、基本概念とよく出る問題の解き方を分かりやすく教えてください。`
                          )}`
                        )
                      }
                    >
                      💬 AIチューターと対話を始める →
                    </button>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#0F172A' }}>
                      📺 「{selectedUnit.smallName}」の関連授業動画
                    </h3>
                    {loadingVideos ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                        関連動画を検索中...
                      </div>
                    ) : unitVideos.length > 0 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                          gap: '16px',
                        }}
                      >
                        {unitVideos.slice(0, 3).map((video: any) => (
                          <div
                            key={video.id?.videoId || Math.random()}
                            style={{
                              border: '1px solid #E2E8F0',
                              borderRadius: '12px',
                              padding: '12px',
                              background: '#F8FAFC',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <iframe
                              width="100%"
                              height="185"
                              src={`https://www.youtube.com/embed/${video.id.videoId}?rel=0`}
                              title={video.snippet?.title || 'Video'}
                              frameBorder="0"
                              allowFullScreen
                              style={{ borderRadius: '8px' }}
                            />
                            <div
                              style={{
                                fontSize: '0.82rem',
                                fontWeight: 700,
                                color: '#334155',
                                lineHeight: 1.4,
                              }}
                            >
                              {video.snippet?.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '24px', color: '#64748B', fontSize: '0.9rem' }}>
                        関連動画が見つかりませんでした。
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>}>
      <LessonBookshelfContent />
    </Suspense>
  );
}
