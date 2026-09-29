'use client';

import { useState, useEffect } from 'react';

export default function CurriculumAdminPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [masterDb, setMasterDb] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'junior_high' | 'high_school'>('high_school');
  
  // Carousel states for each tab
  const [currentIndex, setCurrentIndex] = useState(0);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const fetchMasterDb = async () => {
    try {
      const res = await fetch('/api/admin/master-db');
      const data = await res.json();
      if (data.success) {
        setMasterDb(data.masterDb);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMasterDb();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setLogs([]);
    addLog('🚀 マスターカリキュラム構築パイプラインを起動しました...');
    
    try {
      addLog('⏳ Markdownファイル群を解析・取り込み中...');
      const res = await fetch('/api/admin/generate-syllabus', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      if (!res.ok) {
         let errMessage = 'サーバーエラーが発生しました';
         try {
           const errData = await res.json();
           if (errData.error) errMessage = errData.error;
         } catch (e) {}
         throw new Error(`生成に失敗しました: ${errMessage}`);
      }
      
      const data = await res.json();
      addLog(`✅ ${data.message || '取り込み完了'}`);
      addLog('🎉 マスターDBの生成・更新が完了しました！');
      
      await fetchMasterDb();
    } catch (e: any) {
      addLog(`❌ エラーが発生しました: ${e.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const filteredDb = masterDb.filter(subject => {
    if (activeTab === 'junior_high') {
      return subject.id.includes('junior_high') || subject.subjectName.includes('中学');
    } else {
      return subject.id.includes('high_school') || (!subject.id.includes('junior_high') && !subject.subjectName.includes('中学'));
    }
  });

  // Ensure index is within bounds when switching tabs
  useEffect(() => {
    setCurrentIndex(0);
  }, [activeTab]);

  const nextSlide = () => {
    if (currentIndex < filteredDb.length - 1) setCurrentIndex(c => c + 1);
  };
  
  const prevSlide = () => {
    if (currentIndex > 0) setCurrentIndex(c => c - 1);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#0F172A' }}>
        カリキュラム データベース管理
      </h1>
      
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>1. マスターカリキュラムDB (共通基盤) の更新</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          所定のディレクトリ（src/data/master_curriculum）に配置されたMarkdownファイル群を解析・構造化し、全生徒のベースとなる「マスターDB」を更新します。
        </p>
        <button 
          onClick={handleGenerate}
          disabled={isGenerating}
          style={{
            padding: '12px 24px',
            backgroundColor: isGenerating ? '#94A3B8' : '#3B82F6',
            color: 'white',
            borderRadius: '8px',
            border: 'none',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {isGenerating ? '🔄 パイプライン実行中...' : '▶️ マスターDBパイプラインを手動実行'}
        </button>
        
        {logs.length > 0 && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#F1F5F9', borderRadius: '8px', fontFamily: 'monospace' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', color: '#334155' }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>2. 現在のマスターカリキュラムDB (プレビュー)</h2>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #E2E8F0', paddingBottom: '10px' }}>
          <button 
            onClick={() => setActiveTab('junior_high')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'junior_high' ? '#1E293B' : 'transparent',
              color: activeTab === 'junior_high' ? 'white' : '#64748B',
              border: 'none',
              borderRadius: '20px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🏫 中学カリキュラム
          </button>
          <button 
            onClick={() => setActiveTab('high_school')}
            style={{
              padding: '8px 16px',
              backgroundColor: activeTab === 'high_school' ? '#1E293B' : 'transparent',
              color: activeTab === 'high_school' ? 'white' : '#64748B',
              border: 'none',
              borderRadius: '20px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🎓 高校カリキュラム
          </button>
        </div>

        {filteredDb.length > 0 ? (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button 
                onClick={prevSlide} 
                disabled={currentIndex === 0}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: currentIndex === 0 ? '#F8FAFC' : 'white', cursor: currentIndex === 0 ? 'not-allowed' : 'pointer' }}
              >
                ◀ 前へ
              </button>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#0F172A' }}>
                📖 {filteredDb[currentIndex].subjectName || filteredDb[currentIndex].id}
              </h3>
              <button 
                onClick={nextSlide} 
                disabled={currentIndex === filteredDb.length - 1}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', background: currentIndex === filteredDb.length - 1 ? '#F8FAFC' : 'white', cursor: currentIndex === filteredDb.length - 1 ? 'not-allowed' : 'pointer' }}
              >
                次へ ▶
              </button>
            </div>
            
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '16px' }}>
                {filteredDb[currentIndex].largeCategories?.map((lCat: any, i: number) => (
                  <div key={i} style={{ marginBottom: '20px', padding: '16px', backgroundColor: '#F1F5F9', borderRadius: '8px' }}>
                    <div style={{ fontWeight: 'bold', color: '#1E40AF', marginBottom: '12px', fontSize: '1.05rem', borderBottom: '2px solid #BFDBFE', paddingBottom: '4px' }}>
                      📂 大分類: {lCat.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
                      {lCat.mediumCategories?.map((mCat: any, j: number) => (
                        <div key={j} style={{ backgroundColor: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                          <div style={{ fontWeight: 'bold', color: '#059669', marginBottom: '8px' }}>📁 中分類: {mCat.name}</div>
                          <ul style={{ paddingLeft: '20px', margin: 0, color: '#475569', fontSize: '0.9rem' }}>
                            {mCat.smallCategories?.map((sCat: string, k: number) => (
                              <li key={k} style={{ marginBottom: '4px' }}>{sCat}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p style={{ color: '#64748B' }}>
            {activeTab === 'junior_high' ? '中学' : '高校'}のカリキュラムが見つかりません。
          </p>
        )}
      </div>
    </div>
  );
}
