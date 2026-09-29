'use client';

import { useState, useEffect } from 'react';

export default function SyllabusAdminPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    async function fetchData() {
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
    fetchData();
  }, []);

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div>
      <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '20px', color: '#0F172A' }}>
        シラバス データベース管理
      </h1>
      <div style={{ backgroundColor: 'white', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '16px' }}>1. 生徒個人のシラバス管理 (正データ)</h2>
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
