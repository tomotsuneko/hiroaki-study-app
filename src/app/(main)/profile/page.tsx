'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/lib/UserContext';
import styles from './profile.module.css';

const HIGH_SCHOOL_SUBJECTS = ['英語', '数学IA', '数学IIBC', '数学III', '現代文', '古文・漢文', '物理', '化学', '生物', '地学', '日本史', '世界史', '地理', '公民(政経/倫理)'];
const JUNIOR_HIGH_SUBJECTS = ['英語', '数学', '国語', '理科', '社会(地理)', '社会(歴史)', '社会(公民)'];

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
  const [track, setTrack] = useState<'arts' | 'science' | 'undecided'>(profile.track || 'undecided');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>(profile.selectedSubjects || []);
  const [deviationScore, setDeviationScore] = useState<string>(profile.deviationScore ? String(profile.deviationScore) : '');
  
  const [saved, setSaved] = useState(false);
  const [isUpdatingCurriculum, setIsUpdatingCurriculum] = useState(false);

  // トラック（文理）が変更されたときの自動科目選択ロジック
  const handleTrackChange = (newTrack: 'arts' | 'science' | 'undecided') => {
    setTrack(newTrack);
    if (schoolType === 'high') {
      if (newTrack === 'arts') {
        setSelectedSubjects(['英語', '現代文', '古文・漢文', '日本史']); // 文系デフォルト（カスタマイズ可能）
      } else if (newTrack === 'science') {
        setSelectedSubjects(['英語', '数学IA', '数学IIBC', '数学III', '物理', '化学']); // 理系デフォルト
      }
    }
  };

  const toggleSubject = (sub: string) => {
    if (selectedSubjects.includes(sub)) {
      setSelectedSubjects(selectedSubjects.filter(s => s !== sub));
    } else {
      setSelectedSubjects([...selectedSubjects, sub]);
    }
  };

  const handleSchoolChange = (index: number, value: string) => {
    const newSchools = [...targetSchools];
    newSchools[index] = value;
    setTargetSchools(newSchools);
  };

  const handleSave = async () => {
    const now = new Date();
    const currentAcademicYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    
    const parsedDeviation = deviationScore.trim() ? Number(deviationScore.trim()) : undefined;
    const cleanTargets = targetSchools.map(s => s.trim()).filter(s => s && !s.includes('未設定'));

    // 志望校または学年・偏差値の変更があったか判定
    const targetChanged = JSON.stringify(cleanTargets) !== JSON.stringify(profile.targetSchools || []);
    const gradeChanged = grade !== profile.grade;
    const deviationChanged = parsedDeviation !== profile.deviationScore;

    const newProfile = {
      ...profile,
      targetSchools: cleanTargets,
      weakSubjects: weakSubjects.split(',').map(s => s.trim()).filter(Boolean),
      tutorPersona,
      currentMood,
      schoolType,
      schoolName,
      department: schoolType === 'junior_high' ? undefined : department,
      grade,
      track: schoolType === 'high' ? track : undefined,
      selectedSubjects,
      deviationScore: parsedDeviation,
      lastGradeUpdateAcademicYear: currentAcademicYear,
      needsProfileUpdate: false, // Clear the alert flag on save
    };

    setProfile(newProfile);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);

    // 学校名が設定されている場合、専用カリキュラムの自動調査・設定バッチを非同期で走らせる
    if (schoolName) {
      setIsUpdatingCurriculum(true);
      try {
        await fetch('/api/user/personalize-curriculum', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schoolName, department, grade, schoolType, track, selectedSubjects })
        });
      } catch (e) {
        console.error("カリキュラム最適化に失敗しました", e);
      } finally {
        setIsUpdatingCurriculum(false);
      }
    }

    // 志望校や学年・偏差値が変更された場合、シラバスの流動的自動組み換え（Rebalance）を実行
    if ((targetChanged || gradeChanged || deviationChanged) && cleanTargets.length > 0) {
      const reason = targetChanged ? 'target_change' : 'profile_update';
      fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: newProfile, reason })
      }).then(async res => {
        if (res.ok) {
          const data = await res.json();
          if (data.rebalanceAlert) {
            setProfile({
              ...newProfile,
              syllabusRebalanceAlert: data.rebalanceAlert
            });
          }
        }
      }).catch(err => console.error('Auto rebalance error:', err));
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>プロフィール設定</h1>
        <p className={styles.subtitle}>所属情報や目標校を設定すると、AIが最適な学習プランを提案します。</p>
        {isUpdatingCurriculum && (
          <div style={{ marginTop: '10px', padding: '8px 12px', backgroundColor: '#DBEAFE', color: '#1E40AF', borderRadius: '8px', fontSize: '0.9rem', display: 'inline-block' }}>
            🔄 学習希望科目と所属学校のカリキュラムを調査し、あなた専用の学習方針を同期しています...
          </div>
        )}
      </header>

      <div className={`glass-panel ${styles.formCard}`}>
        <div className={styles.formGroup}>
          <label className={styles.label}>ユーザー名</label>
          <input className={styles.input} type="text" value={profile.name} disabled />
        </div>

        {/* --- 所属・学習方針 --- */}
        <div className={styles.formGroup}>
          <label className={styles.label}>学校の種類</label>
          <select 
            className={styles.input} 
            value={schoolType} 
            onChange={e => {
              const val = e.target.value as 'junior_high' | 'high';
              setSchoolType(val);
              // 学校種別が変わったら選択科目をリセット
              setSelectedSubjects([]);
            }}
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
            placeholder={schoolType === 'high' ? "例：我孫子高校" : "例：我孫子中学校"} 
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

        {schoolType === 'high' && (
          <div className={styles.formGroup}>
            <label className={styles.label}>文理選択</label>
            <select 
              className={styles.input} 
              value={track} 
              onChange={e => handleTrackChange(e.target.value as any)}
            >
              <option value="undecided">まだ決まっていない / 指定校推薦など</option>
              <option value="arts">文系</option>
              <option value="science">理系</option>
            </select>
          </div>
        )}

        <div className={styles.formGroup}>
          <label className={styles.label}>学習希望科目（受験・テスト対象）</label>
          <p className={styles.hint} style={{marginBottom: '12px'}}>
            {schoolType === 'high' ? '受験に必要な科目や、定期テストで対策したい科目を選択してください。（文理選択で自動チェックされますが、自由に変更可能です）' : '対策したい教科を選択してください。'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px' }}>
            {(schoolType === 'high' ? HIGH_SCHOOL_SUBJECTS : JUNIOR_HIGH_SUBJECTS).map(sub => (
              <label key={sub} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={selectedSubjects.includes(sub)} 
                  onChange={() => toggleSubject(sub)}
                  style={{ width: '16px', height: '16px' }}
                />
                {sub}
              </label>
            ))}
          </div>
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
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>現在の目安偏差値（直近の模試など）</label>
          <input 
            className={styles.input} 
            type="number" 
            min="30"
            max="80"
            step="0.1"
            value={deviationScore} 
            onChange={e => setDeviationScore(e.target.value)}
            placeholder="例：52.5 （※未入力の場合はレベルチェックコンテンツが差し込まれます）" 
          />
          <p className={styles.hint} style={{fontSize: '0.8rem', color: '#64748B', marginTop: '4px'}}>
            ※不透明・未入力の場合は、シラバスに学力判定用のレベルチェックテストが自動で差し込まれます。
          </p>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label}>苦手な分野（カンマ区切り）</label>
          <input 
            className={styles.input} 
            type="text" 
            value={weakSubjects} 
            onChange={e => setWeakSubjects(e.target.value)}
            placeholder="例：英語長文, 物理基礎, 確率" 
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
