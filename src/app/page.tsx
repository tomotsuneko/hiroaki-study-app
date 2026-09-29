'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function Home() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isResetMode, setIsResetMode] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password })
      });
      
      const data = await res.json();
      if (res.ok) {
        if (userId === 'admin') {
          window.location.href = '/admin/syllabus';
        } else {
          window.location.href = '/dashboard';
        }
      } else {
        setError(data.error || 'ログインに失敗しました');
      }
    } catch (e) {
      setError('サーバーエラーが発生しました');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, newPassword: password })
      });
      
      const data = await res.json();
      if (res.ok) {
        setMessage('パスワードを再設定しました。そのままログインしてください。');
        setIsResetMode(false);
      } else {
        setError(data.error || 'リセットに失敗しました');
      }
    } catch (e) {
      setError('サーバーエラーが発生しました');
    }
  };

  return (
    <div className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.loginBox}`}>
        <div className={styles.header}>
          <h1 className={styles.title} style={{ marginBottom: '8px' }}>AI&SI Tutor</h1>
          <p className={styles.subtitle} style={{ fontSize: '0.9rem' }}>AI&SI学習サポートツール</p>
        </div>
        
        {error && (
          <div style={{ background: '#FEE2E2', color: '#B91C1C', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ background: '#DCFCE7', color: '#15803D', padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', textAlign: 'center' }}>
            {message}
          </div>
        )}

        <form className={styles.form} onSubmit={isResetMode ? handleReset : handleLogin}>
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
              <option value="admin">管理者 (Syllabus DB)</option>
            </select>
          </div>
          
          <div className={styles.inputGroup} style={{ marginTop: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem', color: '#334155' }}>
              {isResetMode ? '新しいパスワード' : 'パスワード'}
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

          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`} style={{ marginTop: '24px', backgroundColor: isResetMode ? '#EF4444' : '#3B82F6' }}>
            {isResetMode ? 'パスワードを再設定する' : 'ログインする'}
          </button>
        </form>
        
        <div className={styles.footer} style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
          <p style={{ fontSize: '0.85rem', color: '#94A3B8', margin: 0 }}>※初回入力時は自動的にアカウントが作成されます。</p>
          <button 
            type="button" 
            onClick={() => { setIsResetMode(!isResetMode); setError(''); setMessage(''); }}
            style={{ background: 'none', border: 'none', color: '#3B82F6', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isResetMode ? 'ログイン画面に戻る' : 'パスワードを忘れた場合はこちら（開発用）'}
          </button>
        </div>
      </div>
    </div>
  )
}
