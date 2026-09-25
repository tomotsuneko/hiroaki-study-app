'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

import { useUser } from '@/lib/UserContext';

export default function Home() {
  const router = useRouter();
  const { setProfile } = useUser();
  const [selectedUser, setSelectedUser] = useState('テスト');

  const users = [
    { id: 'hiroaki', name: 'ひろあき' },
    { id: 'wakana', name: 'わかな' },
    { id: 'test', name: 'テスト' },
  ];

  const handleLogin = () => {
    // コンテキストにユーザー情報を保存
    setProfile({
      name: selectedUser,
      targetSchools: ['未設定 (プロフィールから設定)'],
      weakSubjects: [],
      savedNotes: [],
    });
    router.push(`/dashboard`);
  };

  return (
    <div className={styles.container}>
      <div className={`glass-panel animate-fade-in ${styles.loginBox}`}>
        <div className={styles.header}>
          <h1 className={styles.title}>AI Tutor</h1>
          <p className={styles.subtitle}>我孫子高校 理系特化 学習サポート</p>
        </div>
        
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
          <div className={styles.inputGroup}>
            <label htmlFor="userSelect" className={styles.label}>利用者を選択</label>
            <select 
              id="userSelect"
              className={styles.input}
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{ appearance: 'auto' }}
            >
              {users.map(u => (
                <option key={u.id} value={u.name} style={{color: 'black'}}>{u.name}</option>
              ))}
            </select>
          </div>
          
          <button type="submit" className={`btn btn-primary ${styles.submitBtn}`}>
            学習を始める
          </button>
        </form>
        
        <div className={styles.footer}>
          <p>日東駒専レベルの現役合格を目指しましょう！</p>
        </div>
      </div>
    </div>
  )
}
