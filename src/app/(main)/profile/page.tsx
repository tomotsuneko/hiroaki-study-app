'use client';

import { useState } from 'react';
import { useUser } from '@/lib/UserContext';
import styles from './profile.module.css';

export default function ProfilePage() {
  const { profile, setProfile } = useUser();
  const [targetSchools, setTargetSchools] = useState<string[]>(profile.targetSchools && profile.targetSchools.length > 0 ? profile.targetSchools : ['未設定 (プロフィールから設定)', '', '']);
  const [weakSubjects, setWeakSubjects] = useState(profile.weakSubjects.join(', '));
  const [tutorPersona, setTutorPersona] = useState(profile.tutorPersona || '優しいお姉さん');
  const [currentMood, setCurrentMood] = useState(profile.currentMood || '普通');
  const [saved, setSaved] = useState(false);

  const handleSchoolChange = (index: number, value: string) => {
    const newSchools = [...targetSchools];
    newSchools[index] = value;
    setTargetSchools(newSchools);
  };

  const handleSave = () => {
    setProfile({
      ...profile,
      targetSchools: targetSchools.map(s => s.trim()).filter(s => s && !s.includes('未設定')),
      weakSubjects: weakSubjects.split(',').map(s => s.trim()).filter(Boolean),
      tutorPersona,
      currentMood,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>プロフィール設定</h1>
        <p className={styles.subtitle}>目標校や苦手科目を設定すると、AIが最適な学習プランを提案します。</p>
      </header>

      <div className={`glass-panel ${styles.formCard}`}>
        <div className={styles.formGroup}>
          <label className={styles.label}>ユーザー名</label>
          <input className={styles.input} type="text" value={profile.name} disabled />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>目標校（最大3校まで指定可能）</label>
          {[0, 1, 2].map((i) => (
            <input 
              key={i}
              className={styles.input} 
              style={{ marginBottom: '8px' }}
              type="text" 
              value={targetSchools[i] || ''} 
              onChange={e => handleSchoolChange(i, e.target.value)}
              placeholder={i === 0 ? "例：日本大学 理工学部（第一志望）" : `例：志望校${i + 1}`} 
            />
          ))}
          <p className={styles.hint}>目標校を入力すると、それに沿った学習要綱が生成されます。</p>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>苦手な科目・分野（カンマ区切り）</label>
          <input 
            className={styles.input} 
            type="text" 
            value={weakSubjects} 
            onChange={e => setWeakSubjects(e.target.value)}
            placeholder="例：数学IIB, 英語長文, 物理基礎" 
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>AIチューターの性格</label>
          <select 
            className={styles.input} 
            value={tutorPersona} 
            onChange={e => setTutorPersona(e.target.value)}
          >
            <option value="優しいお姉さん">🌸 優しいお姉さん (優しく寄り添う)</option>
            <option value="熱血コーチ">🔥 熱血コーチ (厳しく熱く励ます)</option>
            <option value="論理的メンター">🤖 論理的メンター (客観的かつ効率重視)</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>今日の気分・モチベーション</label>
          <select 
            className={styles.input} 
            value={currentMood} 
            onChange={e => setCurrentMood(e.target.value)}
          >
            <option value="絶好調">✨ 絶好調！どんどん進めたい</option>
            <option value="普通">🙂 普通 (いつものペースで)</option>
            <option value="少し疲れ気味">🥱 少し疲れ気味 (基礎を中心に)</option>
            <option value="スランプ">🌧️ スランプ気味 (とにかく励まして)</option>
          </select>
        </div>

        <button className={`btn btn-primary ${styles.saveBtn}`} onClick={handleSave}>
          設定を保存する
        </button>
        {saved && <span className={styles.savedMessage}>保存しました！</span>}
      </div>
    </div>
  );
}
