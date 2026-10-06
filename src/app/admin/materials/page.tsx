'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

type Material = {
  id: string;
  title: string;
  contentTitle?: string;
  subject: string;
  importedAt: string;
  versions: { importedAt: string }[];
};

export default function MaterialsAdminPage() {
  const [importingSubject, setImportingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  
  // Dynamic subjects from curriculum
  const [subjects, setSubjects] = useState<{ id: string, name: string, level: string }[]>([]);
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const fetchMasterDb = async () => {
    try {
      const res = await fetch('/api/admin/master-db');
      const data = await res.json();
      if (data.masterDb) {
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

  const handleFileChange = async (subjectId: string, subjectName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check for duplicates
    const fileNames = Array.from(files).map(f => f.name.replace(/\.html?$/i, ''));
    const existingMatches = materials.filter(m => fileNames.includes(m.title));
    
    if (existingMatches.length > 0) {
      const matchNames = existingMatches.map(m => m.title).slice(0, 3).join(', ') + (existingMatches.length > 3 ? ' など' : '');
      if (!confirm(`⚠️ 以下のファイルは既にインポートされています: ${matchNames}\n\nこれらをアップロードすると新バージョンとして保存されます。よろしいですか？`)) {
        e.target.value = '';
        return;
      }
    } else {
      if (!confirm(`選択された ${files.length} 件のファイルを「${subjectName}」の学習コンテンツとしてインポートしますか？`)) {
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

        setMessage({ text: `🔄 アップロード中... (${Math.min(i + chunkSize, fileArray.length)}/${fileArray.length}件)`, type: 'success' });

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

      setMessage({ text: `✅ 計 ${totalImported} 件の学習コンテンツを「${subjectName}」にインポートしました`, type: 'success' });
      fetchMaterials(); // Refresh list

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
      const res = await fetch('/api/admin/restore-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, versionIndex })
      });
      if (res.ok) {
        alert('正規化が完了しました。');
        fetchMaterials();
      } else {
        const data = await res.json();
        alert(`エラー: ${data.error}`);
      }
    } catch (e) {
      alert('通信エラーが発生しました。');
    }
  };

  // Group materials by subject ID
  const groupedMaterials = materials.reduce((acc, curr) => {
    if (!acc[curr.subject]) acc[curr.subject] = [];
    acc[curr.subject].push(curr);
    return acc;
  }, {} as Record<string, Material[]>);
  
  // Sort materials by title ascending (e.g. 001, 002, 003)
  Object.keys(groupedMaterials).forEach(key => {
    groupedMaterials[key].sort((a, b) => a.title.localeCompare(b.title));
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
            accept=".html,.htm" 
            style={{ display: 'none' }}
            ref={el => { fileInputRefs.current[subject.id] = el; }}
            onChange={(e) => handleFileChange(subject.id, subject.name, e)}
            disabled={importingSubject !== null}
          />
          <button
            onClick={() => fileInputRefs.current[subject.id]?.click()}
            disabled={importingSubject !== null}
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

  const renderMaterialList = (list: typeof subjects, color: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {list.map(subject => {
        const items = groupedMaterials[subject.id] || [];
        if (items.length === 0) return null;
        
        return (
          <div key={subject.id} id={subject.id} style={{ border: `1px solid #CBD5E1`, borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ backgroundColor: `#F1F5F9`, padding: '12px 16px', fontWeight: 'bold', borderBottom: `1px solid #CBD5E1`, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: color }}></div>
              {subject.level} {subject.name} <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 'normal' }}>({items.length}件)</span>
            </div>
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {items.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '1px dashed #E2E8F0' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <Link href={`/preview/${encodeURIComponent(item.id)}`} style={{ color: '#2563EB', fontWeight: 'bold', textDecoration: 'underline', fontSize: '1.05rem' }}>
                        {item.title}
                      </Link>
                      {item.contentTitle && (
                        <span style={{ color: '#475569', fontSize: '0.95rem', fontWeight: '500' }}>
                          {item.contentTitle}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#64748B', marginTop: '4px' }}>
                      最終更新: {new Date(item.importedAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                  
                  {item.versions && item.versions.length > 0 && (
                    <div style={{ fontSize: '0.85rem', textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>世代管理 ({item.versions.length}件の旧版)</div>
                      {item.versions.map((v, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', justifyContent: 'flex-end' }}>
                          <span style={{ color: '#94A3B8' }}>{new Date(v.importedAt).toLocaleString('ja-JP')}</span>
                          <Link href={`/preview/${encodeURIComponent(item.id)}?v=${idx}`} style={{ color: '#059669', textDecoration: 'underline' }}>
                            参照
                          </Link>
                          <button 
                            onClick={() => handleRestore(item.id, idx)}
                            style={{ background: 'none', border: '1px solid #CBD5E1', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', color: '#475569', fontSize: '0.8rem' }}
                          >
                            正規化
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '24px', color: '#1E293B' }}>📚 学習コンテンツ（教材）管理</h1>
      
      {/* 上段：インポートボタン */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>教材データのインポート</h2>
        
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
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>登録済み学習コンテンツ</h2>
        
        {isLoadingList ? (
          <div style={{ textAlign: 'center', color: '#64748B' }}>読み込み中...</div>
        ) : materials.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B' }}>学習コンテンツはまだ登録されていません。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* 高等学校一覧 */}
            {hsSubjects.some(s => (groupedMaterials[s.id] || []).length > 0) && (
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#3B82F6', marginBottom: '16px', fontWeight: 'bold' }}>■ 高等学校</h3>
                {renderMaterialList(hsSubjects, '#3B82F6')}
              </div>
            )}
            
            {/* 中学校一覧 */}
            {jhSubjects.some(s => (groupedMaterials[s.id] || []).length > 0) && (
              <div>
                <h3 style={{ fontSize: '1.1rem', color: '#10B981', marginBottom: '16px', fontWeight: 'bold' }}>■ 中学校</h3>
                {renderMaterialList(jhSubjects, '#10B981')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
