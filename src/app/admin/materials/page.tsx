'use client';

import { useState } from 'react';

export default function MaterialsAdminPage() {
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = async () => {
    if (!confirm('src/data/materials にあるHTMLファイルを一括でデータベース（Firestore）に取り込みます。よろしいですか？')) return;
    
    setIsImporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/import-materials', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '取り込みに失敗しました');
      
      setMessage(`✅ 成功: ${data.importedCount}件のHTMLファイルをデータベースに反映しました。`);
    } catch (e: any) {
      setMessage(`❌ エラー: ${e.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '24px', color: '#1E293B' }}>📚 学習コンテンツ（教材）管理</h1>
      
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>教材データのインポート</h2>
        <p style={{ color: '#475569', marginBottom: '20px', lineHeight: '1.6' }}>
          <code>src/data/materials</code> フォルダに配置された <b>HTMLファイル</b> (.html / .htm) を一括でデータベース（Firestore）に取り込みます。<br/>
          ※ 取り込まれたデータは、AIチューターの知識ベース（RAG）や学習ドリル生成の参照データとして活用されます。
        </p>
        
        <button 
          onClick={handleImport}
          disabled={isImporting}
          style={{
            padding: '12px 24px',
            backgroundColor: isImporting ? '#94A3B8' : '#3B82F6',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: isImporting ? 'not-allowed' : 'pointer',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          {isImporting ? '🔄 取り込み中...' : '📥 HTMLファイルを一括インポート'}
        </button>

        {message && (
          <div style={{ 
            marginTop: '20px', 
            padding: '16px', 
            borderRadius: '8px', 
            backgroundColor: message.startsWith('✅') ? '#ECFDF5' : '#FEF2F2',
            color: message.startsWith('✅') ? '#065F46' : '#991B1B',
            fontWeight: '500'
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
