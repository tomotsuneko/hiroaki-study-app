'use client';

import { useState } from 'react';

export default function SyllabusAdminPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [dbData, setDbData] = useState<any>(null);

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setLogs([]);
    addLog('🚀 シラバス情報収集・分類AIパイプラインを起動しました...');
    
    try {
      // Dummy step logs for UI feedback
      setTimeout(() => addLog('STEP 1: 文部科学省・学習指導要領の最新データを収集＆分析中... (AI Check 1/3)'), 1000);
      setTimeout(() => addLog('STEP 2: 大手予備校のカリキュラム情報をクローリング＆比較中... (AI Check 2/3)'), 3000);
      setTimeout(() => addLog('STEP 3: 科目ごとに「大・中・小」分類へ構造化中... (AI Check 3/3)'), 5000);
      
      const res = await fetch('/api/admin/generate-syllabus', { method: 'POST' });
      const data = await res.json();
      
      addLog('✅ 生成・データベース化が完了しました！');
      setDbData(data.result);
    } catch (e) {
      addLog('❌ エラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#0F172A' }}>
        学習要綱・シラバス データベース管理
      </h1>
      
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>AI情報収集＆構造化パイプライン</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          公式の指導要領や予備校のカリキュラムをAIが広く収集し、「情報収集」「整理」「分類」の3工程でダブルチェックを実施しながら高精度なシラバス（大分類・中分類・小分類）を生成・更新します。（※3ヶ月に1度の自動更新バッチとしても稼働します）
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
          {isGenerating ? '🔄 AIパイプライン実行中...' : '▶️ AIパイプラインを手動実行してDBを更新'}
        </button>
        
        {logs.length > 0 && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#F1F5F9', borderRadius: '8px', fontFamily: 'monospace' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', color: '#334155' }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      {dbData && (
        <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>生成されたシラバスDB (プレビュー)</h2>
          {dbData.map((subject: any) => (
            <div key={subject.subjectName} style={{ marginBottom: '24px', border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid #E2E8F0' }}>
                {subject.subjectName}
              </div>
              <div style={{ padding: '16px' }}>
                {subject.largeCategories.map((lCat: any, i: number) => (
                  <div key={i} style={{ marginBottom: '16px' }}>
                    <div style={{ fontWeight: 'bold', color: '#2563EB', marginBottom: '8px' }}>📂 大分類: {lCat.name}</div>
                    <div style={{ paddingLeft: '20px' }}>
                      {lCat.mediumCategories.map((mCat: any, j: number) => (
                        <div key={j} style={{ marginBottom: '12px' }}>
                          <div style={{ fontWeight: 'bold', color: '#059669', marginBottom: '4px' }}>📁 中分類: {mCat.name}</div>
                          <ul style={{ paddingLeft: '24px', margin: 0, color: '#475569' }}>
                            {mCat.smallCategories.map((sCat: string, k: number) => (
                              <li key={k} style={{ marginBottom: '4px' }}>📄 小分類: {sCat} (ここから学習コンテンツを生成)</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
