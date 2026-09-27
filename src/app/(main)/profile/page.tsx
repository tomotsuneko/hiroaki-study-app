'use client';

import { useState } from 'react';
import { useUser } from '@/lib/UserContext';
import styles from './profile.module.css';

export default function ProfilePage() {
  const { profile, setProfile } = useUser();
  const [targetSchools, setTargetSchools] = useState<string[]>(profile.targetSchools && profile.targetSchools.length > 0 ? profile.targetSchools : ['未設定 (プロフィールから設定)', '', '']);
  const [weakSubjects, setWeakSubjects] = useState(profile.weakSubjects?.join(', ') || '');
  const [tutorPersona, setTutorPersona] = useState(profile.tutorPersona || '優しいお姉さん');
  const [currentMood, setCurrentMood] = useState(profile.currentMood || '普通');
  
  // New Fields
  const [schoolType, setSchoolType] = useState<'junior_high' | 'high'>(profile.schoolType || 'high');
  const [schoolName, setSchoolName] = useState(profile.schoolName || '');
  const [department, setDepartment] = useState(profile.department || '');
  const [grade, setGrade] = useState<number>(profile.grade || 1);
  
  const [saved, setSaved] = useState(false);

  const handleSchoolChange = (index: number, value: string) => {
    const newSchools = [...targetSchools];
    newSchools[index] = value;
    setTargetSchools(newSchools);
  };

  const [isUpdatingCurriculum, setIsUpdatingCurriculum] = useState(false);

  const handleSave = async () => {
    const now = new Date();
    const currentAcademicYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    
    setProfile({
      ...profile,
      targetSchools: targetSchools.map(s => s.trim()).filter(s => s && !s.includes('未設定')),
      weakSubjects: weakSubjects.split(',').map(s => s.trim()).filter(Boolean),
      tutorPersona,
      currentMood,
      schoolType,
      schoolName,
      department: schoolType === 'junior_high' ? undefined : department,
      grade,
      lastGradeUpdateAcademicYear: currentAcademicYear,
      needsProfileUpdate: false, // Clear the alert flag on save
    });
    
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    // 学校名が設定されている場合、専用カリキュラムの自動調査・設定バッチを非同期で走らせる
    if (schoolType === 'high' && schoolName) {
      setIsUpdatingCurriculum(true);
      try {
        await fetch('/api/user/personalize-curriculum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schoolName, department, grade })
        });
      } catch (e) {
        console.error("カリキュラム最適化に失敗しました", e);
      } finally {
        setIsUpdatingCurriculum(false);
      }
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>プロフィール設定</h1>
        <p className={styles.subtitle}>所属情報や目標校を設定すると、AIが最適な学習プランを提案します。</p>
        {isUpdatingCurriculum && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '8px', fontSize: '0.9rem', display: 'inline-block' }}>
            🔄 所属学校のカリキュラムと教材を調査し、あなた専用の学習方針を同期しています...
          </div>
        )}
      </header>

      <div className={`glass-panel ${styles.formCard}`}>
        <div className={styles.formGroup}>
          <label className={styles.label}>ユーザー名</label>
          <input className={styles.input} type="text" value={profile.name} disabled />
        </div>

        {/* --- 所属情報 --- */}
        <div className={styles.formGroup}>
          <label className={styles.label}>学校の種類</label>
          <select 
            className={styles.input} 
            value={schoolType} 
            onChange={e => setSchoolType(e.target.value as 'junior_high' | 'high')}
          >
            <option value="junior_high">中学校</option>
            <option value="high">高校</option>
          </select>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>学校名</label>
          <input 
            className={styles.input} 
            type="text" 
            value={schoolName} 
            onChange={e => setSchoolName(e.target.value)}
            placeholder="例：我孫子高校" 
          />
        </div>

        {schoolType === 'high' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>科（コース）</label>
            <input 
              className={styles.input} 
              type="text" 
              value={department} 
              onChange={e => setDepartment(e.target.value)}
              placeholder="例：理数科、普通科" 
            />
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>学年</label>
          <select 
            className={styles.input} 
            value={grade} 
            onChange={e => setGrade(Number(e.target.value))}
          >
            <option value={1}>1年生</option>
            <option value={2}>2年生</option>
            <option value={3}>3年生</option>
          </select>
          <p className={styles.hint} style={{fontSize: '0.8rem', color: '#64748B', marginTop: '4px'}}>
            ※4月1日を経過すると自動的に次の学年へ進級します。
          </p>
        </div>
        {/* -------------- */}

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
