'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from './flashcard.module.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import {
  buildUnifiedCatalog,
  UnifiedUnit,
  TestRecordSummary,
  ContentItem,
  CurriculumSubject,
} from '@/lib/content-slots';

type Flashcard = {
  id: string;
  subject: string;
  unitCode?: string;
  topic?: string;
  front: string;
  back: string;
  nextReview?: number;
  interval?: number;
};

function FlashcardCenterContent() {
  const { profile, studyData, catalog: unifiedCatalog, refreshStudyData } = useUser();
  const searchParams = useSearchParams();

  const paramSubject = searchParams.get('subject') || '';
  const paramTopic = searchParams.get('topic') || searchParams.get('task') || '';
  const paramUnitCode = searchParams.get('unit') || '';

  // Tabs: 'push' (復習・弱点Push), 'pull' (単元選択・公式テキスト抽出Pull), 'library' (マイカード一覧・赤シート)
  const [activeTab, setActiveTab] = useState<'push' | 'pull' | 'library'>('push');

  // Player display mode: 'flip' (3Dカードめくり) | 'redsheet' (一問一答・赤シート一覧)
  const [playerViewMode, setPlayerViewMode] = useState<'flip' | 'redsheet'>('flip');
  const [redSheetActive, setRedSheetActive] = useState<boolean>(true);
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});

  // Active Deck State
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [deckTitle, setDeckTitle] = useState<string>('本日の復習・重点暗記デッキ');
  const [activeDeckMeta, setActiveDeckMeta] = useState<{
    subject: string;
    topic: string;
    unitCode: string;
  }>({ subject: '', topic: '', unitCode: '' });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [reviewedCountToday, setReviewedCountToday] = useState(0);

  // Saved Cards Library State (initialized from global studyData cache for 0ms render!)
  const [allSavedCards, setAllSavedCards] = useState<Flashcard[]>(
    () => (studyData.flashcards as Flashcard[]) || []
  );
  const [librarySubjectFilter, setLibrarySubjectFilter] = useState<string>('すべて');
  const [librarySearch, setLibrarySearch] = useState<string>('');

  // Manual Add Card Form State
  const [newCardSubject, setNewCardSubject] = useState<string>('数学');
  const [newCardFront, setNewCardFront] = useState<string>('');
  const [newCardBack, setNewCardBack] = useState<string>('');
  const [isAddingManual, setIsAddingManual] = useState<boolean>(false);

  // Pull Selector State
  const [selectedSubject, setSelectedSubject] = useState<string>('数学');
  const [selectedLargeCat, setSelectedLargeCat] = useState<string>('すべて');
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('');
  const [customTopic, setCustomTopic] = useState<string>('');

  // Sync when global studyData.flashcards updates
  useEffect(() => {
    if (Array.isArray(studyData.flashcards) && studyData.flashcards.length > 0) {
      setAllSavedCards(studyData.flashcards as Flashcard[]);
    }
  }, [studyData.flashcards]);

  const dueSavedCards = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return allSavedCards.filter((c: any) => {
      if (!c.nextReviewDate && !c.nextReview) return true;
      if (c.nextReview && c.nextReview <= Date.now()) return true;
      if (c.nextReviewDate && c.nextReviewDate <= todayStr) return true;
      return false;
    });
  }, [allSavedCards]);

  // Refresh saved cards from server & update global cache
  const refreshSavedCards = async () => {
    try {
      const res = await fetch('/api/flashcard');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.allCards)) {
          setAllSavedCards(data.allCards);
        }
      }
      refreshStudyData(false);
    } catch (e) {
      console.error('Failed to fetch saved flashcards:', e);
    }
  };

  // Weak units from Official Test History (<80% accuracy) + feedbackQueue
  const weakUnits = useMemo(() => {
    return unifiedCatalog.units
      .filter((u) => u.totalAnswered > 0 && (u.bestAccuracy === null || u.bestAccuracy < 80))
      .sort((a, b) => (a.bestAccuracy ?? 0) - (b.bestAccuracy ?? 0));
  }, [unifiedCatalog.units]);

  // Generate or load deck
  const generateDeck = async (opts: {
    subject?: string;
    topic?: string;
    unitCode?: string;
    forceGenerate?: boolean;
    titleLabel?: string;
  }) => {
    setLoadingDeck(true);
    setIsFlipped(false);
    setCurrentIndex(0);
    setRevealedIds({});

    const targetSubject =
      opts.subject ||
      (profile.weakSubjects.length > 0 ? profile.weakSubjects[0] : '数学');
    const subjectsList = opts.subject
      ? [opts.subject]
      : profile.weakSubjects.length > 0
      ? profile.weakSubjects
      : ['数学', '英語', '物理基礎'];

    setActiveDeckMeta({
      subject: targetSubject,
      topic: opts.topic || '',
      unitCode: opts.unitCode || '',
    });

    if (opts.titleLabel) {
      setDeckTitle(opts.titleLabel);
    } else if (opts.topic) {
      setDeckTitle(`「${opts.topic}」重点暗記デッキ`);
    } else if (opts.subject) {
      setDeckTitle(`「${opts.subject}」重要定義・公式デッキ`);
    } else {
      setDeckTitle('本日の復習・苦手克服デッキ');
    }

    try {
      const res = await fetch('/api/flashcard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjects: subjectsList,
          topic: opts.topic || '',
          unitCode: opts.unitCode || '',
          targetSchools: profile.targetSchools,
          forceGenerate: opts.forceGenerate ?? Boolean(opts.topic || opts.unitCode),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setCards(data);
      }
      await refreshSavedCards();
    } catch (e) {
      console.error('Failed to load/generate flashcards:', e);
    } finally {
      setLoadingDeck(false);
    }
  };

  // Initial load & URL Context Handoff (Instant 0ms display when cached cards exist!)
  useEffect(() => {
    const cachedList = (studyData.flashcards as Flashcard[]) || allSavedCards;
    const preGeneratedDaily = (studyData.dailyAnalysis?.dailyFlashcards as Flashcard[]) || [];

    if (paramSubject || paramTopic || paramUnitCode) {
      const cleanSubj = paramSubject
        ? paramSubject.replace(/^high_school_/, '').replace(/_/g, ' ')
        : '';
      if (cleanSubj) setSelectedSubject(cleanSubj);
      if (paramTopic) setCustomTopic(paramTopic);
      if (paramUnitCode) setSelectedUnitCode(paramUnitCode);

      // Check if we already have >= 3 matching cards in cache for instant display
      const qTopic = (paramTopic || '').trim().toLowerCase();
      const qCode = (paramUnitCode || '').trim().toLowerCase();
      const matchingCached = cachedList.filter((c) => {
        if (qCode && c.unitCode && c.unitCode.toLowerCase() === qCode) return true;
        if (
          qTopic &&
          ((c.topic && c.topic.toLowerCase().includes(qTopic)) ||
            c.front.toLowerCase().includes(qTopic) ||
            c.back.toLowerCase().includes(qTopic))
        ) {
          return true;
        }
        return false;
      });

      if (matchingCached.length >= 3) {
        setCards(matchingCached);
        setActiveDeckMeta({
          subject: cleanSubj || paramSubject,
          topic: paramTopic,
          unitCode: paramUnitCode,
        });
        setDeckTitle(`🎯 引継ぎデッキ: ${paramTopic || cleanSubj || paramUnitCode}`);
        setLoadingDeck(false);
        return;
      }

      generateDeck({
        subject: cleanSubj || paramSubject || undefined,
        topic: paramTopic || cleanSubj || undefined,
        unitCode: paramUnitCode || undefined,
        forceGenerate: true,
        titleLabel: `🎯 引継ぎ特訓: ${paramTopic || cleanSubj || paramUnitCode}`,
      });
    } else {
      // No URL params: show due cards, cached cards, or daily batch cards immediately in 0ms!
      const todayStr = new Date().toISOString().split('T')[0];
      const due = cachedList.filter((c: any) => {
        if (!c.nextReviewDate && !c.nextReview) return true;
        if (c.nextReview && c.nextReview <= Date.now()) return true;
        if (c.nextReviewDate && c.nextReviewDate <= todayStr) return true;
        return false;
      });

      if (due.length > 0) {
        setCards(due.slice(0, 15));
        setDeckTitle(`🔥 本日の復習期限カード (${due.length}枚)`);
        setLoadingDeck(false);
      } else if (cachedList.length > 0) {
        setCards(cachedList.slice(-10));
        setDeckTitle('🔥 保存済み重点暗記デッキ');
        setLoadingDeck(false);
      } else if (preGeneratedDaily.length > 0) {
        setCards(preGeneratedDaily);
        setDeckTitle('⚡ 本日のデイリー事前生成デッキ');
        setLoadingDeck(false);
      } else {
        // First time ever with 0 cards in DB
        generateDeck({
          forceGenerate: false,
          titleLabel: '🔥 本日の復習・弱点補強デッキ',
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSubject, paramTopic, paramUnitCode, studyData.flashcards.length]);

  const handleReviewCard = async (id: string, correct: boolean, advanceCard = true) => {
    try {
      fetch('/api/flashcard/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, correct }),
      }).then(() => refreshSavedCards());
    } catch (e) {
      console.error(e);
    }

    setReviewedCountToday((c) => c + 1);

    if (advanceCard && cards.length > 0) {
      setIsFlipped(false);
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % cards.length);
      }, 150);
    }
  };

  const toggleRevealItem = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Pull selector helpers
  const pullSubjectCatalog = useMemo(() => {
    return (
      unifiedCatalog.subjects.find(
        (s) =>
          s.subjectName === selectedSubject ||
          s.subjectId.includes(selectedSubject) ||
          selectedSubject.includes(s.subjectName)
      ) || unifiedCatalog.subjects[0]
    );
  }, [unifiedCatalog.subjects, selectedSubject]);

  const pullAvailableUnits = useMemo(() => {
    if (!pullSubjectCatalog) return [];
    const list: UnifiedUnit[] = [];
    pullSubjectCatalog.largeCategories.forEach((cat) => {
      if (selectedLargeCat === 'すべて' || cat.name === selectedLargeCat) {
        list.push(...cat.units);
      }
    });
    return list;
  }, [pullSubjectCatalog, selectedLargeCat]);

  const selectedUnitObj = useMemo(() => {
    if (!selectedUnitCode) return null;
    return pullAvailableUnits.find((u) => (u.unitCode || u.unitKey) === selectedUnitCode) || null;
  }, [pullAvailableUnits, selectedUnitCode]);

  const handlePullGenerate = () => {
    const topicToUse =
      customTopic.trim() ||
      (selectedUnitObj ? selectedUnitObj.smallName : selectedSubject);
    const codeToUse = selectedUnitObj?.unitCode || '';

    generateDeck({
      subject: selectedSubject,
      topic: topicToUse,
      unitCode: codeToUse,
      forceGenerate: true,
      titleLabel: `📘 ${selectedSubject} › ${topicToUse}${
        selectedUnitObj && selectedUnitObj.material
          ? ' (公式テキスト準拠)'
          : ''
      }`,
    });
  };

  // Manual Card Addition
  const handleAddManualCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardFront.trim() || !newCardBack.trim()) return;
    setIsAddingManual(true);
    try {
      const res = await fetch('/api/flashcard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_cards',
          cards: [
            {
              subject: newCardSubject,
              front: newCardFront.trim(),
              back: newCardBack.trim(),
            },
          ],
        }),
      });
      if (res.ok) {
        setNewCardFront('');
        setNewCardBack('');
        await refreshSavedCards();
        alert('マイ暗記カードに追加しました！');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAddingManual(false);
    }
  };

  // Filtered Library Cards
  const filteredLibraryCards = useMemo(() => {
    return allSavedCards.filter((c) => {
      const matchSubj =
        librarySubjectFilter === 'すべて' ||
        (c.subject && c.subject.includes(librarySubjectFilter));
      const q = librarySearch.trim().toLowerCase();
      const matchSearch =
        !q ||
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        (c.topic && c.topic.toLowerCase().includes(q));
      return matchSubj && matchSearch;
    });
  }, [allSavedCards, librarySubjectFilter, librarySearch]);

  const currentCard = cards[currentIndex];

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>📇 AI 暗記カード・重要定義マスター</h1>
          <p className={styles.subtitle}>
            忘却曲線（SRS）による自動復習、公式学習テキストからの定義・公式抽出、赤シート一問一答で知識を完全定着させます。
          </p>
        </div>
        <div className={styles.statsChips}>
          <div className={styles.statChip}>
            <span>🔥 本日の要復習:</span>
            <strong style={{ color: '#EA580C' }}>{dueSavedCards.length}枚</strong>
          </div>
          <div className={styles.statChip}>
            <span>🗂️ 保存済み総カード:</span>
            <strong>{allSavedCards.length}枚</strong>
          </div>
          <div className={styles.statChip}>
            <span>✅ 本日チェック済:</span>
            <strong style={{ color: '#16A34A' }}>{reviewedCountToday}枚</strong>
          </div>
        </div>
      </header>

      {/* Context Handoff Banner (when navigated from Lesson, Syllabus, Drill, Chat, or Exam Analysis) */}
      {(paramSubject || paramTopic || paramUnitCode) && (
        <div className={styles.contextBanner}>
          <div className={styles.contextInfo}>
            <span style={{ fontSize: '1.3rem' }}>🔗</span>
            <div>
              <div style={{ fontWeight: 800 }}>
                前の画面から学習テーマを引き継ぎました：
                <span style={{ color: '#4F46E5', marginLeft: '6px' }}>
                  {paramTopic || paramSubject}
                  {paramUnitCode ? ` (${paramUnitCode})` : ''}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                公式テキストの重要定義・公式および入試頻出ポイントを抽出した専用デッキを表示しています。
              </div>
            </div>
          </div>
          <div className={styles.contextActions}>
            <Link
              href={`/drill?subject=${encodeURIComponent(
                paramSubject || selectedSubject
              )}&topic=${encodeURIComponent(
                paramTopic || ''
              )}&unit=${encodeURIComponent(paramUnitCode || '')}&mode=unit`}
              className="btn btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.84rem' }}
            >
              ⚡ この単元のAIドリルを解く
            </Link>
            <Link
              href={`/lesson?task=${encodeURIComponent(
                paramTopic || paramSubject
              )}&unit=${encodeURIComponent(paramUnitCode || '')}`}
              className="btn btn-secondary"
              style={{ padding: '7px 14px', fontSize: '0.84rem' }}
            >
              📘 公式テキストを読む
            </Link>
          </div>
        </div>
      )}

      {/* 3 Mode Navigation Tabs */}
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'push' ? styles.modeTabActive : ''}`}
          onClick={() => setActiveTab('push')}
        >
          <div className={styles.modeTabTitle}>
            <span>🔥 本日の復習・弱点デッキ (Push)</span>
          </div>
          <div className={styles.modeTabDesc}>
            忘却曲線で復習時期が来たカードや、テスト誤答・苦手単元の重要カードを自動編成
          </div>
        </button>

        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'pull' ? styles.modeTabActive : ''}`}
          onClick={() => setActiveTab('pull')}
        >
          <div className={styles.modeTabTitle}>
            <span>📖 単元選択・公式テキスト抽出 (Pull)</span>
          </div>
          <div className={styles.modeTabDesc}>
            カリキュラム単元や公式学習テキストから、定義・定理・公式カードをピンポイント生成
          </div>
        </button>

        <button
          type="button"
          className={`${styles.modeTab} ${activeTab === 'library' ? styles.modeTabActive : ''}`}
          onClick={() => setActiveTab('library')}
        >
          <div className={styles.modeTabTitle}>
            <span>🗂️ マイカード一覧・赤シート暗記帳</span>
          </div>
          <div className={styles.modeTabDesc}>
            保存済み全カード（{allSavedCards.length}枚）の赤シート一問一答チェック＆自作カード追加
          </div>
        </button>
      </div>

      {/* Tab 1: Push Recommendations */}
      {activeTab === 'push' && (
        <div className={styles.pushSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span>🎯 あなたへの重点暗記レコメンド（テスト履歴・忘却曲線連動）</span>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {dueSavedCards.length > 0 && (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: '7px 14px', fontSize: '0.84rem' }}
                  onClick={() => {
                    setCards(dueSavedCards);
                    setCurrentIndex(0);
                    setIsFlipped(false);
                    setDeckTitle(`🔥 本日の復習期限カード (${dueSavedCards.length}枚)`);
                  }}
                >
                  ⏰ 復習期限のカード({dueSavedCards.length}枚)を開始
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '7px 14px', fontSize: '0.84rem' }}
                onClick={() =>
                  generateDeck({
                    forceGenerate: true,
                    titleLabel: '🔥 苦手科目 重点暗記カード (新規AI生成)',
                  })
                }
              >
                ✨ 苦手分野の新しいカードを生成
              </button>
            </div>
          </div>

          {weakUnits.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.83rem', color: '#64748B', marginBottom: '8px' }}>
                ⚠️ 公式テストで正答率80%未満の単元（クリックすると公式テキストから重要公式・定義カードを即座に作成します）：
              </div>
              <div className={styles.weaknessTags}>
                {weakUnits.slice(0, 6).map((u) => (
                  <button
                    key={u.unitKey}
                    type="button"
                    className={styles.weaknessTagBtn}
                    onClick={() =>
                      generateDeck({
                        subject: u.subjectName,
                        topic: u.smallName,
                        unitCode: u.unitCode || '',
                        forceGenerate: true,
                        titleLabel: `⚠️ 弱点克服: ${u.subjectName} › ${u.smallName}`,
                      })
                    }
                  >
                    <span>
                      {u.subjectName}: {u.smallName}
                    </span>
                    <span
                      style={{
                        background: '#FEF3C7',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                      }}
                    >
                      正答率 {u.bestAccuracy ?? 0}%
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
              💡 プロフィールの苦手科目（
              {profile.weakSubjects.length > 0
                ? profile.weakSubjects.join('・')
                : '数学・英語・物理基礎'}
              ）および志望校レベルに合わせて、AIが暗記すべき重要定義・公式を自動セレクトしています。
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Pull Unit & Official Textbook Selector */}
      {activeTab === 'pull' && (
        <div className={styles.pullPanel}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span>📘 カリキュラム単元・公式テキストから暗記カードを作成</span>
            </div>
            <span style={{ fontSize: '0.82rem', color: '#4F46E5', fontWeight: 700 }}>
              ※公式テキスト登録単元はテキスト本文の定義・公式から直接カードを生成します
            </span>
          </div>

          {/* Subject Pills */}
          <div className={styles.subjectPills}>
            {unifiedCatalog.subjects.map((subj) => (
              <button
                key={subj.subjectId}
                type="button"
                className={`${styles.subjectPill} ${
                  selectedSubject === subj.subjectName ? styles.subjectPillActive : ''
                }`}
                onClick={() => {
                  setSelectedSubject(subj.subjectName);
                  setSelectedLargeCat('すべて');
                  setSelectedUnitCode('');
                }}
              >
                {subj.subjectName}
              </button>
            ))}
          </div>

          <div className={styles.unitSelectRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>大分類フィルタ</label>
              <select
                className={styles.selectInput}
                value={selectedLargeCat}
                onChange={(e) => {
                  setSelectedLargeCat(e.target.value);
                  setSelectedUnitCode('');
                }}
              >
                <option value="すべて">すべての領域 ({pullAvailableUnits.length}単元)</option>
                {pullSubjectCatalog?.largeCategories.map((cat) => (
                  <option key={cat.name} value={cat.name}>
                    {cat.name} ({cat.units.length}単元)
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>単元を選択（📘＝公式テキスト連携）</label>
              <select
                className={styles.selectInput}
                value={selectedUnitCode}
                onChange={(e) => {
                  setSelectedUnitCode(e.target.value);
                  const found = pullAvailableUnits.find(
                    (u) => (u.unitCode || u.unitKey) === e.target.value
                  );
                  if (found) setCustomTopic(found.smallName);
                }}
              >
                <option value="">-- 単元を選択してください --</option>
                {pullAvailableUnits.map((u) => {
                  const val = u.unitCode || u.unitKey;
                  return (
                    <option key={u.unitKey} value={val}>
                      {u.material ? '📘 ' : '・'}
                      {u.unitCode ? `[${u.unitCode}] ` : ''}
                      {u.smallName}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '10px 20px', height: '42px', fontWeight: 800 }}
              onClick={handlePullGenerate}
              disabled={loadingDeck}
            >
              {loadingDeck ? '生成中...' : '⚡ この単元のカードを生成'}
            </button>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              または自由テーマ・キーワードを入力（例：「三角関数の合成公式」「仮定法過去完了」「運動量保存則」）
            </label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                className={styles.textInput}
                style={{ flex: 1 }}
                placeholder="覚えたい単元名や公式テーマを入力..."
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
              />
              {selectedUnitObj && selectedUnitObj.material && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    borderRadius: '10px',
                    background: '#EEF2FF',
                    color: '#4F46E5',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                >
                  📘 公式テキストから重要語句を抽出します
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 1 & Tab 2 Shared Active Deck Player */}
      {(activeTab === 'push' || activeTab === 'pull') && (
        <div className={styles.playerStage}>
          <div className={styles.playerTopBar}>
            <div className={styles.deckTitleBadge}>
              <span>🗂️ {deckTitle}</span>
              {cards.length > 0 && (
                <span
                  style={{
                    fontSize: '0.8rem',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    background: '#F1F5F9',
                    color: '#475569',
                  }}
                >
                  全 {cards.length} 枚
                </span>
              )}
            </div>

            <div className={styles.viewToggleGroup}>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${
                  playerViewMode === 'flip' ? styles.viewToggleBtnActive : ''
                }`}
                onClick={() => setPlayerViewMode('flip')}
              >
                🃏 3Dカードめくり
              </button>
              <button
                type="button"
                className={`${styles.viewToggleBtn} ${
                  playerViewMode === 'redsheet' ? styles.viewToggleBtnActive : ''
                }`}
                onClick={() => setPlayerViewMode('redsheet')}
              >
                🔴 赤シート一問一答一覧
              </button>
            </div>
          </div>

          {loadingDeck ? (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p style={{ fontWeight: 700 }}>
                AIが公式テキスト・カリキュラムから重要暗記カードを抽出しています...
              </p>
            </div>
          ) : cards.length === 0 ? (
            <div className={styles.loadingState}>
              <p>カードがありません。上のボタンから新しいカードを生成してください。</p>
            </div>
          ) : playerViewMode === 'flip' && currentCard ? (
            <>
              {/* 3D Flip Card */}
              <div className={styles.cardWrapper} onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`${styles.flashcard} ${isFlipped ? styles.flipped : ''}`}>
                  {/* Front */}
                  <div className={styles.cardFront}>
                    <div className={styles.cardMetaRow}>
                      <span className={styles.subjectBadge}>{currentCard.subject}</span>
                      <span className={styles.sideIndicator}>
                        QUESTION ({currentIndex + 1} / {cards.length})
                      </span>
                    </div>
                    <div className={`${styles.cardBodyContent} markdown-body`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {currentCard.front}
                      </ReactMarkdown>
                    </div>
                    <div className={styles.hintText}>👆 クリックして解答・公式解説を確認</div>
                  </div>

                  {/* Back */}
                  <div className={styles.cardBack}>
                    <div className={styles.cardMetaRow}>
                      <span className={styles.subjectBadge}>{currentCard.subject}</span>
                      <span className={styles.sideIndicator}>ANSWER & KEY POINT</span>
                    </div>
                    <div className={`${styles.cardBodyContent} markdown-body`}>
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {currentCard.back}
                      </ReactMarkdown>
                    </div>
                    <div className={styles.hintText}>
                      下のボタンで定着度を記録すると、忘却曲線に基づき次回出題日が自動調整されます
                    </div>
                  </div>
                </div>
              </div>

              {/* SRS Rating Controls */}
              <div className={styles.controlsRow}>
                <button
                  type="button"
                  className={`${styles.controlBtn} ${styles.btnAgain}`}
                  onClick={() => handleReviewCard(currentCard.id, false, true)}
                >
                  🔄 もう一度（明日また復習）
                </button>
                <button
                  type="button"
                  className={`${styles.controlBtn} ${styles.btnGood}`}
                  onClick={() => handleReviewCard(currentCard.id, true, true)}
                >
                  ✅ 覚えた！次へ（復習間隔を延長）
                </button>
              </div>

              {/* Cross-Menu Context Links */}
              <div className={styles.playerFooterLinks}>
                <span style={{ fontSize: '0.84rem', color: '#64748B', fontWeight: 700 }}>
                  カード {currentIndex + 1} / {cards.length}
                </span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <Link
                    href={`/drill?subject=${encodeURIComponent(
                      activeDeckMeta.subject || currentCard.subject
                    )}&topic=${encodeURIComponent(
                      activeDeckMeta.topic || currentCard.topic || ''
                    )}&unit=${encodeURIComponent(
                      activeDeckMeta.unitCode || currentCard.unitCode || ''
                    )}&mode=unit`}
                    style={{
                      fontSize: '0.84rem',
                      color: '#4F46E5',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    ⚡ このテーマの実践ドリルを解く →
                  </Link>
                  <Link
                    href={`/lesson?task=${encodeURIComponent(
                      activeDeckMeta.topic || currentCard.topic || currentCard.subject
                    )}&unit=${encodeURIComponent(
                      activeDeckMeta.unitCode || currentCard.unitCode || ''
                    )}`}
                    style={{
                      fontSize: '0.84rem',
                      color: '#0284C7',
                      fontWeight: 700,
                      textDecoration: 'none',
                    }}
                  >
                    📘 公式テキストを確認する →
                  </Link>
                </div>
              </div>
            </>
          ) : (
            /* Red Sheet List View inside Active Deck */
            <div className={styles.redSheetList}>
              <div className={styles.redSheetToolbar}>
                <div style={{ fontWeight: 800, color: '#9F1239', fontSize: '0.92rem' }}>
                  🔴 赤シート暗記モード：解答欄をタップすると個別に表示・非表示を切り替えられます
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  onClick={() => {
                    setRedSheetActive(!redSheetActive);
                    setRevealedIds({});
                  }}
                >
                  {redSheetActive ? '👀 すべて答えを表示する' : '🔴 すべて赤シートで隠す'}
                </button>
              </div>

              {cards.map((c, idx) => {
                const isHidden = redSheetActive && !revealedIds[c.id];
                return (
                  <div key={c.id || idx} className={styles.redSheetItem}>
                    <div className={`${styles.redSheetQuestion} markdown-body`}>
                      <span
                        style={{
                          display: 'inline-block',
                          background: '#EEF2FF',
                          color: '#4F46E5',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          marginBottom: '6px',
                        }}
                      >
                        Q{idx + 1}. {c.subject}
                      </span>
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {c.front}
                      </ReactMarkdown>
                    </div>

                    <div
                      className={`${styles.redSheetAnswer} ${
                        isHidden ? styles.redSheetHidden : styles.redSheetRevealed
                      } markdown-body`}
                      onClick={() => toggleRevealItem(c.id)}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {c.back}
                      </ReactMarkdown>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        onClick={() => handleReviewCard(c.id, false, false)}
                        title="要復習にする"
                      >
                        🔄 要復習
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        onClick={() => handleReviewCard(c.id, true, false)}
                        title="覚えた！"
                      >
                        ✅ 完了
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Saved Card Library & Manual Creation */}
      {activeTab === 'library' && (
        <div className={styles.pullPanel}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>
              <span>🗂️ マイ暗記カード帳（全 {allSavedCards.length} 枚）</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 14px', fontSize: '0.84rem' }}
              onClick={() => {
                setRedSheetActive(!redSheetActive);
                setRevealedIds({});
              }}
            >
              {redSheetActive ? '👀 すべて答えを表示' : '🔴 赤シートをONにする'}
            </button>
          </div>

          {/* Filter & Search Bar */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select
              className={styles.selectInput}
              value={librarySubjectFilter}
              onChange={(e) => setLibrarySubjectFilter(e.target.value)}
            >
              <option value="すべて">すべての科目 ({allSavedCards.length}枚)</option>
              <option value="数学">数学</option>
              <option value="英語">英語</option>
              <option value="物理">物理・物理基礎</option>
              <option value="化学">化学</option>
              <option value="歴史">歴史・社会</option>
              <option value="国語">国語</option>
              <option value="情報">情報</option>
            </select>

            <input
              type="text"
              className={styles.textInput}
              style={{ flex: 1, minWidth: '220px' }}
              placeholder="キーワードでカードを検索..."
              value={librarySearch}
              onChange={(e) => setLibrarySearch(e.target.value)}
            />

            {filteredLibraryCards.length > 0 && (
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                onClick={() => {
                  setCards(filteredLibraryCards);
                  setCurrentIndex(0);
                  setIsFlipped(false);
                  setDeckTitle(
                    `🗂️ マイカード演習 (${librarySubjectFilter} / ${filteredLibraryCards.length}枚)`
                  );
                  setActiveTab('push');
                  setPlayerViewMode('flip');
                }}
              >
                🃏 この{filteredLibraryCards.length}枚をカードめくりで演習
              </button>
            )}
          </div>

          {/* Manual Add Card Form */}
          <form
            onSubmit={handleAddManualCard}
            style={{
              background: '#F8FAFC',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#334155' }}>
              ➕ 自分でオリジナル暗記カードを追加する（数式は $x^2$ のように記述可能）
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr auto', gap: '10px' }}>
              <input
                type="text"
                className={styles.textInput}
                value={newCardSubject}
                onChange={(e) => setNewCardSubject(e.target.value)}
                placeholder="科目名"
              />
              <input
                type="text"
                className={styles.textInput}
                value={newCardFront}
                onChange={(e) => setNewCardFront(e.target.value)}
                placeholder="表面（問題・用語・公式名）"
              />
              <input
                type="text"
                className={styles.textInput}
                value={newCardBack}
                onChange={(e) => setNewCardBack(e.target.value)}
                placeholder="裏面（解答・公式・解説）"
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isAddingManual}
                style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}
              >
                {isAddingManual ? '追加中...' : '追加'}
              </button>
            </div>
          </form>

          {/* Saved Cards List */}
          <div className={styles.redSheetList}>
            {filteredLibraryCards.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                該当するカードがありません。
              </div>
            ) : (
              filteredLibraryCards.map((c, idx) => {
                const isHidden = redSheetActive && !revealedIds[c.id];
                const isDue = !c.nextReview || c.nextReview <= Date.now();
                return (
                  <div key={c.id || idx} className={styles.redSheetItem}>
                    <div className={`${styles.redSheetQuestion} markdown-body`}>
                      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
                        <span
                          style={{
                            background: '#EEF2FF',
                            color: '#4F46E5',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          {c.subject}
                        </span>
                        {isDue ? (
                          <span
                            style={{
                              background: '#FEF3C7',
                              color: '#B45309',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                            }}
                          >
                            🔥 要復習
                          </span>
                        ) : (
                          <span
                            style={{
                              background: '#DCFCE7',
                              color: '#15803D',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                            }}
                          >
                            ✅ 定着中 (間隔: {c.interval || 1}日)
                          </span>
                        )}
                      </div>
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {c.front}
                      </ReactMarkdown>
                    </div>

                    <div
                      className={`${styles.redSheetAnswer} ${
                        isHidden ? styles.redSheetHidden : styles.redSheetRevealed
                      } markdown-body`}
                      onClick={() => toggleRevealItem(c.id)}
                    >
                      <ReactMarkdown
                        remarkPlugins={[remarkMath, remarkGfm]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {c.back}
                      </ReactMarkdown>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        onClick={() => handleReviewCard(c.id, false, false)}
                      >
                        🔄 要復習
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                        onClick={() => handleReviewCard(c.id, true, false)}
                      >
                        ✅ 覚えた
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function FlashcardPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>}>
      <FlashcardCenterContent />
    </Suspense>
  );
}
