'use client';

import { useState, useEffect } from 'react';

export default function ModelsAdminPage() {
  const [config, setConfig] = useState<any>(null);
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/models-config');
      const data = await res.json();
      if (data.success) {
        setConfig(data.config);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleUpdate = async () => {
    setIsUpdating(true);
    setLogs(prev => [...prev, '🔄 Gemini APIにアクセスし、最新のモデルリストを取得中...']);
    try {
      const res = await fetch('/api/admin/update-models');
      const data = await res.json();
      if (data.success) {
        setLogs(prev => [...prev, '✅ 最新のFlash/Proモデルの自動検出・切り替えが完了しました。']);
        setConfig(data.updatedChains);
        setApiModels(data.availableApiModels || []);
      } else {
        setLogs(prev => [...prev, `❌ エラー: ${data.error}`]);
      }
    } catch (e: any) {
      setLogs(prev => [...prev, `❌ ネットワークエラー: ${e.message}`]);
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) return <div style={{ padding: '24px' }}>読み込み中...</div>;

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#0F172A' }}>
        AIモデル ＆ フォールバック管理
      </h1>
      
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>最新モデルの自動取得・最適化</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          Gemini APIと通信し、利用可能な最新のモデル（Flash / Pro）を自動取得してフォールバックチェーン（利用優先順位）を最適化します。※月1回の自動実行タスクとしても稼働します。
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={handleUpdate}
            disabled={isUpdating}
            style={{
              padding: '12px 24px',
              backgroundColor: isUpdating ? '#94A3B8' : '#8B5CF6',
              color: 'white',
              borderRadius: '8px',
              border: 'none',
              cursor: isUpdating ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isUpdating ? '🔄 通信中...' : '⚡ 最新モデルをAPIから取得して同期'}
          </button>
          {config?.updatedAt && (
            <span style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
              最終更新: {new Date(config.updatedAt).toLocaleString('ja-JP')}
            </span>
          )}
        </div>

        {logs.length > 0 && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#F1F5F9', borderRadius: '8px', fontFamily: 'monospace' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', color: '#334155' }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>プロセスごとの利用モデル（優先順位）</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          各AI処理において、上から順番に利用を試みます。タイムアウトや一時的な障害が発生した場合、次のモデルへと自動的にフォールバックします。
        </p>

        {config && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            
            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid #E2E8F0' }}>
                📖 カリキュラム / シラバス生成 (高負荷・高推論)
              </div>
              <div style={{ padding: '16px' }}>
                <ol style={{ paddingLeft: '20px', margin: 0, color: '#334155' }}>
                  {config.syllabus?.map((model: string, i: number) => (
                    <li key={i} style={{ marginBottom: '8px', fontWeight: i === 0 ? 'bold' : 'normal', color: i === 0 ? '#059669' : 'inherit' }}>
                      {model} {i === 0 && '✨ (現在メイン)'}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid #E2E8F0' }}>
                💬 チャット・ドリル (高速応答)
              </div>
              <div style={{ padding: '16px' }}>
                <ol style={{ paddingLeft: '20px', margin: 0, color: '#334155' }}>
                  {config.chat?.map((model: string, i: number) => (
                    <li key={i} style={{ marginBottom: '8px', fontWeight: i === 0 ? 'bold' : 'normal', color: i === 0 ? '#059669' : 'inherit' }}>
                      {model} {i === 0 && '✨ (現在メイン)'}
                    </li>
                  ))}
                </ol>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
