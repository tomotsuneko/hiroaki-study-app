'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
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
        window.location.href = '/dashboard';
      } else {
        setError(data.error || 'ログインに失敗しました');
      }
    } catch (e) {
      setError('サーバーエラーが発生しました');
    }
  };

  return (
    <div className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.loginBox}`}>
        <div className={styles.header}>
          <h1 className={styles.title} style={{ marginBottom: '8px' }}>AI Tutor</h1>
          <p className={styles.subtitle} style={{ fontSize: '0.9rem' }}>AI&SI学習サポートツール</p>
        </div>
        
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form className={styles.form} onSubmit={handleLogin}>
          <div className={styles.inputGroup}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: '#334155' }}>
              ユーザーID
            </label>
            <select 
              value={userId}
              onChange={e => setUserId(e.target.value)}
              style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '1rem', appearance: 'auto' }}
              required
            >
              <option value="">選択してください</option>
              <option value="hiroaki">ひろあき</option>
              <option value="wakana">わかな</option>
              <option value="test">テスト</option>
            </select>
          </div>
          
          <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
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

          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} style={{ marginTop: '24px' }}>
            学習を始める
          </button>
        </form>
        
        <div className={styles.footer} style={{ marginTop: '24px' }}>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8' }}>※初回入力時は自動的にアカウントが作成されます。</p>
        </div>
      </div>
    </div>
  )
}
