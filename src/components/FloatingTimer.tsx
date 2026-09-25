'use client';

import { useState, useEffect } from 'react';

export default function FloatingTimer() {
  const [isOpen, setIsOpen] = useState(false);
  const [task, setTask] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);

  useEffect(() => {
    const handleStartPomodoro = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && customEvent.detail.task) {
        setTask(customEvent.detail.task);
      }
      setIsOpen(true);
      setIsActive(false);
      setIsBreak(false);
      setTimeLeft(25 * 60);
    };

    window.addEventListener('startPomodoro', handleStartPomodoro);
    return () => window.removeEventListener('startPomodoro', handleStartPomodoro);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      if (!isBreak) {
        setCompletedSessions((c) => c + 1);
        setIsBreak(true);
        setTimeLeft(5 * 60);
        fetch('/api/db/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'studyTime', data: { minutes: 25, task: task || undefined } })
        });
        alert('ポモドーロ完了！5分間の休憩に入ります。');
      } else {
        setIsBreak(false);
        setTimeLeft(25 * 60);
        setIsActive(false); 
        alert('休憩終了！次の学習を始めましょう。');
      }
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, timeLeft, isBreak, task]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setIsBreak(false);
    setTimeLeft(25 * 60);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = isBreak ? ((5 * 60 - timeLeft) / (5 * 60)) * 100 : ((25 * 60 - timeLeft) / (25 * 60)) * 100;

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '30px',
          backgroundColor: 'var(--accent-primary)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          zIndex: 9999
        }}
        title="集中タイマーを開く"
      >
        ⏱️
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      width: '320px',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      border: '1px solid rgba(255, 255, 255, 0.4)',
      padding: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <button 
        onClick={() => setIsOpen(false)}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          background: 'transparent',
          border: 'none',
          fontSize: '18px',
          cursor: 'pointer',
          color: 'var(--text-secondary)'
        }}
      >
        ✕
      </button>

      <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>集中タイマー</h3>
      
      {task && (
        <div style={{ fontSize: '0.85rem', color: '#0369A1', backgroundColor: '#F0F9FF', padding: '6px 12px', borderRadius: '12px', marginBottom: '16px', textAlign: 'center', width: '100%' }}>
          🎯 {task}
        </div>
      )}

      <div style={{ color: isBreak ? '#10B981' : 'var(--accent-primary)', fontWeight: 'bold', marginBottom: '16px' }}>
        {isBreak ? '☕ 休憩時間' : '🔥 集中タイム'}
      </div>

      <div style={{ position: 'relative', width: '140px', height: '140px', marginBottom: '20px' }}>
        <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="45" fill="none" stroke="#E2E8F0" strokeWidth="6" />
          <circle 
            cx="50" cy="50" r="45" 
            fill="none" 
            stroke={isBreak ? '#10B981' : 'var(--accent-primary)'} 
            strokeWidth="6"
            strokeLinecap="round"
            style={{ 
              strokeDasharray: '283', 
              strokeDashoffset: `${283 - (283 * progress) / 100}`,
              transition: 'stroke-dashoffset 1s linear'
            }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'var(--text-primary)'
        }}>
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
        <button 
          onClick={toggleTimer}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '10px',
            border: 'none',
            backgroundColor: isActive ? 'var(--bg-secondary)' : 'var(--accent-primary)',
            color: isActive ? 'var(--text-primary)' : 'white',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {isActive ? '一時停止' : 'スタート'}
        </button>
        <button 
          onClick={resetTimer}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid var(--border-color)',
            backgroundColor: 'transparent',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          リセット
        </button>
      </div>

      <div style={{ marginTop: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', width: '100%', textAlign: 'center' }}>
        完了セッション: <strong>{completedSessions}</strong> 回
        <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {Array.from({length: completedSessions}).map((_, i) => (
            <span key={i}>🍅</span>
          ))}
        </div>
      </div>
    </div>
  );
}
