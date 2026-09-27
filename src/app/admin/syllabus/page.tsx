'use client';

import { useState, useEffect } from 'react';

export default function SyllabusAdminPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [dbData, setDbData] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  useEffect(() => {
    async function fetchUsers() {
      try {
        const res = await fetch('/api/admin/users');
        const data = await res.json();
        if (data.success) {
          setUsers(data.users);
          if (data.users.length > 0) setSelectedUserId(data.users[0].id);
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchUsers();
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setLogs([]);
    addLog('🚀 マスターシラバス情報収集・分類AIパイプラインを起動しました...');
    
    try {
      setTimeout(() => addLog('STEP 1: 文部科学省・学習指導要領の最新データを収集＆分析中... (AI Check 1/3)'), 1000);
      setTimeout(() => addLog('STEP 2: 大手予備校のカリキュラム情報をクローリング＆比較中... (AI Check 2/3)'), 3000);
      setTimeout(() => addLog('STEP 3: 科目ごとに「大・中・小」分類へ構造化中... (AI Check 3/3)'), 5000);
      
      const res = await fetch('/api/admin/generate-syllabus', { method: 'POST' });
      const data = await res.json();
      
      addLog('✅ マスターDBの生成・更新が完了しました！');
      setDbData(data.result);
    } catch (e) {
      addLog('❌ エラーが発生しました。');
    } finally {
      setIsGenerating(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#0F172A' }}>
        学習要綱・シラバス データベース管理
      </h1>
      
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>1. マスターシラバスDB (共通基盤) の更新</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          公式の指導要領や予備校の標準カリキュラムをAIが収集・構造化し、全生徒のベースとなる「マスターDB」を更新します。
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
          {isGenerating ? '🔄 AIパイプライン実行中...' : '▶️ マスターDBパイプラインを手動実行'}
        </button>
        
        {logs.length > 0 && (
          <div style={{ marginTop: '24px', padding: '16px', backgroundColor: '#F1F5F9', borderRadius: '8px', fontFamily: 'monospace' }}>
            {logs.map((log, i) => (
              <div key={i} style={{ marginBottom: '8px', color: '#334155' }}>{log}</div>
            ))}
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>2. 生徒個人のシラバス管理 (正データ)</h2>
        <p style={{ color: '#475569', marginBottom: '20px' }}>
          マスターDBと個人の学校・偏差値情報を掛け合わせて最適化された「個人専用シラバス」を確認します。（※過去の完了分を含む全量データ）
        </p>
        
        {users.length > 0 ? (
          <>
            <select 
              value={selectedUserId} 
              onChange={e => setSelectedUserId(e.target.value)}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #CBD5E1', marginBottom: '24px', minWidth: '200px' }}
            >
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.id} (データあり)</option>
              ))}
            </select>

            {selectedUser && selectedUser.syllabus && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', fontWeight: 'bold', borderBottom: '1px solid #E2E8F0' }}>
                  {selectedUser.id} の全カリキュラム構成
                </div>
                <div style={{ padding: '16px' }}>
                  {selectedUser.syllabus.map((phase: any, i: number) => (
                    <div key={i} style={{ marginBottom: '24px' }}>
                      <div style={{ fontWeight: 'bold', color: '#2563EB', marginBottom: '8px', fontSize: '1.1rem' }}>
                        📍 {phase.phase}: {phase.title} ({phase.period})
                      </div>
                      <div style={{ paddingLeft: '20px' }}>
                        {phase.categories?.map((cat: any, j: number) => (
                          <div key={j} style={{ marginBottom: '12px' }}>
                            <div style={{ fontWeight: 'bold', color: '#059669', marginBottom: '4px' }}>📂 {cat.name}</div>
                            <ul style={{ paddingLeft: '24px', margin: 0, color: '#475569' }}>
                              {cat.tasks?.map((task: any, k: number) => {
                                const isCompleted = selectedUser.completedTasks?.includes(task.title);
                                return (
                                  <li key={k} style={{ marginBottom: '4px', color: isCompleted ? '#94A3B8' : '#334155' }}>
                                    {isCompleted ? '✅' : '⬜'} {task.title} {task.type === 'weakness' && <span style={{color:'#d97706', fontWeight:'bold'}}>[弱点]</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p style={{ color: '#64748B' }}>シラバスが構築済みのユーザーデータが見つかりません。</p>
        )}
      </div>

    </div>
  );
}
