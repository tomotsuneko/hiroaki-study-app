'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  buildSubjectSlots,
  normalizeSubjectId,
  type ContentItem,
  type CurriculumSubject,
} from '@/lib/content-slots';

type Material = ContentItem;

const SUBJECT_META: { match: string; icon: string; color: string; bg: string }[] = [
  { match: '国語', icon: '📖', color: '#B45309', bg: '#FEF3C7' },
  { match: '数学', icon: '📐', color: '#1D4ED8', bg: '#DBEAFE' },
  { match: '英語', icon: '🌐', color: '#0369A1', bg: '#E0F2FE' },
  { match: '理科', icon: '🔬', color: '#047857', bg: '#D1FAE5' },
  { match: '社会', icon: '🌏', color: '#7C3AED', bg: '#EDE9FE' },
  { match: '情報', icon: '💻', color: '#334155', bg: '#E2E8F0' },
];

function getSubjectVisual(name: string) {
  return (
    SUBJECT_META.find((m) => name.includes(m.match)) || {
      match: '',
      icon: '📚',
      color: '#1E3A5F',
      bg: '#E2E8F0',
    }
  );
}

export default function MaterialsAdminPage() {
  const [importingSubject, setImportingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);

  const [subjects, setSubjects] = useState<{ id: string; name: string; level: string }[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);

  const [filterMode, setFilterMode] = useState<'all' | 'filled' | 'missing'>('all');
  // デフォルト折り畳み: undefined 時は true（閉じている状態）
  const [collapsedSubjects, setCollapsedSubjects] = useState<Record<string, boolean>>({});
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const fetchMasterDb = async () => {
    try {
      const res = await fetch('/api/admin/master-db');
      const data = await res.json();
      if (data.masterDb) {
        setCurriculum(data.masterDb);
        setSubjects(
          data.masterDb.map((s: any) => ({
            id: s.id,
            name: s.subjectName || s.id,
            level: s.level === 'junior_high' ? '中学校' : '高等学校',
          }))
        );
      }
    } catch (e) {
      console.error('Failed to fetch subjects:', e);
    }
  };

  const fetchMaterials = async () => {
    try {
      setIsLoadingList(true);
      const res = await fetch('/api/admin/materials-list');
      const data = await res.json();
      if (data.success) {
        setMaterials(data.materials);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchMasterDb();
    fetchMaterials();
  }, []);

  const handleFileChange = async (
    subjectId: string,
    subjectName: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileNames = Array.from(files).map((f) => f.name.replace(/\.html?$/i, ''));
    const existingMatches = materials.filter((m) => fileNames.includes(m.title));

    if (existingMatches.length > 0) {
      const matchNames =
        existingMatches
          .map((m) => m.title)
          .slice(0, 3)
          .join(', ') + (existingMatches.length > 3 ? ' など' : '');
      if (
        !confirm(
          `⚠️ 以下のファイルは既にインポートされています: ${matchNames}\n\nこれらをアップロードすると新バージョンとして保存されます。よろしいですか？`
        )
      ) {
        e.target.value = '';
        return;
      }
    } else {
      if (
        !confirm(
          `選択された ${files.length} 件のファイルを「${subjectName}」の学習コンテンツとしてインポートしますか？`
        )
      ) {
        e.target.value = '';
        return;
      }
    }

    setImportingSubject(subjectId);
    setMessage(null);

    try {
      const fileArray = Array.from(files);
      const chunkSize = 5;
      let totalImported = 0;

      for (let i = 0; i < fileArray.length; i += chunkSize) {
        const chunk = fileArray.slice(i, i + chunkSize);

        const formData = new FormData();
        formData.append('subject', subjectId);
        formData.append('subjectName', subjectName);

        chunk.forEach((file) => {
          formData.append('files', file);
        });

        setMessage({
          text: `🔄 アップロード中... (${Math.min(i + chunkSize, fileArray.length)}/${fileArray.length}件)`,
          type: 'success',
        });

        const res = await fetch('/api/admin/import-materials', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const contentType = res.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            throw new Error(data.error || 'アップロードに失敗しました');
          } else {
            throw new Error(`サーバーエラー: ${res.status}`);
          }
        }

        const result = await res.json();
        totalImported += result.importedCount || chunk.length;
      }

      setMessage({
        text: `✅ 計 ${totalImported} 件の学習コンテンツを「${subjectName}」にインポートしました`,
        type: 'success',
      });
      fetchMaterials();
    } catch (error: any) {
      console.error(error);
      setMessage({ text: `❌ エラー: ${error.message}`, type: 'error' });
    } finally {
      setImportingSubject(null);
      e.target.value = '';
    }
  };

  const handleRestore = async (id: string, versionIndex: number) => {
    if (
      !confirm(
        'この旧バージョンを最新版として正規化（復元）しますか？\n\n現在の最新版は履歴に保存されます。'
      )
    )
      return;

    try {
      const res = await fetch('/api/admin/restore-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, versionIndex }),
      });
      if (res.ok) {
        alert('正規化が完了しました。');
        fetchMaterials();
      } else {
        const data = await res.json();
        alert(`エラー: ${data.error}`);
      }
    } catch {
      alert('通信エラーが発生しました。');
    }
  };

  // Group materials by normalized subject ID
  const groupedMaterials = useMemo(() => {
    const acc: Record<string, Material[]> = {};
    for (const curr of materials) {
      const key = normalizeSubjectId(curr, curriculum);
      if (!acc[key]) acc[key] = [];
      acc[key].push(curr);
    }
    for (const key of Object.keys(acc)) {
      acc[key].sort((a, b) => a.title.localeCompare(b.title));
    }
    return acc;
  }, [materials, curriculum]);

  // Precompute slots & stats per subject for both top cards & bottom list
  const subjectStatsMap = useMemo(() => {
    const map: Record<
      string,
      {
        categories: ReturnType<typeof buildSubjectSlots>['categories'];
        unmatched: Material[];
        totalSlots: number;
        totalFilled: number;
        percent: number;
      }
    > = {};

    for (const subject of subjects) {
      const curSubject = curriculum.find((c) => c.id === subject.id);
      const items = groupedMaterials[subject.id] || [];
      const { categories, unmatched } = curSubject
        ? buildSubjectSlots(curSubject, items)
        : { categories: [], unmatched: items };

      const totalSlots = categories.reduce((sum, c) => sum + c.slots.length, 0);
      const totalFilled = categories.reduce((sum, c) => sum + c.filled, 0) + unmatched.length;
      const percent = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

      map[subject.id] = { categories, unmatched, totalSlots, totalFilled, percent };
    }
    return map;
  }, [subjects, curriculum, groupedMaterials]);

  const toggleSubject = (subjectId: string) => {
    setCollapsedSubjects((prev) => ({
      ...prev,
      [subjectId]: !(prev[subjectId] ?? true),
    }));
  };

  const toggleCategory = (catKey: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catKey]: !(prev[catKey] ?? true),
    }));
  };

  const toggleAllCategoriesInSubject = (subjectId: string, expand: boolean) => {
    const stats = subjectStatsMap[subjectId];
    if (!stats) return;
    setCollapsedCategories((prev) => {
      const next = { ...prev };
      for (const cat of stats.categories) {
        next[`${subjectId}_${cat.name}`] = !expand;
      }
      return next;
    });
  };

  const areAnySubjectsExpanded = subjects.some((s) => (collapsedSubjects[s.id] ?? true) === false);

  const handleToggleAllSubjects = (expand: boolean) => {
    const next: Record<string, boolean> = {};
    for (const s of subjects) {
      next[s.id] = !expand;
    }
    setCollapsedSubjects(next);
  };

  const handleShortcutClick = (subjectId: string) => {
    setCollapsedSubjects((prev) => ({ ...prev, [subjectId]: false }));
    setTimeout(() => {
      const el = document.getElementById(subjectId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 30);
  };

  const hsSubjects = subjects.filter((s) => s.level === '高等学校');
  const jhSubjects = subjects.filter((s) => s.level === '中学校');

  const renderImportCards = (list: typeof subjects, accentColor: string) => (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(225px, 1fr))',
        gap: '12px',
      }}
    >
      {list.map((subject) => {
        const vis = getSubjectVisual(subject.name);
        const stats = subjectStatsMap[subject.id] || {
          totalSlots: 0,
          totalFilled: 0,
          percent: 0,
        };
        const isImportingThis = importingSubject === subject.id;
        const isOtherImporting = importingSubject !== null && !isImportingThis;

        return (
          <div key={subject.id}>
            <input
              type="file"
              multiple
              accept=".html,.htm"
              style={{ display: 'none' }}
              ref={(el) => {
                fileInputRefs.current[subject.id] = el;
              }}
              onChange={(e) => handleFileChange(subject.id, subject.name, e)}
              disabled={importingSubject !== null}
            />
            <button
              type="button"
              className="import-subject-card"
              onClick={() => fileInputRefs.current[subject.id]?.click()}
              disabled={importingSubject !== null}
              style={{
                width: '100%',
                textAlign: 'left',
                backgroundColor: isImportingThis ? '#F1F5F9' : '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderLeft: `4px solid ${accentColor}`,
                borderRadius: '10px',
                padding: '12px 14px',
                cursor: importingSubject !== null ? 'not-allowed' : 'pointer',
                opacity: isOtherImporting ? 0.5 : 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                transition: 'all 0.18s ease',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: vis.bg,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.05rem',
                      flexShrink: 0,
                    }}
                  >
                    {vis.icon}
                  </span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.96rem', color: '#0F172A' }}>
                      {subject.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '1px' }}>
                      登録 {stats.totalFilled}
                      {stats.totalSlots > 0 ? ` / ${stats.totalSlots}件` : '件'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    padding: '4px 9px',
                    borderRadius: '6px',
                    backgroundColor: isImportingThis ? '#94A3B8' : '#F8FAFC',
                    color: isImportingThis ? '#FFFFFF' : accentColor,
                    border: `1px solid ${isImportingThis ? '#94A3B8' : '#CBD5E1'}`,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isImportingThis ? '取込中...' : '＋ HTML取込'}
                </span>
              </div>

              {stats.totalSlots > 0 && (
                <div
                  style={{
                    width: '100%',
                    height: '4px',
                    backgroundColor: '#E2E8F0',
                    borderRadius: '999px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${stats.percent}%`,
                      height: '100%',
                      backgroundColor: accentColor,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderMaterialList = (list: typeof subjects, accentColor: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {list.map((subject) => {
        const vis = getSubjectVisual(subject.name);
        const items = groupedMaterials[subject.id] || [];
        const stats = subjectStatsMap[subject.id] || {
          categories: [],
          unmatched: items,
          totalSlots: 0,
          totalFilled: items.length,
          percent: 0,
        };
        const { categories, unmatched, totalSlots, totalFilled, percent } = stats;

        const isSubjectCollapsed = collapsedSubjects[subject.id] ?? true;
        const anyCatOpen = categories.some(
          (cat) => (collapsedCategories[`${subject.id}_${cat.name}`] ?? true) === false
        );

        return (
          <div
            key={subject.id}
            id={subject.id}
            style={{
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              overflow: 'hidden',
              backgroundColor: 'white',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            {/* 科目ヘッダー（クリックで開閉・デフォルト折り畳み） */}
            <div
              onClick={() => toggleSubject(subject.id)}
              style={{
                backgroundColor: isSubjectCollapsed ? '#FFFFFF' : '#F8FAFC',
                padding: '14px 18px',
                borderBottom: isSubjectCollapsed ? 'none' : '1px solid #E2E8F0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background-color 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: '#F1F5F9',
                    color: '#475569',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {isSubjectCollapsed ? '▶' : '▼'}
                </span>
                <span style={{ fontSize: '1.1rem' }}>{vis.icon}</span>
                <h3 style={{ margin: 0, fontSize: '1.08rem', color: '#0F172A', fontWeight: 700 }}>
                  {subject.level} {subject.name}
                </h3>
                {categories.length > 0 && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748B',
                      backgroundColor: '#F1F5F9',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    {categories.length}分野
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {!isSubjectCollapsed && categories.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleAllCategoriesInSubject(subject.id, !anyCatOpen);
                    }}
                    style={{
                      padding: '4px 10px',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      backgroundColor: '#FFFFFF',
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    {anyCatOpen ? '全分野を閉じる' : '全分野を開く'}
                  </button>
                )}

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.82rem', color: '#64748B' }}>充実度: </span>
                  <strong
                    style={{
                      fontSize: '0.96rem',
                      color: totalFilled > 0 ? '#059669' : '#64748B',
                    }}
                  >
                    {totalFilled} / {totalSlots > 0 ? totalSlots : items.length} 件 ({percent}%)
                  </strong>
                </div>

                {totalSlots > 0 && (
                  <div
                    style={{
                      width: '96px',
                      height: '8px',
                      backgroundColor: '#E2E8F0',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${percent}%`,
                        height: '100%',
                        backgroundColor: accentColor,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 展開時のみ大分類リストを描画 */}
            {!isSubjectCollapsed && (
              <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {categories.length === 0 && items.length === 0 && (
                  <div
                    style={{
                      color: '#94A3B8',
                      fontSize: '0.9rem',
                      textAlign: 'center',
                      padding: '16px',
                    }}
                  >
                    カリキュラムおよびコンテンツがまだ登録されていません。
                  </div>
                )}

                {categories.map((cat, catIdx) => {
                  const catKey = `${subject.id}_${cat.name}`;
                  const isCollapsed = collapsedCategories[catKey] ?? true;

                  const displaySlots = cat.slots.filter((s) => {
                    if (filterMode === 'filled') return s.item !== null;
                    if (filterMode === 'missing') return s.item === null;
                    return true;
                  });

                  if (filterMode !== 'all' && displaySlots.length === 0) return null;

                  const catPercent =
                    cat.slots.length > 0 ? Math.round((cat.filled / cat.slots.length) * 100) : 0;

                  return (
                    <div
                      key={catIdx}
                      style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}
                    >
                      <div
                        onClick={() => toggleCategory(catKey)}
                        style={{
                          backgroundColor: '#F8FAFC',
                          padding: '10px 14px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                            {isCollapsed ? '▶' : '▼'}
                          </span>
                          <strong style={{ fontSize: '0.96rem', color: '#1E293B' }}>
                            📂 {cat.name}
                          </strong>
                          {cat.prefix && (
                            <span
                              style={{
                                fontSize: '0.75rem',
                                background: '#E2E8F0',
                                color: '#475569',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                fontFamily: 'monospace',
                              }}
                            >
                              接頭辞: {cat.prefix}-###
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.84rem', color: '#475569' }}>
                          登録済:{' '}
                          <strong style={{ color: cat.filled > 0 ? '#059669' : '#64748B' }}>
                            {cat.filled}
                          </strong>{' '}
                          / {cat.slots.length}件 ({catPercent}%)
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div
                          style={{
                            padding: '12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                            backgroundColor: '#FAFAFA',
                            borderTop: '1px solid #E2E8F0',
                          }}
                        >
                          {displaySlots.map((slot) => {
                            const item = slot.item;
                            if (item) {
                              return (
                                <div
                                  key={slot.no}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    padding: '10px 14px',
                                    backgroundColor: 'white',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                    borderLeft: '4px solid #10B981',
                                    gap: '12px',
                                  }}
                                >
                                  <div style={{ flex: 1 }}>
                                    <div
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontSize: '0.75rem',
                                          padding: '2px 6px',
                                          background: '#DCFCE7',
                                          color: '#15803D',
                                          borderRadius: '4px',
                                          fontWeight: 'bold',
                                        }}
                                      >
                                        ✅ 登録済
                                      </span>
                                      <Link
                                        href={`/preview/${encodeURIComponent(item.id)}`}
                                        style={{
                                          color: '#1E3A5F',
                                          fontWeight: 'bold',
                                          textDecoration: 'underline',
                                          fontSize: '1rem',
                                          fontFamily: 'monospace',
                                        }}
                                      >
                                        {item.title}
                                      </Link>
                                      {item.contentTitle ? (
                                        <span
                                          style={{
                                            color: '#1E293B',
                                            fontSize: '0.95rem',
                                            fontWeight: '500',
                                          }}
                                        >
                                          {item.contentTitle}
                                        </span>
                                      ) : (
                                        <span style={{ color: '#64748B', fontSize: '0.9rem' }}>
                                          {slot.smallName}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '0.8rem',
                                        color: '#64748B',
                                        marginTop: '4px',
                                      }}
                                    >
                                      単元:{' '}
                                      <span style={{ color: '#475569' }}>
                                        {slot.mediumName} &gt; {slot.smallName}
                                      </span>{' '}
                                      ｜ 最終更新: {new Date(item.importedAt).toLocaleString('ja-JP')}
                                    </div>
                                  </div>

                                  {item.versions && item.versions.length > 0 && (
                                    <div style={{ fontSize: '0.8rem', textAlign: 'right', flexShrink: 0 }}>
                                      <div
                                        style={{
                                          fontWeight: 'bold',
                                          color: '#64748B',
                                          marginBottom: '2px',
                                        }}
                                      >
                                        旧版 ({item.versions.length}件)
                                      </div>
                                      {item.versions.map((v, idx) => (
                                        <div
                                          key={idx}
                                          style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            justifyContent: 'flex-end',
                                            marginTop: '2px',
                                          }}
                                        >
                                          <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>
                                            {new Date(v.importedAt).toLocaleDateString('ja-JP')}
                                          </span>
                                          <Link
                                            href={`/preview/${encodeURIComponent(item.id)}?v=${idx}`}
                                            style={{
                                              color: '#059669',
                                              textDecoration: 'underline',
                                              fontSize: '0.78rem',
                                            }}
                                          >
                                            参照
                                          </Link>
                                          <button
                                            onClick={() => handleRestore(item.id, idx)}
                                            style={{
                                              background: 'none',
                                              border: '1px solid #CBD5E1',
                                              borderRadius: '3px',
                                              padding: '1px 4px',
                                              cursor: 'pointer',
                                              color: '#475569',
                                              fontSize: '0.75rem',
                                            }}
                                          >
                                            復元
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            } else {
                              return (
                                <div
                                  key={slot.no}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    padding: '8px 14px',
                                    backgroundColor: '#F8FAFC',
                                    borderRadius: '6px',
                                    border: '1px dashed #CBD5E1',
                                    gap: '12px',
                                  }}
                                >
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '10px',
                                      flexWrap: 'wrap',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: '0.75rem',
                                        padding: '2px 6px',
                                        background: '#F1F5F9',
                                        color: '#64748B',
                                        borderRadius: '4px',
                                        fontWeight: 'bold',
                                      }}
                                    >
                                      ⏳ 未登録枠
                                    </span>
                                    <span
                                      style={{
                                        fontFamily: 'monospace',
                                        fontWeight: 'bold',
                                        color: '#94A3B8',
                                        fontSize: '0.95rem',
                                      }}
                                    >
                                      {slot.expectedTitle || `No.${slot.no}`}
                                    </span>
                                    <span style={{ color: '#475569', fontSize: '0.9rem' }}>
                                      {slot.smallName}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.78rem', color: '#94A3B8', flexShrink: 0 }}>
                                    {slot.mediumName}
                                  </span>
                                </div>
                              );
                            }
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {unmatched.length > 0 && (
                  <div
                    style={{
                      marginTop: '4px',
                      border: '1px solid #FDE68A',
                      borderRadius: '8px',
                      padding: '14px',
                      backgroundColor: '#FFFBEB',
                    }}
                  >
                    <strong
                      style={{
                        fontSize: '0.92rem',
                        color: '#B45309',
                        display: 'block',
                        marginBottom: '8px',
                      }}
                    >
                      ⚠️ その他の登録コンテンツ ({unmatched.length}件)
                    </strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {unmatched.map((item) => (
                        <div
                          key={item.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '8px 12px',
                            background: 'white',
                            borderRadius: '4px',
                            border: '1px solid #FDE68A',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Link
                              href={`/preview/${encodeURIComponent(item.id)}`}
                              style={{
                                color: '#1E3A5F',
                                fontWeight: 'bold',
                                textDecoration: 'underline',
                              }}
                            >
                              {item.title}
                            </Link>
                            {item.contentTitle && (
                              <span style={{ color: '#475569', fontSize: '0.9rem' }}>
                                {item.contentTitle}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                            {new Date(item.importedAt).toLocaleString('ja-JP')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <style>{`
        .import-subject-card:hover:not(:disabled) {
          border-color: #94A3B8 !important;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08) !important;
          transform: translateY(-1px);
        }
        .shortcut-pill:hover {
          background-color: #F1F5F9 !important;
          border-color: #94A3B8 !important;
        }
      `}</style>

      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#1E3A5F' }}>
        📖 学習コンテンツ管理
      </h1>

      {/* 上段：洗練されたインポートカード */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          marginBottom: '20px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '18px',
          }}
        >
          <h2 style={{ fontSize: '1.18rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
            学習コンテンツデータのインポート
          </h2>
          <span style={{ fontSize: '0.82rem', color: '#64748B' }}>
            対象科目カードをクリックして HTML ファイル（複数選択可）を取り込みます
          </span>
        </div>

        {message && (
          <div
            style={{
              padding: '14px 16px',
              backgroundColor: message.type === 'error' ? '#FEF2F2' : '#F0FDF4',
              color: message.type === 'error' ? '#991B1B' : '#166534',
              border: `1px solid ${message.type === 'error' ? '#FECACA' : '#BBF7D0'}`,
              borderRadius: '8px',
              marginBottom: '18px',
              fontWeight: '600',
              fontSize: '0.92rem',
            }}
          >
            {message.text}
          </div>
        )}

        {/* 高等学校 */}
        {hsSubjects.length > 0 && (
          <div style={{ marginBottom: '22px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: '#1E3A5F',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#EFF6FF',
                  color: '#1E3A5F',
                  fontSize: '0.76rem',
                }}
              >
                高校
              </span>
              <span>高等学校カリキュラム</span>
            </div>
            {renderImportCards(hsSubjects, '#1E3A5F')}
          </div>
        )}

        {/* 中学校 */}
        {jhSubjects.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.92rem',
                fontWeight: 700,
                color: '#0F766E',
                marginBottom: '12px',
              }}
            >
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  backgroundColor: '#ECFDF5',
                  color: '#0F766E',
                  fontSize: '0.76rem',
                }}
              >
                中学
              </span>
              <span>中学校カリキュラム</span>
            </div>
            {renderImportCards(jhSubjects, '#0F766E')}
          </div>
        )}
      </div>

      {/* 中段：科目別ショートカット（クリックで対象を展開してスクロール） */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          padding: '12px 16px',
          marginBottom: '20px',
          alignItems: 'center',
          backgroundColor: '#F8FAFC',
          borderRadius: '10px',
          border: '1px solid #E2E8F0',
        }}
      >
        <span style={{ color: '#475569', fontWeight: 700, fontSize: '0.84rem', marginRight: '4px' }}>
          科目別ショートカット:
        </span>
        {hsSubjects.map((subject) => {
          const vis = getSubjectVisual(subject.name);
          const stats = subjectStatsMap[subject.id];
          return (
            <button
              key={subject.id}
              type="button"
              className="shortcut-pill"
              onClick={() => handleShortcutClick(subject.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                borderRadius: '999px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#1E3A5F',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>{vis.icon}</span>
              <span>高・{subject.name}</span>
              {stats && (
                <span style={{ color: '#64748B', fontSize: '0.74rem' }}>({stats.percent}%)</span>
              )}
            </button>
          );
        })}
        {hsSubjects.length > 0 && jhSubjects.length > 0 && (
          <span style={{ color: '#CBD5E1', margin: '0 2px' }}>|</span>
        )}
        {jhSubjects.map((subject) => {
          const vis = getSubjectVisual(subject.name);
          const stats = subjectStatsMap[subject.id];
          return (
            <button
              key={subject.id}
              type="button"
              className="shortcut-pill"
              onClick={() => handleShortcutClick(subject.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 11px',
                borderRadius: '999px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                color: '#0F766E',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <span>{vis.icon}</span>
              <span>中・{subject.name}</span>
              {stats && (
                <span style={{ color: '#64748B', fontSize: '0.74rem' }}>({stats.percent}%)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 下段：カリキュラム連動一覧（デフォルト折り畳み） */}
      <div
        className="glass-panel"
        style={{
          padding: '24px',
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h2 style={{ fontSize: '1.18rem', margin: 0, fontWeight: 700, color: '#0F172A' }}>
              カリキュラム連動 学習コンテンツ枠一覧
            </h2>
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
              各科目・分野をクリックして展開します（上段ショートカットからも直接展開できます）。
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => handleToggleAllSubjects(!areAnySubjectsExpanded)}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#1E3A5F',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {areAnySubjectsExpanded ? '▲ すべて折り畳む' : '▼ 全科目を展開'}
            </button>

            <div
              style={{
                display: 'flex',
                gap: '6px',
                background: '#F1F5F9',
                padding: '4px',
                borderRadius: '8px',
              }}
            >
              <button
                onClick={() => setFilterMode('all')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: filterMode === 'all' ? '#1E3A5F' : 'transparent',
                  color: filterMode === 'all' ? 'white' : '#64748B',
                  fontSize: '0.84rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                すべて表示
              </button>
              <button
                onClick={() => setFilterMode('filled')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: filterMode === 'filled' ? '#059669' : 'transparent',
                  color: filterMode === 'filled' ? 'white' : '#64748B',
                  fontSize: '0.84rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ✅ 登録済のみ
              </button>
              <button
                onClick={() => setFilterMode('missing')}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: 'none',
                  background: filterMode === 'missing' ? '#D97706' : 'transparent',
                  color: filterMode === 'missing' ? 'white' : '#64748B',
                  fontSize: '0.84rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                }}
              >
                ⏳ 未登録枠のみ
              </button>
            </div>
          </div>
        </div>

        {isLoadingList ? (
          <div style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>読み込み中...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {hsSubjects.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: '1.08rem',
                    color: '#1E3A5F',
                    marginBottom: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  ■ 高等学校カリキュラム
                </h3>
                {renderMaterialList(hsSubjects, '#1E3A5F')}
              </div>
            )}

            {jhSubjects.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: '1.08rem',
                    color: '#0F766E',
                    marginBottom: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  ■ 中学校カリキュラム
                </h3>
                {renderMaterialList(jhSubjects, '#0F766E')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
