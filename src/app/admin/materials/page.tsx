'use client';

import { useState, useRef } from 'react';

const SUBJECTS = [
  { id: 'math', name: '数学', color: '#3B82F6' },
  { id: 'english', name: '英語', color: '#F59E0B' },
  { id: 'japanese', name: '国語', color: '#EF4444' },
  { id: 'science', name: '理科', color: '#10B981' },
  { id: 'social', name: '社会', color: '#8B5CF6' },
  { id: 'info', name: '情報', color: '#64748B' },
];

export default function MaterialsAdminPage() {
  const [importingSubject, setImportingSubject] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);
  
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleFileChange = async (subjectId: string, subjectName: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (!confirm(`選択された ${files.length} 件のファイルを「${subjectName}」の学習コンテンツとしてインポートしますか？`)) {
      e.target.value = '';
      return;
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
    } catch (err: any) {
      setMessage({ text: `❌ エラー: ${err.message}`, type: 'error' });
    } finally {
      setImportingSubject(null);
      if (e.target) e.target.value = ''; // Reset input
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '24px', color: '#1E293B' }}>📚 学習コンテンツ（教材）管理</h1>
      
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>教材データのインポート</h2>
        <p style={{ color: '#475569', marginBottom: '24px', lineHeight: '1.6' }}>
          ローカルのPCに保存されている <b>HTMLファイル</b> (.html / .htm) を選択してアップロードします。<br/>
          科目ごとのボタンからファイルを選択してください。複数ファイルを同時に選択可能です。
        </p>

        {message && (
          <div style={{ 
            padding: '16px', 
            backgroundColor: message.type === 'error' ? '#FEF2F2' : '#F0FDF4', 
            color: message.type === 'error' ? '#991B1B' : '#166534', 
            borderRadius: '8px',
            marginBottom: '24px',
            fontWeight: '500'
          }}>
            {message.text}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {SUBJECTS.map(subject => (
            <div key={subject.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: subject.color }}></div>
                <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{subject.name}</span>
              </div>
              
              <div>
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
                    borderRadius: '6px',
                    border: 'none',
                    cursor: importingSubject !== null ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: importingSubject !== null && importingSubject !== subject.id ? 0.5 : 1
                  }}
                >
                  {importingSubject === subject.id ? '🔄 インポート中...' : '📥 ファイルを選択してアップロード'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
