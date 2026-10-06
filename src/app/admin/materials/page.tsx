'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

const SUBJECTS = [
  { id: 'math', name: '数学', color: '#3B82F6' },
  { id: 'english', name: '英語', color: '#F59E0B' },
  { id: 'japanese', name: '国語', color: '#EF4444' },
  { id: 'science', name: '理科', color: '#10B981' },
  { id: 'social', name: '社会', color: '#8B5CF6' },
  { id: 'info', name: '情報', color: '#64748B' },
];

type Material = {
  id: string;
  title: string;
  subject: string;
  importedAt: string;
  versions: { importedAt: string }[];
};

export default function MaterialsAdminPage() {
  const [importingSubject, setImportingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

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
            throw new Error(data.error || '取り込みに失敗しました');
          } else {
            const text = await res.text();
            if (text.includes('Request Entity Too Large') || res.status === 413) {
              throw new Error('ファイルサイズが大きすぎます。もう少し少ないファイル数で試してください。');
            }
            throw new Error(`サーバーエラーが発生しました (${res.status})`);
          }
        }
        
        const data = await res.json();
        totalImported += data.importedCount || 0;
      }

      setMessage({ text: `✅ 成功: 合計 ${totalImported}件のHTMLファイルをデータベースに反映しました。`, type: 'success' });
      await fetchMaterials(); // Refresh list
    } catch (err: any) {
      setMessage({ text: `❌ エラー: ${err.message}`, type: 'error' });
    } finally {
      setImportingSubject(null);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  const handleRestore = async (id: string, versionIndex: number) => {
    if (!confirm('この旧バージョンを最新版として復元（正規化）しますか？')) return;
    try {
      const res = await fetch('/api/admin/restore-version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, versionIndex })
      });
      const data = await res.json();
      if (data.success) {
        alert('バージョンを復元しました');
        fetchMaterials();
      } else {
        alert(data.error || '復元に失敗しました');
      }
    } catch (e) {
      alert('通信エラーが発生しました');
    }
  };

  const groupedMaterials = SUBJECTS.reduce((acc, subject) => {
    acc[subject.name] = materials.filter(m => m.subject === subject.name);
    return acc;
  }, {} as Record<string, Material[]>);

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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {SUBJECTS.map(subject => (
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
                  backgroundColor: importingSubject === subject.id ? '#94A3B8' : subject.color,
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
      </div>

      {/* 下段：コンテンツ一覧 */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>登録済み学習コンテンツ</h2>
        
        {isLoadingList ? (
          <div style={{ textAlign: 'center', color: '#64748B' }}>読み込み中...</div>
        ) : materials.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#64748B' }}>学習コンテンツはまだ登録されていません。</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {SUBJECTS.map(subject => {
              const items = groupedMaterials[subject.name] || [];
              if (items.length === 0) return null;
              
              return (
                <div key={subject.id} style={{ border: `1px solid ${subject.color}40`, borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ backgroundColor: `${subject.color}15`, padding: '12px 16px', fontWeight: 'bold', borderBottom: `1px solid ${subject.color}40`, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: subject.color }}></div>
                    {subject.name} <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 'normal' }}>({items.length}件)</span>
                  </div>
                  <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {items.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '1px dashed #E2E8F0' }}>
                        <div>
                          <Link href={`/preview/${encodeURIComponent(item.id)}`} style={{ color: '#2563EB', fontWeight: 'bold', textDecoration: 'underline', fontSize: '1.05rem' }}>
                            {item.title}
                          </Link>
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
        )}
      </div>
    </div>
  );
}
