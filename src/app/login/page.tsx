'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        // Force reload to apply cookies
        window.location.href = '/dashboard';
      } else {
        setError(data.error || 'ログインに失敗しました');
      }
    } catch (e) {
      setError('サーバーエラーが発生しました');
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#F8FAFC' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '20px', boxShadow: '0 8px 32px rgba(0,0,0,0.1)', width: '100%', maxWidth: '400px' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '8px', textAlign: 'center', color: '#1E293B' }}>
          StudyAI
        </h1>
        <p style={{ textAlign: 'center', color: '#64748B', marginBottom: '32px' }}>
          学習データにアクセスするにはログインしてください
        </p>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: '#334155' }}>
              ユーザーID (お好きな名前)
            </label>
            <input 
              type="text" 
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="例: hiroaki"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '1rem' }}
              required
            />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: '#334155' }}>
              パスワード
            </label>
            <input 
              type="password" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '1rem' }}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '16px', padding: '14px', fontSize: '1.1rem' }}>
            ログイン / 新規登録
          </button>
        </form>

        <p style={{ marginTop: '24px', fontSize: '0.85rem', color: '#94A3B8', textAlign: 'center' }}>
          ※初回入力時は自動的にアカウントが作成されます。
        </p>
      </div>
    </div>
  );
}
