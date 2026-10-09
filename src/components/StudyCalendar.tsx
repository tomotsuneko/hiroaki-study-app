'use client';

import React, { useState, useMemo } from 'react';
import styles from './StudyCalendar.module.css';
import { DayPlan } from '@/lib/db';

export type DayTypeKey = 'club' | 'cram' | 'full' | 'regular' | 'rest' | 'exam_prep';

export const DAY_PRESETS: Record<DayTypeKey, { label: string; icon: string; defaultMinutes: number; color: string; bg: string }> = {
  club: { label: '部活日', icon: '⚽', defaultMinutes: 90, color: '#D97706', bg: '#FEF3C7' },
  cram: { label: '塾・予備校', icon: '🏫', defaultMinutes: 120, color: '#0284C7', bg: '#E0F2FE' },
  full: { label: '一日勉強Day', icon: '🔥', defaultMinutes: 360, color: '#7C3AED', bg: '#EDE9FE' },
  regular: { label: '通常自習', icon: '📖', defaultMinutes: 150, color: '#4318FF', bg: '#EEF2FF' },
  exam_prep: { label: 'テスト直前', icon: '⚡', defaultMinutes: 240, color: '#DC2626', bg: '#FEE2E2' },
  rest: { label: '休養・オフ', icon: '💤', defaultMinutes: 30, color: '#64748B', bg: '#F1F5F9' },
};

function formatMinutes(mins: number): string {
  if (!mins || mins <= 0) return '0分';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}時間${m}分`;
  if (h > 0) return `${h}時間`;
  return `${m}分`;
}

function formatMinutesShort(mins: number): string {
  if (!mins || mins <= 0) return '0h';
  const h = (mins / 60).toFixed(1);
  return `${h.replace('.0', '')}h`;
}

function getTodayStr(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/\//g, '-');
}

interface StudyCalendarProps {
  dayPlans: Record<string, DayPlan>;
  studyTime: Record<string, number>; // date -> minutes
  recentLogs?: any[];
  onSavePlan: (plan: DayPlan) => Promise<void>;
}

export default function StudyCalendar({ dayPlans, studyTime, recentLogs = [], onSavePlan }: StudyCalendarProps) {
  const todayStr = useMemo(() => getTodayStr(), []);
  
  // Current view offset (0 = current week, -1 = last week, 1 = next week)
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  
  // Modal state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalTargetMinutes, setModalTargetMinutes] = useState<number>(120);
  const [modalDayType, setModalDayType] = useState<DayTypeKey>('regular');
  const [modalMemo, setModalMemo] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Calculate week dates (Monday to Sunday)
  const weekDays = useMemo(() => {
    const today = new Date(todayStr);
    const dayOfWeek = today.getDay(); // 0 is Sunday, 1 is Monday...
    // Offset to Monday (in JS: 0=Sun, 1=Mon... 6=Sat)
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday + (weekOffset * 7));

    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const month = d.getMonth() + 1;
      const dateNum = d.getDate();
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const dayName = dayNames[d.getDay()];
      days.push({
        dateStr,
        month,
        dateNum,
        dayName,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isSaturday: d.getDay() === 6,
        isSunday: d.getDay() === 0,
        isToday: dateStr === todayStr,
      });
    }
    return days;
  }, [todayStr, weekOffset]);

  // Weekly commitment stats
  const weeklyStats = useMemo(() => {
    let totalTarget = 0;
    let totalActual = 0;

    weekDays.forEach(day => {
      const plan = dayPlans[day.dateStr];
      if (plan && plan.targetMinutes) {
        totalTarget += plan.targetMinutes;
      }
      const actual = studyTime[day.dateStr] || 0;
      totalActual += actual;
    });

    const rate = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    return {
      totalTarget,
      totalActual,
      rate
    };
  }, [weekDays, dayPlans, studyTime]);

  // Open modal for a date
  const handleOpenModal = (dateStr: string) => {
    const current = dayPlans[dateStr];
    setSelectedDate(dateStr);
    if (current) {
      setModalTargetMinutes(current.targetMinutes || 120);
      setModalDayType(current.dayType || 'regular');
      setModalMemo(current.memo || '');
    } else {
      // Default guess based on day
      const d = new Date(dateStr);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const defaultType: DayTypeKey = isWeekend ? 'full' : 'regular';
      setModalDayType(defaultType);
      setModalTargetMinutes(DAY_PRESETS[defaultType].defaultMinutes);
      setModalMemo('');
    }
  };

  const handleSelectPreset = (typeKey: DayTypeKey) => {
    setModalDayType(typeKey);
    setModalTargetMinutes(DAY_PRESETS[typeKey].defaultMinutes);
  };

  const handleSaveModal = async () => {
    if (!selectedDate || isSaving) return;
    setIsSaving(true);
    try {
      const plan: DayPlan = {
        date: selectedDate,
        targetMinutes: modalTargetMinutes,
        dayType: modalDayType,
        dayTypeLabel: DAY_PRESETS[modalDayType].label,
        memo: modalMemo.trim(),
        updatedAt: new Date().toISOString()
      };
      await onSavePlan(plan);
      setSelectedDate(null);
    } catch (e) {
      alert('予定の保存に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  // Recent logs on selected date
  const selectedDateLogs = useMemo(() => {
    if (!selectedDate) return [];
    return recentLogs.filter(log => {
      if (!log.timestamp) return false;
      const logDate = log.timestamp.split('T')[0];
      return logDate === selectedDate;
    });
  }, [selectedDate, recentLogs]);

  return (
    <section className={`glass-panel ${styles.calendarSection}`}>
      {/* Calendar Header */}
      <div className={styles.headerArea}>
        <div className={styles.titleGroup}>
          <h2 className={styles.sectionTitle}>
            <span>📅</span> 学習タイムマネジメント・予定と実績
          </h2>
          <p className={styles.sectionSubtitle}>
            部活や塾の予定に合わせて学習枠をコミットし、確保した時間を自動抽出で可視化します。
          </p>
        </div>

        <div className={styles.navControls}>
          <div className={styles.weekNav}>
            <button className={styles.navBtn} onClick={() => setWeekOffset(prev => prev - 1)}>
              ◀ 前週
            </button>
            <button 
              className={`${styles.navBtn} ${weekOffset === 0 ? styles.activeNavBtn : ''}`}
              onClick={() => setWeekOffset(0)}
            >
              今週
            </button>
            <button className={styles.navBtn} onClick={() => setWeekOffset(prev => prev + 1)}>
              翌週 ▶
            </button>
          </div>
        </div>
      </div>

      {/* Weekly Commitment Bar */}
      <div className={styles.commitmentCard}>
        <div className={styles.commitmentHeader}>
          <div className={styles.commitmentItem}>
            <span className={styles.commitLabel}>今週の予定目標:</span>
            <strong className={styles.targetNumber}>{formatMinutes(weeklyStats.totalTarget)}</strong>
          </div>
          <div className={styles.commitmentItem}>
            <span className={styles.commitLabel}>今週の実績（自動抽出）:</span>
            <strong className={styles.actualNumber}>{formatMinutes(weeklyStats.totalActual)}</strong>
          </div>
          <div className={styles.commitmentItem}>
            <span className={styles.commitLabel}>週間達成度:</span>
            <strong className={`${styles.rateNumber} ${weeklyStats.rate >= 100 ? styles.achievedRate : ''}`}>
              {weeklyStats.rate}%
            </strong>
          </div>
        </div>

        <div className={styles.progressTrack}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${Math.min(weeklyStats.rate, 100)}%` }} 
          />
        </div>

        <div className={styles.commitmentAdvice}>
          {weeklyStats.rate >= 100 ? (
            <span>🎉 <strong>素晴らしい集中力！</strong> 今週の目標学習時間を達成しました！この調子で質を高めていきましょう。</span>
          ) : weeklyStats.rate >= 60 ? (
            <span>🔥 <strong>順調なペースです！</strong> 予定した時間を着実に積み重ねられています。部活・学校と両立して目標クリアを目指そう！</span>
          ) : weeklyStats.totalTarget === 0 ? (
            <span>💡 各日付カードをクリックして「部活日」「一日勉強」などの学習予定枠を設定してみましょう！</span>
          ) : (
            <span>⏱️ <strong>目標まであと {formatMinutes(Math.max(0, weeklyStats.totalTarget - weeklyStats.totalActual))}！</strong> 集中タイマーを使って学習時間を確保しましょう。</span>
          )}
        </div>
      </div>

      {/* Week Grid (7 Days) */}
      <div className={styles.weekGrid}>
        {weekDays.map(day => {
          const plan = dayPlans[day.dateStr];
          const actualMins = studyTime[day.dateStr] || 0;
          const targetMins = plan?.targetMinutes || 0;
          const dayTypePreset = plan?.dayType ? DAY_PRESETS[plan.dayType] : null;
          const isAchieved = targetMins > 0 && actualMins >= targetMins;
          const progressPercent = targetMins > 0 ? Math.min(Math.round((actualMins / targetMins) * 100), 100) : 0;

          return (
            <div
              key={day.dateStr}
              className={`${styles.dayCard} ${day.isToday ? styles.todayCard : ''} ${isAchieved ? styles.achievedCard : ''}`}
              onClick={() => handleOpenModal(day.dateStr)}
            >
              {/* Day Header */}
              <div className={styles.dayHeader}>
                <div className={styles.dateLabel}>
                  <span className={`${styles.dayName} ${day.isSaturday ? styles.saturday : ''} ${day.isSunday ? styles.sunday : ''}`}>
                    {day.dayName}
                  </span>
                  <span className={styles.dayNum}>{day.month}/{day.dateNum}</span>
                </div>
                {day.isToday && <span className={styles.todayPill}>TODAY</span>}
              </div>

              {/* Day Type Badge */}
              <div className={styles.dayTypeRow}>
                {dayTypePreset ? (
                  <span 
                    className={styles.dayTypeBadge} 
                    style={{ backgroundColor: dayTypePreset.bg, color: dayTypePreset.color }}
                  >
                    {dayTypePreset.icon} {dayTypePreset.label}
                  </span>
                ) : (
                  <span className={styles.dayTypeUnset}>＋ 予定を設定</span>
                )}
              </div>

              {/* Target & Actual Numbers */}
              <div className={styles.timeStats}>
                <div className={styles.timeRow}>
                  <span className={styles.timeLabel}>予定:</span>
                  <span className={styles.timeVal}>{targetMins > 0 ? formatMinutesShort(targetMins) : '未設定'}</span>
                </div>
                <div className={styles.timeRow}>
                  <span className={styles.timeLabel}>実績:</span>
                  <strong className={`${styles.timeVal} ${actualMins > 0 ? styles.hasActual : ''}`}>
                    {formatMinutesShort(actualMins)}
                  </strong>
                </div>
              </div>

              {/* Mini Progress Bar or Achieved Badge */}
              <div className={styles.dayProgressArea}>
                {isAchieved ? (
                  <div className={styles.achievedBadge}>✅ 達成！</div>
                ) : targetMins > 0 ? (
                  <div className={styles.dayProgressBarBg}>
                    <div className={styles.dayProgressBarFill} style={{ width: `${progressPercent}%` }} />
                  </div>
                ) : (
                  <div className={styles.emptySlot}>タップして予定登録</div>
                )}
              </div>

              {/* Day Memo if any */}
              {plan?.memo && (
                <div className={styles.dayMemoPreview} title={plan.memo}>
                  📝 {plan.memo}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Edit Plan Modal */}
      {selectedDate && (
        <div className={styles.modalOverlay} onClick={() => setSelectedDate(null)}>
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                📅 学習予定の設定: <span className={styles.modalDate}>{selectedDate}</span>
              </h3>
              <button className={styles.closeBtn} onClick={() => setSelectedDate(null)}>✕</button>
            </div>

            {/* Quick Presets */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>日のタイプを選択（クイックプリセット）:</label>
              <div className={styles.presetGrid}>
                {(Object.keys(DAY_PRESETS) as DayTypeKey[]).map(typeKey => {
                  const preset = DAY_PRESETS[typeKey];
                  const isSelected = modalDayType === typeKey;
                  return (
                    <button
                      key={typeKey}
                      type="button"
                      className={`${styles.presetBtn} ${isSelected ? styles.selectedPreset : ''}`}
                      onClick={() => handleSelectPreset(typeKey)}
                    >
                      <span className={styles.presetIcon}>{preset.icon}</span>
                      <span className={styles.presetTitle}>{preset.label}</span>
                      <span className={styles.presetTime}>{formatMinutesShort(preset.defaultMinutes)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Target Hours Slider / Input */}
            <div className={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className={styles.formLabel}>目標学習時間:</label>
                <strong className={styles.selectedHoursLabel}>{formatMinutes(modalTargetMinutes)}</strong>
              </div>
              <input
                type="range"
                min="0"
                max="600"
                step="15"
                value={modalTargetMinutes}
                onChange={e => setModalTargetMinutes(Number(e.target.value))}
                className={styles.rangeSlider}
              />
              <div className={styles.quickTimeBtns}>
                {[60, 90, 120, 180, 240, 360, 480].map(mins => (
                  <button
                    key={mins}
                    type="button"
                    className={`${styles.quickTimeBtn} ${modalTargetMinutes === mins ? styles.activeQuickTime : ''}`}
                    onClick={() => setModalTargetMinutes(mins)}
                  >
                    {formatMinutesShort(mins)}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Focus Memo */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>その日の主軸タスク・メモ（任意）:</label>
              <input
                type="text"
                placeholder="例: 数学IA 基礎問題精講 p.20-25、英単語100語"
                value={modalMemo}
                onChange={e => setModalMemo(e.target.value)}
                className={styles.memoInput}
              />
            </div>

            {/* Actual Study Summary on this day */}
            <div className={styles.actualSummaryBox}>
              <div className={styles.actualSummaryHeader}>
                <span>⏱️ この日の実績学習時間（自動集計）:</span>
                <strong>{formatMinutes(studyTime[selectedDate] || 0)}</strong>
              </div>
              {selectedDateLogs.length > 0 && (
                <ul className={styles.logList}>
                  {selectedDateLogs.slice(-3).map((log, idx) => (
                    <li key={idx}>
                      ・{log.data?.message || log.data?.task || log.type}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className={styles.modalActions}>
              <button className="btn btn-secondary" onClick={() => setSelectedDate(null)}>
                キャンセル
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveModal}
                disabled={isSaving}
              >
                {isSaving ? '保存中...' : '予定を保存する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
