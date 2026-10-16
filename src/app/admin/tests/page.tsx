'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import JSZip from 'jszip';
import {
  buildSubjectSlots,
  normalizeSubjectId,
  type ContentItem,
  type CurriculumSubject,
} from '@/lib/content-slots';

type TestMaterial = ContentItem;

export default function TestsAdminPage() {
  const [importingSubject, setImportingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [tests, setTests] = useState<TestMaterial[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [filterMode, setFilterMode] = useState<'all' | 'filled' | 'missing'>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (catKey: string) => {
    setCollapsedCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  };
  
  // Dynamic subjects from curriculum
  const [subjects, setSubjects] = useState<{ id: string, name: string, level: string }[]>([]);
  const [curriculum, setCurriculum] = useState<CurriculumSubject[]>([]);
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const fetchMasterDb = async () => {
    try {
      const res = await fetch('/api/admin/master-db');
      const data = await res.json();
      if (data.masterDb) {
        setCurriculum(data.masterDb);
        setSubjects(data.masterDb.map((s: any) => ({
          id: s.id,
          name: s.subjectName || s.id,
          level: s.level === 'junior_high' ? '中学校' : '高等学校'
        })));
      }
    } catch (e) {
      console.error('Failed to fetch subjects:', e);
    }
  };

  const fetchTests = async () => {
    try {
      setIsLoadingList(true);
      const res = await fetch('/api/admin/tests-list');
      const data = await res.json();
      if (data.success) {
        setTests(data.tests);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    fetchMasterDb();
    fetchTests();
  }, []);

  const handleFileChange = async (subjectId: string, subjectName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    setImportingSubject(subjectId);
    setMessage({ text: '📦 ファイルを解析中...', type: 'success' });

    try {
      const extractedFiles: File[] = [];

      // ZIPファイルが含まれている場合は解凍
      for (const file of Array.from(rawFiles)) {
        if (file.name.endsWith('.zip') || file.type.includes('zip')) {
          setMessage({ text: `📦 ZIPファイル「${file.name}」を展開中...`, type: 'success' });
          const zip = await JSZip.loadAsync(file);
          
          for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (!zipEntry.dir && (relativePath.endsWith('.html') || relativePath.endsWith('.htm'))) {
              const baseName = relativePath.split('/').pop() || '';
              // 重複コピー（例: '数Ａ-048_L2_標準(1).html'）を除外
              if (/\(\d+\)\.html?$/i.test(baseName)) continue;

              const text = await zipEntry.async('text');
              extractedFiles.push(new File([text], baseName, { type: 'text/html' }));
            }
          }
        } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
          if (!/\(\d+\)\.html?$/i.test(file.name)) {
            extractedFiles.push(file);
          }
        }
      }

      if (extractedFiles.length === 0) {
        alert('有効なHTMLテストファイルが見つかりませんでした。');
        setImportingSubject(null);
        e.target.value = '';
        return;
      }

      // Check for duplicates
      const fileNames = extractedFiles.map(f => f.name.replace(/\.html?$/i, ''));
      const existingMatches = tests.filter(m => fileNames.includes(m.title));
      
      if (existingMatches.length > 0) {
        const matchNames = existingMatches.map(m => m.title).slice(0, 3).join(', ') + (existingMatches.length > 3 ? ' など' : '');
        if (!confirm(`⚠️ 以下のテストファイル (${existingMatches.length}件) は既にインポートされています: ${matchNames}\n\nこれらをアップロードすると新バージョンとして保存されます。よろしいですか？`)) {
          setImportingSubject(null);
          e.target.value = '';
          return;
        }
      } else {
        if (!confirm(`展開された ${extractedFiles.length} 件のテストコンテンツを「${subjectName}」にインポートしますか？`)) {
          setImportingSubject(null);
          e.target.value = '';
          return;
        }
      }

      const chunkSize = 10;
      let totalImported = 0;

      for (let i = 0; i < extractedFiles.length; i += chunkSize) {
        const chunk = extractedFiles.slice(i, i + chunkSize);
        
        const formData = new FormData();
        formData.append('subject', subjectId);
        formData.append('subjectName', subjectName);
        
        chunk.forEach((file) => {
          formData.append('files', file);
        });

        setMessage({ text: `🔄 アップロード中... (${Math.min(i + chunkSize, extractedFiles.length)}/${extractedFiles.length}件)`, type: 'success' });

        const res = await fetch('/api/admin/import-tests', {
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

      setMessage({ text: `✅ 計 ${totalImported} 件のテストコンテンツを「${subjectName}」にインポートしました`, type: 'success' });
      fetchTests(); // Refresh list

    } catch (error: any) {
      console.error(error);
      setMessage({ text: `❌ エラー: ${error.message}`, type: 'error' });
    } finally {
      setImportingSubject(null);
      e.target.value = '';
    }
  };

  const handleRestore = async (id: string, versionIndex: number) => {
    if (!confirm('この旧バージョンを最新版として正規化（復元）しますか？\n\n現在の最新版は履歴に保存されます。')) return;

    try {
      const res = await fetch('/api/admin/restore-test-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, versionIndex })
      });
      if (res.ok) {
        alert('正規化が完了しました。');
        fetchTests();
      } else {
        const data = await res.json();
        alert(`エラー: ${data.error}`);
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    }
  };

  // Group tests by subject ID（旧仕様で表示名が保存されたデータもタイトル接頭辞から科目IDへ正規化）
  const groupedTests = tests.reduce((acc, curr) => {
    const key = normalizeSubjectId(curr, curriculum);
    if (!acc[key]) acc[key] = [];
    acc[key].push(curr);
    return acc;
  }, {} as Record<string, TestMaterial[]>);
  
  // Sort tests by title ascending (e.g. 001, 002, 003)
  Object.keys(groupedTests).forEach(key => {
    groupedTests[key].sort((a, b) => a.title.localeCompare(b.title));
  });

  const hsSubjects = subjects.filter(s => s.level === '高等学校');
  const jhSubjects = subjects.filter(s => s.level === '中学校');

  const renderImportButtons = (list: typeof subjects, color: string) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
      {list.map(subject => (
        <div key={subject.id}>
          <input 
            type="file" 
            multiple 
            accept=".html,.htm,.zip,application/zip,application/x-zip-compressed" 
            style={{ display: 'none' }}
            ref={el => { fileInputRefs.current[subject.id] = el; }}
            onChange={(e) => handleFileChange(subject.id, subject.name, e)}
            disabled={importingSubject !== null}
          />
          <button
            onClick={() => fileInputRefs.current[subject.id]?.click()}
            disabled={importingSubject !== null}
            title={`${subject.name} のテストHTMLファイル、またはZIPファイルをアップロード`}
            style={{
              padding: '8px 16px',
              backgroundColor: importingSubject === subject.id ? '#94A3B8' : color,
              color: 'white',
              borderRadius: '24px',
              border: 'none',
              cursor: importingSubject !== null ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              opacity: importingSubject !== null && importingSubject !== subject.id ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.95rem'
            }}
          >
            📥 {subject.name}
          </button>
        </div>
      ))}
    </div>
  );

  const renderTestList = (list: typeof subjects, color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {list.map(subject => {
        const curSubject = curriculum.find(c => c.id === subject.id);
        const items = groupedTests[subject.id] || [];
        
        // カリキュラムDBから大分類・小分類のスロットを生成
        const { categories, unmatched } = curSubject
          ? buildSubjectSlots(curSubject, items)
          : { categories: [], unmatched: items };

        const totalSlots = categories.reduce((sum, c) => sum + c.slots.length, 0);
        const totalFilled = categories.reduce((sum, c) => sum + c.filled, 0) + unmatched.length;
        const percent = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

        return (
          <div key={subject.id} id={subject.id} style={{ border: `1px solid #CBD5E1`, borderRadius: '12px', overflow: 'hidden', backgroundColor: 'white', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
            {/* 科目ヘッダー */}
            <div style={{ 
              backgroundColor: `#F8FAFC`, 
              padding: '16px 20px', 
              borderBottom: `1px solid #E2E8F0`, 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              flexWrap: 'wrap', 
              gap: '12px' 
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color }}></div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#0F172A', fontWeight: 'bold' }}>
                  {subject.level} {subject.name}
                </h3>
              </div>

              {/* 進捗バッジ */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    単元枠充足: <strong style={{ fontSize: '1rem', color: totalFilled > 0 ? '#10B981' : '#64748B' }}>
                      {totalFilled} / {totalSlots > 0 ? totalSlots : items.length} 単元 ({percent}%)
                    </strong>
                  </div>
                  {items.length > 0 && (
                    <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: '500' }}>
                      ✨ テスト問題集: <strong>{items.length}件</strong> 登録済
                    </div>
                  )}
                </div>
                {totalSlots > 0 && (
                  <div style={{ width: '100px', height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${percent}%`, height: '100%', backgroundColor: color, transition: 'width 0.3s ease' }}></div>
                  </div>
                )}
              </div>
            </div>

            {/* 大分類ごとのスロット表示 */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {categories.length === 0 && items.length === 0 && (
                <div style={{ color: '#94A3B8', fontSize: '0.9rem', textAlign: 'center', padding: '16px' }}>
                  カリキュラムおよびテストコンテンツがまだ登録されていません。
                </div>
              )}

              {categories.map((cat, catIdx) => {
                const catKey = `${subject.id}_${cat.name}`;
                const isCollapsed = collapsedCategories[catKey] ?? false;
                
                // フィルター適用
                const displaySlots = cat.slots.filter(s => {
                  if (filterMode === 'filled') return s.item !== null;
                  if (filterMode === 'missing') return s.item === null;
                  return true;
                });

                if (filterMode !== 'all' && displaySlots.length === 0) return null;

                const catPercent = cat.slots.length > 0 ? Math.round((cat.filled / cat.slots.length) * 100) : 0;

                return (
                  <div key={catIdx} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                    {/* 大分類タイトルバー（アコーディオン） */}
                    <div 
                      onClick={() => toggleCategory(catKey)}
                      style={{ 
                        backgroundColor: '#F1F5F9', 
                        padding: '10px 16px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{isCollapsed ? '▶' : '▼'}</span>
                        <strong style={{ fontSize: '1rem', color: '#1E293B' }}>
                          📂 {cat.name}
                        </strong>
                        {cat.prefix && (
                          <span style={{ fontSize: '0.78rem', background: '#E2E8F0', color: '#475569', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                            接頭辞: {cat.prefix}-###
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                        登録済: <strong style={{ color: cat.filled > 0 ? '#059669' : '#64748B' }}>{cat.filled}</strong> / {cat.slots.length}件 ({catPercent}%)
                      </div>
                    </div>

                    {/* スロット一覧 */}
                    {!isCollapsed && (
                      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: '#FAFAFA' }}>
                        {displaySlots.map(slot => {
                          const hasContent = slot.items.length > 0 || slot.item !== null;
                          const isMultiLevel = !!(slot.levels.l1 || slot.levels.l2 || slot.levels.l3);

                          if (hasContent) {
                            return (
                              <div key={slot.no} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '10px 14px',
                                backgroundColor: 'white',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                borderLeft: '4px solid #10B981',
                                gap: '12px',
                                flexWrap: 'wrap'
                              }}>
                                <div style={{ flex: 1, minWidth: '240px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#DCFCE7', color: '#15803D', borderRadius: '4px', fontWeight: 'bold' }}>
                                      ✅ 登録済
                                    </span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#1E293B', fontSize: '0.95rem' }}>
                                      {slot.expectedTitle || `No.${slot.no}`}
                                    </span>
                                    <span style={{ color: '#1E293B', fontSize: '0.95rem', fontWeight: '600' }}>
                                      {slot.item?.contentTitle || slot.smallName}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '3px' }}>
                                    単元: {slot.mediumName} &gt; {slot.smallName}
                                    {slot.items.length > 0 && (
                                      <span style={{ marginLeft: '8px', color: '#475569' }}>
                                        ({slot.items.length}件のテスト)
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* 難易度レベル別ボタン */}
                                {isMultiLevel ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {slot.levels.l1 ? (
                                      <Link
                                        href={`/preview/${encodeURIComponent(slot.levels.l1.id)}?type=test`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '5px 12px',
                                          backgroundColor: '#ECFDF5',
                                          color: '#065F46',
                                          border: '1px solid #A7F3D0',
                                          borderRadius: '6px',
                                          fontSize: '0.82rem',
                                          fontWeight: 'bold',
                                          textDecoration: 'none'
                                        }}
                                      >
                                        🟢 L1 基礎
                                      </Link>
                                    ) : (
                                      <span style={{ padding: '5px 10px', color: '#94A3B8', fontSize: '0.8rem', backgroundColor: '#F1F5F9', borderRadius: '6px' }}>未登録 (L1)</span>
                                    )}

                                    {slot.levels.l2 ? (
                                      <Link
                                        href={`/preview/${encodeURIComponent(slot.levels.l2.id)}?type=test`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '5px 12px',
                                          backgroundColor: '#EFF6FF',
                                          color: '#1E40AF',
                                          border: '1px solid #BFDBFE',
                                          borderRadius: '6px',
                                          fontSize: '0.82rem',
                                          fontWeight: 'bold',
                                          textDecoration: 'none'
                                        }}
                                      >
                                        🔵 L2 標準
                                      </Link>
                                    ) : (
                                      <span style={{ padding: '5px 10px', color: '#94A3B8', fontSize: '0.8rem', backgroundColor: '#F1F5F9', borderRadius: '6px' }}>未登録 (L2)</span>
                                    )}

                                    {slot.levels.l3 ? (
                                      <Link
                                        href={`/preview/${encodeURIComponent(slot.levels.l3.id)}?type=test`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '5px 12px',
                                          backgroundColor: '#FFF7ED',
                                          color: '#9A3412',
                                          border: '1px solid #FED7AA',
                                          borderRadius: '6px',
                                          fontSize: '0.82rem',
                                          fontWeight: 'bold',
                                          textDecoration: 'none'
                                        }}
                                      >
                                        🟠 L3 応用
                                      </Link>
                                    ) : (
                                      <span style={{ padding: '5px 10px', color: '#94A3B8', fontSize: '0.8rem', backgroundColor: '#F1F5F9', borderRadius: '6px' }}>未登録 (L3)</span>
                                    )}
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Link
                                      href={`/preview/${encodeURIComponent(slot.item!.id)}?type=test`}
                                      style={{
                                        padding: '5px 14px',
                                        backgroundColor: '#F8FAFC',
                                        color: '#2563EB',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '6px',
                                        fontSize: '0.85rem',
                                        fontWeight: 'bold',
                                        textDecoration: 'none'
                                      }}
                                    >
                                      プレビュー
                                    </Link>
                                  </div>
                                )}
                              </div>
                            );
                          } else {
                            // 未登録の枠（プレースホルダー）
                            return (
                              <div key={slot.no} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '8px 14px',
                                backgroundColor: '#F8FAFC',
                                borderRadius: '6px',
                                border: '1px dashed #CBD5E1',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.75rem', padding: '2px 6px', background: '#F1F5F9', color: '#64748B', borderRadius: '4px', fontWeight: 'bold' }}>
                                    ⏳ 未登録枠
                                  </span>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 'bold', color: '#94A3B8', fontSize: '0.95rem' }}>
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

              {/* カリキュラム枠に一致しなかったその他の登録済みコンテンツ */}
              {unmatched.length > 0 && (
                <div style={{ marginTop: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', backgroundColor: '#FFFBEB' }}>
                  <strong style={{ fontSize: '0.95rem', color: '#B45309', display: 'block', marginBottom: '10px' }}>
                    ⚠️ その他の登録テストコンテンツ ({unmatched.length}件)
                  </strong>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {unmatched.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'white', borderRadius: '4px', border: '1px solid #FDE68A' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Link href={`/preview/${encodeURIComponent(item.id)}?type=test`} style={{ color: '#2563EB', fontWeight: 'bold', textDecoration: 'underline' }}>
                            {item.title}
                          </Link>
                          {item.contentTitle && <span style={{ color: '#475569', fontSize: '0.9rem' }}>{item.contentTitle}</span>}
                        </div>
                        <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{new Date(item.importedAt).toLocaleString('ja-JP')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '24px', color: '#1E293B' }}>📝 テストコンテンツ管理</h1>
      
      {/* 上段：インポートボタン */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>テストデータのインポート</h2>
          <span style={{ fontSize: '0.85rem', color: '#64748B' }}>
            💡 HTMLファイル（複数選択可）またはZIPファイル（問題集パック）を直接選択できます
          </span>
        </div>
        
        {message && (
          <div style={{ 
            padding: '16px', 
            backgroundColor: message.type === 'error' ? '#FEF2F2' : '#F0FDF4', 
            color: message.type === 'error' ? '#991B1B' : '#166534', 
            borderRadius: '8px',
            marginBottom: '20px',
            fontWeight: '500'
          }}>
            {message.text}
          </div>
        )}

        {/* 高等学校 */}
        {hsSubjects.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '1rem', color: '#475569', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>高等学校</h3>
            {renderImportButtons(hsSubjects, '#3B82F6')}
          </div>
        )}

        {/* 中学校 */}
        {jhSubjects.length > 0 && (
          <div>
            <h3 style={{ fontSize: '1rem', color: '#475569', marginBottom: '12px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>中学校</h3>
            {renderImportButtons(jhSubjects, '#10B981')}
          </div>
        )}
      </div>
      
      {/* 中段：アンカーリンク */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '0 8px', marginBottom: '24px', alignItems: 'center' }}>
        <span style={{ color: '#64748B', fontWeight: 'bold' }}>科目別ショートカット:</span>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {hsSubjects.map(subject => (
            <a key={subject.id} href={`#${subject.id}`} style={{ color: '#3B82F6', textDecoration: 'underline', fontSize: '0.95rem' }}>
              高・{subject.name}
            </a>
          ))}
          {hsSubjects.length > 0 && jhSubjects.length > 0 && (
            <span style={{ color: '#CBD5E1' }}>|</span>
          )}
          {jhSubjects.map(subject => (
            <a key={subject.id} href={`#${subject.id}`} style={{ color: '#10B981', textDecoration: 'underline', fontSize: '0.95rem' }}>
              中・{subject.name}
            </a>
          ))}
        </div>
      </div>

      {/* 下段：コンテンツ一覧 */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>
            カリキュラム連動 テストコンテンツ枠一覧
          </h2>

          {/* 表示切り替えフィルター */}
          <div style={{ display: 'flex', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
            <button
              onClick={() => setFilterMode('all')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: 'none',
                background: filterMode === 'all' ? '#1E293B' : 'transparent',
                color: filterMode === 'all' ? 'white' : '#64748B',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                cursor: 'pointer'
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
                background: filterMode === 'filled' ? '#10B981' : 'transparent',
                color: filterMode === 'filled' ? 'white' : '#64748B',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                cursor: 'pointer'
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
                background: filterMode === 'missing' ? '#F59E0B' : 'transparent',
                color: filterMode === 'missing' ? 'white' : '#64748B',
                fontSize: '0.85rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              ⏳ 未登録枠のみ
            </button>
          </div>
        </div>
        
        {isLoadingList ? (
          <div style={{ textAlign: 'center', color: '#64748B', padding: '40px' }}>読み込み中...</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* 高等学校一覧 */}
            {hsSubjects.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.15rem', color: '#3B82F6', marginBottom: '16px', fontWeight: 'bold' }}>■ 高等学校カリキュラム</h3>
                {renderTestList(hsSubjects, '#3B82F6')}
              </div>
            )}
            
            {/* 中学校一覧 */}
            {jhSubjects.length > 0 && (
              <div>
                <h3 style={{ fontSize: '1.15rem', color: '#10B981', marginBottom: '16px', fontWeight: 'bold' }}>■ 中学校カリキュラム</h3>
                {renderTestList(jhSubjects, '#10B981')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
