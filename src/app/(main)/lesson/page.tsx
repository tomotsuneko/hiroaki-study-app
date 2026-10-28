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
  if (largeName.includes('数学Ⅰ')) return '#1E40AF';
  if (largeName.includes('数学Ａ')) return '#6D28D9';
  if (largeName.includes('数学Ⅱ')) return '#0369A1';
  if (largeName.includes('数学Ｂ')) return '#4338CA';
  if (largeName.includes('数学Ⅲ') || largeName.includes('数学Ｃ')) return '#1E3A8A';
  if (largeName.includes('物理')) return '#0F766E';
  if (largeName.includes('化学')) return '#C2410C';
  if (largeName.includes('生物')) return '#15803D';
  if (largeName.includes('地学')) return '#B45309';
  if (subjectName.includes('英語')) return '#0284C7';
  if (subjectName.includes('国語')) return '#BE123C';
  if (subjectName.includes('社会')) return '#92400E';
  if (subjectName.includes('情報')) return '#334155';
  return '#3B82F6';
}

function getSubjectFloorName(subjectName: string): { icon: string; title: string; floor: string } {
  if (subjectName.includes('数学')) return { icon: '📐', title: '数学の書架', floor: '1F' };
  if (subjectName.includes('理科')) return { icon: '🔬', title: '理科の書架', floor: '2F' };
  if (subjectName.includes('英語')) return { icon: '🔤', title: '外国語・英語の書架', floor: '3F' };
  if (subjectName.includes('国語')) return { icon: '✒️', title: '国語の書架', floor: '4F' };
  if (subjectName.includes('社会')) return { icon: '🌍', title: '地歴・公民の書架', floor: '5F' };
  if (subjectName.includes('情報')) return { icon: '💻', title: '情報の書架', floor: '6F' };
  return { icon: '📘', title: `${subjectName}の書架`, floor: '書架' };
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
        <span key={label} className={`${styles.levelDot} ${styles.dotMissing}`} title={`${label}: 未配架`}>
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
            <span className={`${styles.bookStatusBadge} ${styles.statusMastered}`}>👑 読了・習得</span>
          ) : unit.status === 'studying' ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusStudying}`}>
              🔖 読書中 {unit.bestAccuracy !== null ? `${unit.bestAccuracy}%` : ''}
            </span>
          ) : unit.status === 'ready' ? (
            <span className={`${styles.bookStatusBadge} ${styles.statusReady}`}>配架済</span>
          ) : (
            <span className={`${styles.bookStatusBadge} ${styles.statusUpcoming}`}>AI講義</span>
          )}
        </div>

        <h4 className={styles.bookTitle}>{unit.smallName}</h4>
        <div style={{ fontSize: '0.74rem', color: '#78716C', marginBottom: '8px', fontWeight: 600 }}>
          {unit.largeName} › {unit.mediumName}
        </div>
      </div>

      <div className={styles.bookBelt}>
        <span
          className={`${styles.materialPill} ${
            hasMaterial ? styles.materialHasHtml : styles.materialAiFallback
          }`}
        >
          {hasMaterial ? '📘 テキスト' : '🤖 AI講義'}
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

const materialHtmlCache = new Map<string, string>();

function LessonBookshelfContent() {
  const {
    profile,
    setProfile,
    saveNote,
    studyData,
    catalog,
    isDataReady,
    recordMaterialStudy,
  } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedTask = searchParams.get('task') || searchParams.get('unit');
  const requestedTab = searchParams.get('tab');

  const syllabus = studyData.syllabus || [];
  const dailyLearningContents = useMemo(() => {
    if (studyData.dailyAnalysis?.learningContents) {
      return studyData.dailyAnalysis.learningContents;
    }
    if (studyData.dailyAnalysis?.learningContent) {
      return [studyData.dailyAnalysis.learningContent];
    }
    return [];
  }, [studyData.dailyAnalysis]);

  const loading = !isDataReady && studyData.curriculum.length === 0;

  // Bookshelf UI filters
  const [activeSubjectId, setActiveSubjectId] = useState<string>('all');
  const [activeLargeCategory, setActiveLargeCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'available' | 'all' | 'studying' | 'mastered'>('available');
  const [isModalMaximized, setIsModalMaximized] = useState<boolean>(false);

  // Selected Unit Modal state
  const [selectedUnit, setSelectedUnit] = useState<UnifiedUnit | null>(null);
  const [modalTab, setModalTab] = useState<'material' | 'test' | 'video'>('material');
  const [materialHtml, setMaterialHtml] = useState<string | null>(null);
  const [loadingMaterial, setLoadingMaterial] = useState(false);
  const [aiGeneratedNote, setAiGeneratedNote] = useState<string>('');
  const [generatingAiNote, setGeneratingAiNote] = useState(false);
  const [unitVideos, setUnitVideos] = useState<any[]>([]);
  const [loadingVideos, setLoadingVideos] = useState(false);

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

  // Load HTML content (with in-memory cache) and record textbook view when a unit is opened
  useEffect(() => {
    if (!selectedUnit) {
      setMaterialHtml(null);
      setAiGeneratedNote('');
      setUnitVideos([]);
      return;
    }

    // Record content usage (material view) to user's study history
    recordMaterialStudy({
      unitCode: selectedUnit.unitCode || selectedUnit.unitKey,
      title: selectedUnit.smallName,
      subject: selectedUnit.subjectName,
      completed: false,
    });

    const existingDaily = dailyLearningContents.find(
      (c: any) =>
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
      const matId = selectedUnit.material.id;
      const cachedHtml = materialHtmlCache.get(matId);
      if (cachedHtml) {
        setMaterialHtml(cachedHtml);
        setLoadingMaterial(false);
        return;
      }

      setLoadingMaterial(true);
      fetch(`/api/materials/${encodeURIComponent(matId)}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.material?.content) {
            materialHtmlCache.set(matId, d.material.content);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUnit?.unitKey]);

  // Load YouTube videos when reading modal tab is 'video'
  useEffect(() => {
    if (!selectedUnit || modalTab !== 'video') return;
    setLoadingVideos(true);
    const q = `${selectedUnit.largeName} ${selectedUnit.smallName} 高校 授業`;
    fetch(`/api/youtube?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) => setUnitVideos(d.items || []))
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
1. 単元のコアポイント・定義・公式の解説
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

  // Toggle syllabus task completion & persist textbook completion (+15 min study time on completion)
  const handleToggleUnitMastery = (unit: UnifiedUnit) => {
    const current = profile.completedTasks || [];
    const exists =
      current.includes(unit.smallName) ||
      (studyData.masteredUnits || []).includes(unit.smallName);
    const updated = exists
      ? current.filter((t) => t !== unit.smallName)
      : [...current, unit.smallName];
    setProfile({ ...profile, completedTasks: updated });

    if (!exists) {
      recordMaterialStudy({
        unitCode: unit.unitCode || unit.unitKey,
        title: unit.smallName,
        subject: unit.subjectName,
        completed: true,
        minutes: 15,
      });
    }
  };

  // Check if current selectedUnit is bookmarked in savedNotes
  const currentBookmark = useMemo(() => {
    if (!selectedUnit) return null;
    return (profile.savedNotes || []).find((n) => {
      if (selectedUnit.unitCode && n.unitCode === selectedUnit.unitCode) return true;
      if (selectedUnit.material && n.materialId === selectedUnit.material.id) return true;
      if (n.unitCode && n.unitCode === selectedUnit.smallName) return true;
      if (n.title.includes(selectedUnit.smallName)) return true;
      return false;
    });
  }, [selectedUnit, profile.savedNotes]);

  const [bookmarkFeedback, setBookmarkFeedback] = useState<string | null>(null);

  const handleToggleBookmark = () => {
    if (!selectedUnit) return;
    if (currentBookmark) {
      setBookmarkFeedback('この教材はすでに学習ノートにしおり保存されています。');
      setTimeout(() => setBookmarkFeedback(null), 3500);
      return;
    }

    const title = `🔖 ${selectedUnit.subjectName}「${selectedUnit.smallName}」`;
    const content = `【教材しおり】\n・科目: ${selectedUnit.subjectName}\n・分野: ${selectedUnit.largeName} › ${selectedUnit.mediumName}\n・単元: ${selectedUnit.smallName}\n・教材ID: ${selectedUnit.material?.id || '-'}\n・登録日: ${new Date().toLocaleDateString('ja-JP')}\n\n※このノートから直接教材を開いて続きを学習できます。`;

    saveNote(title, content, {
      materialId: selectedUnit.material?.id,
      unitCode: selectedUnit.unitCode || selectedUnit.smallName,
      isBookmark: true,
    });

    setBookmarkFeedback('🔖 しおりを学習ノートに保存しました！「学習ノート」からいつでも再開できます。');
    setTimeout(() => setBookmarkFeedback(null), 4000);
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
          reason: u.bestAccuracy !== null && u.bestAccuracy < 75 ? '🎯 弱点克服本' : '🔖 読書中',
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
                reason: task.type === 'weakness' ? '🔥 重点弱点本' : '🗺️ シラバス推奨本',
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
          picked.push({ unit: u, reason: '⭐ 図書館おすすめ本' });
        }
      }
    }

    return picked.slice(0, 6);
  }, [catalog.units, syllabus, profile.completedTasks]);

  // Library Overall Stats
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

  const activeSubjectObj = useMemo(
    () => catalog.subjects.find(s => s.subjectId === activeSubjectId) || null,
    [catalog.subjects, activeSubjectId]
  );

  const visibleSubjects = useMemo(() => {
    if (activeSubjectId === 'all') {
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
      <div style={{ padding: '80px 20px', textAlign: 'center', color: '#78716C' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🏛️</div>
        <div style={{ fontWeight: '800', fontSize: '1.2rem', color: '#1C1917', marginBottom: '6px' }}>
          デジタル学習図書館を開館中...
        </div>
        <div style={{ fontSize: '0.9rem', color: '#78716C' }}>
          カリキュラム全書架、学習テキスト、理解度テストを配架しています
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 1. 図書館エントランス & 蔵書カウンター */}
      <header className={styles.libraryHeaderCard}>
        <div className={styles.headerLeft}>
          <div className={styles.libraryBadge}>🏛️ DIGITAL STUDY LIBRARY & TESTING HUB</div>
          <h1 className={styles.title}>学習コンテンツ図書館</h1>
          <p className={styles.subtitle}>
            各科目の書架から学びたい単元の本を手に取り、公式テキストの読書と3段階レベル別テスト（L1基礎 / L2標準 / L3応用）の演習を行えます。<br />
            テストの採点結果や読了実績はあなたのアカウントに自動記録され、合格逆算シラバスに直結します。
          </p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>📘 配架テキスト</span>
            <span className={styles.statValue}>{totalMaterialsCount} 冊</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>📝 配架テスト単元</span>
            <span className={styles.statValue}>{totalTestUnitsCount} 単元</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>🔖 読書・演習中</span>
            <span className={styles.statValue} style={{ color: '#93C5FD' }}>
              {studyingCount} 単元
            </span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLabel}>👑 読了・習得済</span>
            <span className={styles.statValue} style={{ color: '#86EFAC' }}>
              {masteredCount} 単元
            </span>
          </div>
        </div>
      </header>

      {/* 2. 図書館の特設展示コーナー（シラバス・復習推奨本） */}
      {pickupUnits.length > 0 && !searchQuery && (
        <section className={styles.pickupSection}>
          <div className={styles.pickupHeader}>
            <div>
              <h2 className={styles.pickupTitle}>
                🌟 本日の特設展示（学習シラバス・弱点復習おすすめ本）
              </h2>
              <span className={styles.pickupSub}>
                個別シラバスの進行中タスクや、テスト結果から復習が推奨される単元本を優先配架しています
              </span>
            </div>
            <Link
              href="/plan"
              style={{
                fontSize: '0.86rem',
                fontWeight: 800,
                color: '#78350F',
                background: '#FFFFFF',
                border: '1px solid #D97706',
                padding: '7px 16px',
                borderRadius: '999px',
                textDecoration: 'none',
                boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
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

      {/* 3. 書架フロア案内 & 検索操作パネル */}
      <section className={styles.controlsPanel}>
        <div className={styles.floorGuideHeader}>
          <div className={styles.floorGuideTitle}>
            <span>🧭</span>
            <span>書架フロア案内（読みたい科目を選択してください）</span>
          </div>
        </div>

        <div className={styles.subjectTabs}>
          <button
            className={`${styles.subjectTab} ${activeSubjectId === 'all' ? styles.subjectTabActive : ''}`}
            onClick={() => {
              setActiveSubjectId('all');
              setActiveLargeCategory('all');
            }}
          >
            <span>🏛️ 全書架（総合閲覧）</span>
            <span className={styles.subjectCountBadge}>
              {totalMaterialsCount > 0 ? `${totalMaterialsCount}冊配架` : '全蔵書'}
            </span>
          </button>

          {catalog.subjects.map(subj => {
            const floorInfo = getSubjectFloorName(subj.subjectName);
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
                  if (hasContentCount === 0 && statusFilter === 'available') {
                    setStatusFilter('all');
                  }
                }}
              >
                <span>
                  {floorInfo.icon} {floorInfo.title}
                </span>
                <span className={styles.subjectCountBadge}>
                  {hasContentCount > 0 ? `${hasContentCount}冊` : `${subj.totalUnits}枠`}
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
              <span>🤖 本日のAI重点展示 ({dailyLearningContents.length})</span>
            </button>
          )}
        </div>

        {activeSubjectId !== 'daily_ai' && (
          <div className={styles.filterRow}>
            {/* 分野・大分類ピル */}
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
                      {cat.name} (テキスト{cat.filledMaterials} / テスト{cat.filledTests})
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
                  placeholder="本を検索（単元名・分野・コード 例: 二次関数, 数Ⅰ-001）..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              <select
                className={styles.statusSelect}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
              >
                <option value="available">📘 すぐ読める本（教材・テスト配架済）</option>
                <option value="all">🗂️ 全カリキュラム枠を表示（AI講義対応含む）</option>
                <option value="studying">🔖 読書中・未習得の本</option>
                <option value="mastered">👑 読了・習得済の本</option>
              </select>
            </div>
          </div>
        )}
      </section>

      {/* 4A. 本日のAI重点パッケージ表示 */}
      {activeSubjectId === 'daily_ai' ? (
        <div className={styles.largeCategoryBlock}>
          <div className={styles.largeCategoryHeader}>
            <h2 className={styles.largeCategoryTitle}>🤖 本日のAI重点学習展示</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {dailyLearningContents.map((content: any, idx: number) => (
              <div
                key={idx}
                style={{
                  border: '1px solid #E7E5E4',
                  borderRadius: '18px',
                  padding: '26px',
                  background: '#FAFAF9',
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
                  <h3 style={{ margin: 0, fontSize: '1.3rem', color: '#1C1917' }}>
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
                    ⏱️ 集中タイマー開始
                  </button>
                </div>
                <div
                  className="markdown-body"
                  style={{
                    background: '#FFFFFF',
                    padding: '24px',
                    borderRadius: '14px',
                    border: '1px solid #E7E5E4',
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
        /* 4B. 木製書架ビュー（メイン図書館ビュー） */
        <div className={styles.bookcaseContainer}>
          {visibleSubjects.map(subj => {
            const floorInfo = getSubjectFloorName(subj.subjectName);
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
                    <span>{floorInfo.icon}</span>
                    <span>{cat.name}</span>
                    {cat.prefix && <span className={styles.prefixBadge}>{cat.prefix}</span>}
                  </h2>
                  <div className={styles.largeCategoryStats}>
                    <span>全 {cat.units.length} 単元</span>
                    <span>•</span>
                    <span style={{ color: '#1D4ED8' }}>📘 テキスト {cat.filledMaterials} 冊</span>
                    <span>•</span>
                    <span style={{ color: '#047857' }}>📝 テスト {cat.filledTests} 単元</span>
                  </div>
                </div>

                {cat.filteredGroups.map(group => (
                  <div key={group.name} className={styles.shelfGroup}>
                    <div className={styles.shelfLabelRow}>
                      <div className={styles.shelfMediumTitle}>
                        <span>🏷️ {group.name}</span>
                        <span className={styles.shelfPlate}>
                          {group.units.length} 冊配架
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

          {/* 該当蔵書なし時のフォールバック案内 */}
          {visibleSubjects.every(subj =>
            subj.largeCategories.every(cat => cat.units.filter(filterUnit).length === 0)
          ) && (
            <div
              style={{
                background: '#FFFFFF',
                borderRadius: '22px',
                border: '1px solid #E7E5E4',
                padding: '50px 24px',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: '2.8rem', marginBottom: '14px' }}>🏛️</div>
              <h3 style={{ margin: '0 0 10px 0', color: '#1C1917', fontSize: '1.25rem' }}>
                条件に一致する蔵書が見つかりませんでした
              </h3>
              <p style={{ color: '#78716C', fontSize: '0.94rem', marginBottom: '22px', maxWidth: '600px', margin: '0 auto 24px auto', lineHeight: 1.6 }}>
                まだ公式HTML教材が登録されていない科目・単元も、「全カリキュラム枠を表示」に切り替えることで、AIオンデマンド講義テキストや演習ドリルをご利用いただけます。
              </p>
              <button
                className="btn btn-primary"
                style={{ padding: '12px 28px', fontSize: '1rem', fontWeight: 800 }}
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                  setActiveLargeCategory('all');
                }}
              >
                🗂️ カリキュラム全書架を表示する
              </button>
            </div>
          )}
        </div>
      )}

      {/* 5. 閲覧席（読書・テストステーションモーダル） */}
      {selectedUnit && (
        <div className={styles.modalOverlay} onClick={() => setSelectedUnit(null)}>
          <div
            className={`${styles.modalCard} ${isModalMaximized ? styles.modalCardMaximized : ''}`}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.modalBreadcrumb}>
                  <span
                    style={{
                      background: '#FEF3C7',
                      color: '#78350F',
                      border: '1px solid #FDE68A',
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
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid',
                    borderColor: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#10B981'
                      : '#D6D3D1',
                    background: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#ECFDF5'
                      : '#FFFFFF',
                    color: (profile.completedTasks || []).includes(selectedUnit.smallName)
                      ? '#047857'
                      : '#44403C',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                  }}
                >
                  {(profile.completedTasks || []).includes(selectedUnit.smallName)
                    ? '👑 読了・習得済 (解除)'
                    : '✅ この本を読了・習得済にする'}
                </button>

                {/* 🔖 学習ノートにしおり保存ボタン */}
                <button
                  onClick={handleToggleBookmark}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: currentBookmark ? '1px solid #F59E0B' : '1px solid #CBD5E1',
                    background: currentBookmark ? '#FEF3C7' : '#FFFFFF',
                    color: currentBookmark ? '#B45309' : '#1E293B',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                  title={currentBookmark ? '学習ノートにしおり保存済み' : 'この教材を学習ノートにしおり保存'}
                >
                  <span>{currentBookmark ? '🔖' : '📑'}</span>
                  {currentBookmark ? 'しおり保存済' : 'しおりを挟む'}
                </button>

                {/* 🗗 別ウィンドウで開くボタン */}
                {selectedUnit.material && (
                  <button
                    onClick={() =>
                      window.open(
                        `/materials/${encodeURIComponent(selectedUnit.material!.id)}`,
                        '_blank',
                        'noopener,noreferrer'
                      )
                    }
                    style={{
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      color: '#1E293B',
                      fontWeight: 800,
                      fontSize: '0.86rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    }}
                    title="別ウィンドウで教材を開く"
                  >
                    <span>🗗</span> 別ウィンドウ
                  </button>
                )}

                {/* ⛶ 最大化 / 通常サイズ切替ボタン */}
                <button
                  onClick={() => setIsModalMaximized(!isModalMaximized)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    border: '1px solid #CBD5E1',
                    background: '#FFFFFF',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title={isModalMaximized ? '通常サイズに戻す' : '画面全体に最大化'}
                >
                  {isModalMaximized ? '❐' : '⛶'}
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
                    padding: '8px 16px',
                    borderRadius: '10px',
                    border: '1px solid #BFDBFE',
                    background: '#EFF6FF',
                    color: '#1D4ED8',
                    fontWeight: 800,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                  }}
                >
                  ⏱️ 集中タイマー
                </button>

                <button
                  onClick={() => setSelectedUnit(null)}
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    border: '1px solid #D6D3D1',
                    background: '#FFFFFF',
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    color: '#57534E',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {bookmarkFeedback && (
              <div
                style={{
                  background: '#FEF3C7',
                  borderBottom: '1px solid #FDE68A',
                  color: '#92400E',
                  padding: '10px 24px',
                  fontSize: '0.88rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  animation: 'fadeIn 0.2s ease-in-out',
                }}
              >
                <span>{bookmarkFeedback}</span>
                <Link
                  href="/library"
                  style={{
                    background: '#B45309',
                    color: '#FFFFFF',
                    padding: '5px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  学習ノートを見る →
                </Link>
              </div>
            )}

            {/* Reading Modes Tabs */}
            <div className={styles.modalTabs}>
              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'material' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('material')}
              >
                <span>📘 公式テキストを読む</span>
                {selectedUnit.material && (
                  <span
                    style={{
                      fontSize: '0.74rem',
                      background: '#DBEAFE',
                      color: '#1D4ED8',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      fontWeight: 800,
                    }}
                  >
                    蔵書あり
                  </span>
                )}
              </button>

              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'test' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('test')}
              >
                <span>📝 単元理解度テスト (L1・L2・L3)</span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    background: selectedUnit.tests.all.length > 0 ? '#DCFCE7' : '#F5F5F4',
                    color: selectedUnit.tests.all.length > 0 ? '#15803D' : '#78716C',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontWeight: 800,
                  }}
                >
                  {selectedUnit.tests.all.length > 0
                    ? `${selectedUnit.tests.all.length}レベル配架`
                    : 'AIドリル'}
                </span>
              </button>

              <button
                className={`${styles.modalTabBtn} ${
                  modalTab === 'video' ? styles.modalTabBtnActive : ''
                }`}
                onClick={() => setModalTab('video')}
              >
                <span>📺 参考授業動画 & AIチューター</span>
              </button>
            </div>

            {/* Reading Desk Body */}
            <div className={styles.modalBody}>
              {/* TAB 1: LEARNING MATERIAL */}
              {modalTab === 'material' && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '14px' }}>
                  {selectedUnit.material ? (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                        }}
                      >
                        <span style={{ fontSize: '0.88rem', color: '#44403C', fontWeight: 700 }}>
                          📖 配架テキスト: <strong>{selectedUnit.material.title}</strong>
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setModalTab('test')}
                            style={{
                              padding: '7px 16px',
                              borderRadius: '8px',
                              border: '1px solid #10B981',
                              background: '#ECFDF5',
                              color: '#047857',
                              fontWeight: 800,
                              fontSize: '0.84rem',
                              cursor: 'pointer',
                            }}
                          >
                            📝 この単元のテストに進む →
                          </button>
                          <button
                            onClick={handleToggleBookmark}
                            style={{
                              padding: '7px 16px',
                              borderRadius: '8px',
                              border: currentBookmark ? '1px solid #F59E0B' : '1px solid #CBD5E1',
                              background: currentBookmark ? '#FEF3C7' : '#FFFFFF',
                              color: currentBookmark ? '#B45309' : '#1C1917',
                              fontWeight: 800,
                              fontSize: '0.84rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                            title={currentBookmark ? '学習ノートにしおり保存済み' : '学習ノートにしおり保存'}
                          >
                            <span>{currentBookmark ? '🔖' : '📑'}</span>
                            {currentBookmark ? '学習ノートにしおり保存済' : '学習ノートにしおり保存'}
                          </button>
                        </div>
                      </div>

                      {loadingMaterial ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#78716C' }}>
                          テキストを読み込み中...
                        </div>
                      ) : materialHtml ? (
                        <iframe
                          srcDoc={materialHtml}
                          style={{
                            flex: 1,
                            width: '100%',
                            minHeight: isModalMaximized ? 'calc(100vh - 180px)' : 'calc(96vh - 200px)',
                            height: '100%',
                            border: '1px solid #E7E5E4',
                            borderRadius: '14px',
                            background: '#FFFFFF',
                          }}
                          title={selectedUnit.smallName}
                          sandbox="allow-scripts allow-same-origin allow-popups"
                        />
                      ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#DC2626' }}>
                          テキストデータの取得に失敗しました。
                        </div>
                      )}
                    </>
                  ) : (
                    <div
                      style={{
                        border: '1px solid #E7E5E4',
                        borderRadius: '18px',
                        padding: '30px',
                        background: '#FAFAF9',
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
                              fontWeight: 800,
                              color: '#92400E',
                              background: '#FEF3C7',
                              border: '1px solid #FDE68A',
                              padding: '3px 10px',
                              borderRadius: '999px',
                            }}
                          >
                            🤖 AIオンデマンド講義テキスト
                          </span>
                          <h3 style={{ margin: '8px 0 4px 0', color: '#1C1917', fontSize: '1.25rem' }}>
                            {selectedUnit.largeName}「{selectedUnit.smallName}」の要点講義
                          </h3>
                          <p style={{ margin: 0, fontSize: '0.88rem', color: '#78716C' }}>
                            この単元の公式HTML教材は現在準備中です。AIチューターがその場で単元の定義・公式・典型例題を解説します。
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
                                  aiGeneratedNote,
                                  { unitCode: selectedUnit.unitCode || selectedUnit.smallName }
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
                        <div style={{ padding: '50px', textAlign: 'center', color: '#44403C' }}>
                          <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>🤖</div>
                          AIチューターが「{selectedUnit.smallName}」の講義テキストを作成しています...
                        </div>
                      ) : aiGeneratedNote ? (
                        <div
                          className="markdown-body"
                          style={{
                            background: '#FFFFFF',
                            padding: '26px',
                            borderRadius: '14px',
                            border: '1px solid #E7E5E4',
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
                            border: '1px dashed #D6D3D1',
                            borderRadius: '14px',
                            padding: '40px',
                            textAlign: 'center',
                            color: '#78716C',
                          }}
                        >
                          右上の「✨ AI講義テキストを生成する」ボタンを押すと、この単元の基礎概念・公式・典型例題を即座に生成します。
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: LEVEL TESTS */}
              {modalTab === 'test' && (
                <div>
                  <div style={{ marginBottom: '22px' }}>
                    <h3 style={{ margin: '0 0 6px 0', color: '#1C1917', fontSize: '1.25rem' }}>
                      📝 単元理解度テスト（3段階レベル別演習）
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.92rem', color: '#78716C' }}>
                      基礎（L1）→ 標準（L2）→ 応用（L3）の順に挑戦しましょう。採点結果と正答率は自動的にクラウド保存され、シラバスの習得ステータスに反映されます。
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
                                    fontSize: '0.86rem',
                                    padding: '4px 12px',
                                    borderRadius: '999px',
                                  }}
                                >
                                  {lv.title}
                                </span>
                                {ans > 0 ? (
                                  <span
                                    style={{
                                      fontSize: '0.82rem',
                                      fontWeight: 800,
                                      color: acc >= 80 ? '#15803D' : '#1D4ED8',
                                    }}
                                  >
                                    {acc >= 80 && ans >= 5 ? '👑 クリア済' : '🔥 演習中'} (正答率 {acc}%)
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: '#A8A29E' }}>未受験</span>
                                )}
                              </div>

                              <p
                                style={{
                                  fontSize: '0.86rem',
                                  color: '#57534E',
                                  lineHeight: 1.5,
                                  margin: '0 0 14px 0',
                                }}
                              >
                                {lv.desc}
                              </p>

                              {lv.item && (
                                <div
                                  style={{
                                    background: '#F5F5F4',
                                    border: '1px solid #E7E5E4',
                                    borderRadius: '10px',
                                    padding: '12px',
                                    fontSize: '0.84rem',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      marginBottom: '6px',
                                    }}
                                  >
                                    <span style={{ color: '#78716C' }}>回答進捗:</span>
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
                                    <span style={{ color: '#78716C' }}>正解数 (初回正解):</span>
                                    <strong style={{ color: '#16A34A' }}>
                                      {cor} 問 ({fc} 問)
                                    </strong>
                                  </div>
                                  <div
                                    style={{
                                      height: '6px',
                                      background: '#E7E5E4',
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
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                                    fontSize: '0.94rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                                  }}
                                >
                                  {ans > 0 ? '🚀 続きからテストを受ける →' : '🚀 テストを開始する →'}
                                </button>
                                <button
                                  onClick={() =>
                                    window.open(
                                      `/tests/${encodeURIComponent(lv.item!.id)}`,
                                      '_blank',
                                      'noopener,noreferrer'
                                    )
                                  }
                                  style={{
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#475569',
                                    fontWeight: 700,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <span>🗗</span> 別ウィンドウで受験する
                                </button>
                              </div>
                            ) : (
                              <div
                                style={{
                                  textAlign: 'center',
                                  padding: '10px',
                                  background: '#F5F5F4',
                                  color: '#A8A29E',
                                  borderRadius: '8px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                }}
                              >
                                未配架
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: '#FAFAF9',
                        border: '1px solid #E7E5E4',
                        borderRadius: '18px',
                        padding: '36px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '2.4rem', marginBottom: '10px' }}>✏️</div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '1.15rem', color: '#1C1917' }}>
                        AI演習ドリルでこの単元をテストする
                      </h4>
                      <p style={{ color: '#78716C', fontSize: '0.92rem', marginBottom: '22px' }}>
                        この単元のHTMLテスト問題集は現在準備中です。AIドリル機能を使って「{selectedUnit.smallName}」の確認テストをその場で自動生成・採点できます。
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
                      background: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)',
                      border: '1px solid #F59E0B',
                      borderRadius: '16px',
                      padding: '22px 26px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', color: '#78350F', fontSize: '1.15rem' }}>
                        💬 AIチューターに「{selectedUnit.smallName}」を質問する
                      </h3>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: '#92400E' }}>
                        テキストやテストで疑問に思った解法や公式の成り立ちを、対話形式で質問できます。
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
                      💬 AIチューターに質問する →
                    </button>
                  </div>

                  <div>
                    <h3 style={{ margin: '0 0 14px 0', fontSize: '1.15rem', color: '#1C1917' }}>
                      📺 「{selectedUnit.smallName}」の参考講義動画
                    </h3>
                    {loadingVideos ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#78716C' }}>
                        関連講義動画を検索中...
                      </div>
                    ) : unitVideos.length > 0 ? (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                          gap: '18px',
                        }}
                      >
                        {unitVideos.slice(0, 3).map((video: any) => (
                          <div
                            key={video.id?.videoId || Math.random()}
                            style={{
                              border: '1px solid #E7E5E4',
                              borderRadius: '14px',
                              padding: '12px',
                              background: '#FAFAF9',
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
                              style={{ borderRadius: '10px' }}
                            />
                            <div
                              style={{
                                fontSize: '0.84rem',
                                fontWeight: 800,
                                color: '#292524',
                                lineHeight: 1.4,
                              }}
                            >
                              {video.snippet?.title}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ padding: '24px', color: '#78716C', fontSize: '0.9rem' }}>
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
    <Suspense fallback={<div style={{ padding: '60px', textAlign: 'center' }}>読み込み中...</div>}>
      <LessonBookshelfContent />
    </Suspense>
  );
}
