'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

type AnalyticsMaterialItem = {
  unitCode: string;
  title: string;
  subject: string;
  viewCount: number;
  completed: boolean;
  lastViewedAt: string;
};

type AnalyticsTestItem = {
  testId: string;
  baseCode: string;
  level: string;
  subject: string;
  title: string;
  answeredCount: number;
  correctCount: number;
  firstCorrectCount: number;
  totalQuestions: number;
  scorePercent: number;
  isCompleted: boolean;
  updatedAt: string;
};

type AnalyticsLogItem = {
  id: string;
  timestamp: string;
  type: string;
  message: string;
  subject: string;
  score: string;
  scorePercent: number | null;
};

type AnalyticsUser = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  status: string;
  createdAt: string;
  lastLoginAt: string;
  lastActiveAt: string;
  schoolType: 'junior_high' | 'high';
  schoolTypeLabel: string;
  schoolName: string;
  department: string;
  grade: number;
  gradeLabel: string;
  track: 'arts' | 'science' | 'undecided';
  trackLabel: string;
  deviationScore: number | null;
  targetSchools: string[];
  selectedSubjects: string[];
  weakSubjects: string[];
  isActiveToday: boolean;
  isActive7d: boolean;
  isActive30d: boolean;
  streakDays: number;
  totalStudyMinutes: number;
  studyMinutes7d: number;
  studyMinutes30d: number;
  studyTimeByDate: Record<string, number>;
  hasSyllabus: boolean;
  syllabusTotalTasks: number;
  syllabusCompletedTasks: number;
  syllabusProgress: number;
  syllabusUpdatedAt: string | null;
  masteredUnitsCount: number;
  textbooksViewedCount: number;
  textbooksCompletedCount: number;
  recentMaterials: AnalyticsMaterialItem[];
  testsTakenCount: number;
  testsCompletedCount: number;
  testQuestionsAnswered: number;
  testQuestionsCorrect: number;
  testFirstCorrectCount: number;
  testAccuracy: number | null;
  recentTests: AnalyticsTestItem[];
  aiChatCount: number;
  aiDrillCount: number;
  pomodoroCount: number;
  examCount: number;
  flashcardsCount: number;
  bookmarksCount: number;
  notesCount: number;
  feedbackQueueCount: number;
  feedbackQueue: any[];
  recentLogs: AnalyticsLogItem[];
};

type CohortRow = {
  key: string;
  label: string;
  group: 'summary' | 'junior_high' | 'high' | 'track';
  userCount: number;
  active7dCount: number;
  active7dRate: number;
  active30dCount: number;
  totalStudyMinutes: number;
  studyMinutes7d: number;
  avgStudyMinutesPerUser: number;
  avgStudyMinutes7dPerUser: number;
  avgDeviationScore: number | null;
  syllabusCreatedCount: number;
  avgSyllabusProgress: number;
  textbooksViewed: number;
  textbooksCompleted: number;
  avgTextbooksPerUser: number;
  testsTaken: number;
  testQuestionsAnswered: number;
  testAccuracy: number | null;
  aiActivityCount: number;
  topTargetSchools: { name: string; count: number }[];
  topWeakSubjects: { name: string; count: number }[];
};

type AnalyticsResponse = {
  success: boolean;
  generatedAt: string;
  includeAdmins: boolean;
  dateRange: {
    todayJst: string;
    last7Dates: string[];
    last14Dates: string[];
    last30Dates: string[];
  };
  overall: {
    totalAccounts: number;
    studentAccounts: number;
    evaluatedAccounts: number;
    activeAccounts: number;
    dau: number;
    wau: number;
    mau: number;
    wauRate: number;
    totalStudyMinutes: number;
    studyMinutes7d: number;
    studyMinutes30d: number;
    avgStudyMinutesPerStudent: number;
    avgStudyMinutesPerActive7d: number;
    totalTextbooksViewed: number;
    totalTextbooksCompleted: number;
    totalTestsTaken: number;
    totalTestsCompleted: number;
    totalTestQuestionsAnswered: number;
    totalTestQuestionsCorrect: number;
    overallTestAccuracy: number | null;
    totalAiDrills: number;
    totalAiChats: number;
    totalPomodoros: number;
    totalMockExams: number;
    totalFlashcardsSaved: number;
    totalBookmarksSaved: number;
    syllabusBuiltCount: number;
    syllabusBuiltRate: number;
    overallAvgSyllabusProgress: number;
    dailyTrend: {
      date: string;
      label: string;
      studyMinutes: number;
      activeUsers: number;
      drillAndTestCount: number;
      materialViewCount: number;
      chatCount: number;
    }[];
    subjectBreakdown: {
      subject: string;
      textbookViews: number;
      textbooksCompleted: number;
      testSessions: number;
      testQuestionsAnswered: number;
      testQuestionsCorrect: number;
      testAccuracy: number | null;
      aiDrillCount: number;
      aiChatCount: number;
    }[];
  };
  cohorts: CohortRow[];
  users: AnalyticsUser[];
};

function formatMinutesToHM(mins: number): string {
  if (!mins || mins <= 0) return '0分';
  if (mins < 60) return `${mins}分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function formatDateTimeShort(iso?: string | null): string {
  if (!iso) return '未記録';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [includeAdmins, setIncludeAdmins] = useState(false);

  const [activeTab, setActiveTab] = useState<'overall' | 'cohorts' | 'individual'>('overall');

  // Individual Tab Filters & Sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSchoolType, setFilterSchoolType] = useState<'all' | 'high' | 'junior_high'>('all');
  const [filterGrade, setFilterGrade] = useState<'all' | '1' | '2' | '3'>('all');
  const [filterTrack, setFilterTrack] = useState<'all' | 'science' | 'arts' | 'undecided'>('all');
  const [filterActivity, setFilterActivity] = useState<
    'all' | 'active7d' | 'inactive7d' | 'no_syllabus' | 'has_weak'
  >('all');
  const [sortBy, setSortBy] = useState<
    'study7d' | 'studyTotal' | 'lastActive' | 'syllabus' | 'accuracy' | 'materials'
  >('study7d');

  // Detail Modal User
  const [detailUser, setDetailUser] = useState<AnalyticsUser | null>(null);

  const fetchAnalytics = async (incAdmins = includeAdmins) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/analytics?includeAdmins=${incAdmins ? '1' : '0'}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || '分析データの取得に失敗しました');
      }
      setData(json);

      // Check query ?userId=...
      if (typeof window !== 'undefined') {
        const qId = new URLSearchParams(window.location.search).get('userId');
        if (qId) {
          const found = (json.users || []).find((u: AnalyticsUser) => u.id === qId);
          if (found) {
            setDetailUser(found);
            setActiveTab('individual');
          }
        }
      }
    } catch (e: any) {
      setErrorMsg(e?.message || '読み込みエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(includeAdmins);
  }, [includeAdmins]);

  // Filtered & sorted individual user list
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    const q = searchQuery.trim().toLowerCase();

    const list = data.users.filter((u) => {
      if (!includeAdmins && u.role === 'admin') return false;
      if (filterSchoolType !== 'all' && u.schoolType !== filterSchoolType) return false;
      if (filterGrade !== 'all' && String(u.grade) !== filterGrade) return false;
      if (filterTrack !== 'all' && u.track !== filterTrack) return false;
      if (filterActivity === 'active7d' && !u.isActive7d) return false;
      if (filterActivity === 'inactive7d' && u.isActive7d) return false;
      if (filterActivity === 'no_syllabus' && u.hasSyllabus) return false;
      if (filterActivity === 'has_weak' && u.feedbackQueueCount === 0) return false;

      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        u.schoolName.toLowerCase().includes(q) ||
        u.targetSchools.some((s) => s.toLowerCase().includes(q))
      );
    });

    list.sort((a, b) => {
      if (sortBy === 'study7d') return b.studyMinutes7d - a.studyMinutes7d || b.totalStudyMinutes - a.totalStudyMinutes;
      if (sortBy === 'studyTotal') return b.totalStudyMinutes - a.totalStudyMinutes;
      if (sortBy === 'lastActive') return (b.lastActiveAt || '').localeCompare(a.lastActiveAt || '');
      if (sortBy === 'syllabus') return b.syllabusProgress - a.syllabusProgress;
      if (sortBy === 'accuracy') return (b.testAccuracy ?? -1) - (a.testAccuracy ?? -1);
      if (sortBy === 'materials') return b.textbooksViewedCount - a.textbooksViewedCount;
      return 0;
    });

    return list;
  }, [
    data,
    includeAdmins,
    searchQuery,
    filterSchoolType,
    filterGrade,
    filterTrack,
    filterActivity,
    sortBy,
  ]);

  const handleCohortDrillDown = (cohortKey: string) => {
    setFilterGrade('all');
    setFilterTrack('all');
    setFilterSchoolType('all');
    setFilterActivity('all');
    if (cohortKey === 'all_junior_high') setFilterSchoolType('junior_high');
    else if (cohortKey === 'all_high') setFilterSchoolType('high');
    else if (cohortKey === 'jh_1') {
      setFilterSchoolType('junior_high');
      setFilterGrade('1');
    } else if (cohortKey === 'jh_2') {
      setFilterSchoolType('junior_high');
      setFilterGrade('2');
    } else if (cohortKey === 'jh_3') {
      setFilterSchoolType('junior_high');
      setFilterGrade('3');
    } else if (cohortKey === 'hs_1') {
      setFilterSchoolType('high');
      setFilterGrade('1');
    } else if (cohortKey === 'hs_2') {
      setFilterSchoolType('high');
      setFilterGrade('2');
    } else if (cohortKey === 'hs_3') {
      setFilterSchoolType('high');
      setFilterGrade('3');
    } else if (cohortKey === 'hs_science') {
      setFilterSchoolType('high');
      setFilterTrack('science');
    } else if (cohortKey === 'hs_arts') {
      setFilterSchoolType('high');
      setFilterTrack('arts');
    } else if (cohortKey === 'hs_undecided') {
      setFilterSchoolType('high');
      setFilterTrack('undecided');
    }
    setActiveTab('individual');
  };

  const handleExportCsv = () => {
    if (!filteredUsers.length) return;
    const headers = [
      'ID',
      '氏名',
      '権限',
      'ステータス',
      '区分',
      '学年',
      '文理',
      '在籍校',
      '第一志望',
      '偏差値',
      '直近7日稼働',
      '連続日数',
      '直近7日学習(分)',
      '直近30日学習(分)',
      '累計学習(分)',
      'シラバス進捗(%)',
      'テキスト閲覧数',
      'テキスト読了数',
      'テスト受験数',
      'テスト回答問数',
      'テスト正答率(%)',
      'AIドリル回数',
      'AIチャット回数',
      '暗記カード数',
      '要復習単元数',
      '最終アクティブ日時',
    ];

    const escapeCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const rows = filteredUsers.map((u) => [
      u.id,
      u.name,
      u.role,
      u.status,
      u.schoolTypeLabel,
      u.gradeLabel,
      u.trackLabel,
      u.schoolName,
      u.targetSchools[0] || '',
      u.deviationScore ?? '',
      u.isActive7d ? 'アクティブ' : '停滞',
      u.streakDays,
      u.studyMinutes7d,
      u.studyMinutes30d,
      u.totalStudyMinutes,
      u.hasSyllabus ? u.syllabusProgress : '未構築',
      u.textbooksViewedCount,
      u.textbooksCompletedCount,
      u.testsTakenCount,
      u.testQuestionsAnswered,
      u.testAccuracy ?? '',
      u.aiDrillCount,
      u.aiChatCount,
      u.flashcardsCount,
      u.feedbackQueueCount,
      u.lastActiveAt || u.lastLoginAt || '',
    ]);

    const csvString =
      '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_analytics_${data?.dateRange.todayJst || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Top Active & Needs Follow-up Lists for Overall Tab
  const overallHighlights = useMemo(() => {
    if (!data?.users) return { topLearners: [], followUp: [] };
    const pool = data.users.filter((u) => includeAdmins || u.role === 'student');
    const topLearners = [...pool]
      .sort((a, b) => b.studyMinutes7d - a.studyMinutes7d || b.totalStudyMinutes - a.totalStudyMinutes)
      .slice(0, 5);
    const followUp = [...pool]
      .filter((u) => !u.isActive7d || u.feedbackQueueCount > 0 || !u.hasSyllabus)
      .sort((a, b) => {
        if (a.isActive7d !== b.isActive7d) return a.isActive7d ? 1 : -1;
        return b.feedbackQueueCount - a.feedbackQueueCount;
      })
      .slice(0, 6);
    return { topLearners, followUp };
  }, [data, includeAdmins]);

  const maxTrendMinutes = useMemo(() => {
    if (!data?.overall.dailyTrend) return 60;
    const maxVal = Math.max(...data.overall.dailyTrend.map((d) => d.studyMinutes), 0);
    return maxVal > 0 ? maxVal : 60;
  }, [data]);

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', color: '#0F172A' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '18px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E3A5F', margin: 0 }}>
            📊 利用状況分析・学習モニタリング
          </h1>
          <p style={{ color: '#475569', margin: '4px 0 0 0', fontSize: '0.9rem' }}>
            全体稼働（DAU/WAU/MAU）・中・高・学年別コホート・個人別の学習時間・テキスト・テスト定着率をリアルタイム分析します。
            {data?.generatedAt && (
              <span style={{ marginLeft: '10px', fontSize: '0.8rem', color: '#64748B' }}>
                最終集計: {formatDateTimeShort(data.generatedAt)} (JST)
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#334155',
              backgroundColor: '#FFFFFF',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={includeAdmins}
              onChange={(e) => setIncludeAdmins(e.target.checked)}
              style={{ accentColor: '#1E3A5F' }}
            />
            管理者アカウントを集計に含める
          </label>

          <button
            onClick={handleExportCsv}
            disabled={!filteredUsers.length}
            style={{
              padding: '9px 14px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#1E3A5F',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            📥 CSV出力
          </button>

          <button
            onClick={() => fetchAnalytics(includeAdmins)}
            disabled={loading}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: '#1E3A5F',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {loading ? '⏳ 集計中...' : '🔄 最新集計を実行'}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            marginBottom: '16px',
            padding: '14px 18px',
            borderRadius: '8px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            fontWeight: 600,
          }}
        >
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '2px solid #E2E8F0',
          paddingBottom: '10px',
          flexWrap: 'wrap',
        }}
      >
        {[
          { key: 'overall', label: '🌐 全体利用状況' },
          { key: 'cohorts', label: '🏫 中・高・学年・文理別分析' },
          { key: 'individual', label: `👤 個人別利用状況 (${filteredUsers.length}名)` },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: active ? '#1E3A5F' : '#CBD5E1',
                backgroundColor: active ? '#1E3A5F' : '#FFFFFF',
                color: active ? '#FFFFFF' : '#334155',
                fontWeight: 700,
                fontSize: '0.92rem',
                cursor: 'pointer',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            padding: '48px',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          全ユーザー・テスト・教材データを集計しています...
        </div>
      ) : (
        data && (
          <>
            {/* ============================================================== */}
            {/* TAB 1: OVERALL ANALYTICS                                       */}
            {/* ============================================================== */}
            {activeTab === 'overall' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 6 Primary KPI Cards */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px',
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      👥 稼働ユーザー (DAU / WAU / MAU)
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {data.overall.wau} <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>/ {data.overall.evaluatedAccounts}名</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      本日(DAU): <strong>{data.overall.dau}名</strong> ・ 30日(MAU):{' '}
                      <strong>{data.overall.mau}名</strong> (週間率 {data.overall.wauRate}%)
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      ⏱️ 総学習時間 (直近7日 / 累計)
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {formatMinutesToHM(data.overall.studyMinutes7d)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      累計: <strong>{formatMinutesToHM(data.overall.totalStudyMinutes)}</strong> ・ 稼働平均:{' '}
                      <strong>{formatMinutesToHM(data.overall.avgStudyMinutesPerActive7d)}/週</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      📘 公式テキスト学習実績
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {data.overall.totalTextbooksCompleted}{' '}
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>読了単元</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      閲覧延べ単元: <strong>{data.overall.totalTextbooksViewed}単元</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      📝 公式テスト演習・全体正答率
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {data.overall.overallTestAccuracy !== null
                        ? `${data.overall.overallTestAccuracy}%`
                        : '—'}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      回答数: <strong>{data.overall.totalTestQuestionsAnswered}問</strong> ({data.overall.totalTestsTaken}セッション)
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      🤖 AIドリル・質問チューター活用
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {data.overall.totalAiDrills + data.overall.totalAiChats}{' '}
                      <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>回</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      演習: <strong>{data.overall.totalAiDrills}回</strong> ・ チャット質問:{' '}
                      <strong>{data.overall.totalAiChats}回</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '16px 18px',
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700 }}>
                      🧭 シラバス進捗＆暗記定着
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#1E3A5F', marginTop: '6px' }}>
                      {data.overall.overallAvgSyllabusProgress}%{' '}
                      <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                        (構築 {data.overall.syllabusBuiltRate}%)
                      </span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '4px' }}>
                      暗記カード保存: <strong>{data.overall.totalFlashcardsSaved}枚</strong> ・ しおり:{' '}
                      <strong>{data.overall.totalBookmarksSaved}件</strong>
                    </div>
                  </div>
                </div>

                {/* 14-Day Activity Chart */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '20px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '14px',
                      flexWrap: 'wrap',
                      gap: '8px',
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1E3A5F' }}>
                        📈 直近14日間の日別学習時間 & アクティブ推移
                      </h2>
                      <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                        各棒グラフは全対象生徒の合計学習時間（分）、下部数字はその日のユニーク稼働人数を示します。
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(14, 1fr)',
                      gap: '8px',
                      alignItems: 'end',
                      height: '190px',
                      paddingTop: '24px',
                      borderBottom: '1px solid #CBD5E1',
                    }}
                  >
                    {data.overall.dailyTrend.map((day) => {
                      const heightPct = Math.max(
                        day.studyMinutes > 0 ? 8 : 2,
                        Math.round((day.studyMinutes / maxTrendMinutes) * 100)
                      );
                      return (
                        <div
                          key={day.date}
                          title={`${day.date}\n合計学習: ${day.studyMinutes}分\nアクティブ人数: ${day.activeUsers}名\nテキスト閲覧: ${day.materialViewCount}回\nテスト/ドリル: ${day.drillAndTestCount}回\nAIチャット: ${day.chatCount}回`}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            height: '100%',
                            justifyContent: 'flex-end',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#1E3A5F',
                              marginBottom: '3px',
                            }}
                          >
                            {day.studyMinutes > 0 ? `${day.studyMinutes}m` : ''}
                          </div>
                          <div
                            style={{
                              width: '100%',
                              maxWidth: '34px',
                              height: `${heightPct}%`,
                              backgroundColor: day.studyMinutes > 0 ? '#1E3A5F' : '#E2E8F0',
                              borderRadius: '4px 4px 0 0',
                              transition: 'height 0.2s',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(14, 1fr)',
                      gap: '8px',
                      marginTop: '6px',
                      textAlign: 'center',
                    }}
                  >
                    {data.overall.dailyTrend.map((day) => (
                      <div key={day.date}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>
                          {day.label}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                          {day.activeUsers}人
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Subject Breakdown & Quick Highlights Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                    gap: '18px',
                  }}
                >
                  {/* Subject Matrix */}
                  <div
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E8F0',
                      borderRadius: '12px',
                      padding: '20px',
                    }}
                  >
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '1.08rem', color: '#1E3A5F' }}>
                      📚 教科別の学習実績・定着率バランス
                    </h2>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                            <th style={{ padding: '8px 6px' }}>教科</th>
                            <th style={{ padding: '8px 6px', textAlign: 'right' }}>テキスト閲覧</th>
                            <th style={{ padding: '8px 6px', textAlign: 'right' }}>読了数</th>
                            <th style={{ padding: '8px 6px', textAlign: 'right' }}>テスト回答問数</th>
                            <th style={{ padding: '8px 6px', textAlign: 'right' }}>正答率</th>
                            <th style={{ padding: '8px 6px', textAlign: 'right' }}>AI質問/演習</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.overall.subjectBreakdown.map((sb) => (
                            <tr key={sb.subject} style={{ borderBottom: '1px solid #F1F5F9' }}>
                              <td style={{ padding: '9px 6px', fontWeight: 700, color: '#1E3A5F' }}>
                                {sb.subject}
                              </td>
                              <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                                {sb.textbookViews}回
                              </td>
                              <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                                {sb.textbooksCompleted}件
                              </td>
                              <td style={{ padding: '9px 6px', textAlign: 'right' }}>
                                {sb.testQuestionsAnswered}問
                              </td>
                              <td style={{ padding: '9px 6px', textAlign: 'right', fontWeight: 700 }}>
                                {sb.testAccuracy !== null ? (
                                  <span
                                    style={{
                                      color:
                                        sb.testAccuracy >= 80
                                          ? '#059669'
                                          : sb.testAccuracy >= 60
                                          ? '#1E3A5F'
                                          : '#B45309',
                                    }}
                                  >
                                    {sb.testAccuracy}%
                                  </span>
                                ) : (
                                  <span style={{ color: '#94A3B8' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '9px 6px', textAlign: 'right', color: '#475569' }}>
                                {sb.aiDrillCount + sb.aiChatCount}回
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Top Learners & Follow-up Needed */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '16px',
                      }}
                    >
                      <h3 style={{ margin: '0 0 10px 0', fontSize: '0.96rem', color: '#1E3A5F' }}>
                        🏆 直近7日間の学習時間 TOP5
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {overallHighlights.topLearners.map((u, idx) => (
                          <div
                            key={u.id}
                            onClick={() => setDetailUser(u)}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              backgroundColor: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              fontSize: '0.83rem',
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 700, color: '#1E3A5F', marginRight: '6px' }}>
                                #{idx + 1}
                              </span>
                              <span style={{ fontWeight: 600 }}>{u.name}</span>
                              <span style={{ fontSize: '0.74rem', color: '#64748B', marginLeft: '6px' }}>
                                {u.gradeLabel}
                              </span>
                            </div>
                            <div style={{ fontWeight: 700, color: '#059669' }}>
                              {formatMinutesToHM(u.studyMinutes7d)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '16px',
                      }}
                    >
                      <h3 style={{ margin: '0 0 10px 0', fontSize: '0.96rem', color: '#B45309' }}>
                        🔔 フォロー推奨（未稼働・未構築・要復習）
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {overallHighlights.followUp.length === 0 ? (
                          <div style={{ fontSize: '0.84rem', color: '#64748B' }}>
                            現在フォローが必要な利用者はいません。
                          </div>
                        ) : (
                          overallHighlights.followUp.map((u) => (
                            <div
                              key={u.id}
                              onClick={() => setDetailUser(u)}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '8px',
                                backgroundColor: '#FFFBEB',
                                border: '1px solid #FDE68A',
                                cursor: 'pointer',
                                fontSize: '0.82rem',
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                                <span>
                                  {u.name} ({u.gradeLabel})
                                </span>
                                <span style={{ color: '#92400E', fontSize: '0.74rem' }}>
                                  {!u.isActive7d
                                    ? '7日以上未稼働'
                                    : !u.hasSyllabus
                                    ? 'シラバス未構築'
                                    : `要復習${u.feedbackQueueCount}件`}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 2: COHORT ANALYTICS (SCHOOL TYPE / GRADE / TRACK)          */}
            {/* ============================================================== */}
            {activeTab === 'cohorts' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Executive Summary Cards: Junior High vs High vs Science vs Arts */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '14px',
                  }}
                >
                  {data.cohorts
                    .filter((c) =>
                      ['all_junior_high', 'all_high', 'hs_science', 'hs_arts'].includes(c.key)
                    )
                    .map((c) => (
                      <div
                        key={c.key}
                        onClick={() => handleCohortDrillDown(c.key)}
                        style={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '12px',
                          padding: '18px',
                          cursor: 'pointer',
                        }}
                        title="クリックすると個人別タブでこの区分を絞り込み表示します"
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1E3A5F' }}>
                            {c.label}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              padding: '2px 9px',
                              borderRadius: '999px',
                              backgroundColor: '#EFF6FF',
                              color: '#1E3A5F',
                              fontWeight: 700,
                            }}
                          >
                            {c.userCount}名
                          </span>
                        </div>
                        <div style={{ marginTop: '12px', display: 'grid', gap: '5px', fontSize: '0.84rem', color: '#334155' }}>
                          <div>
                            週間アクティブ率: <strong>{c.active7dRate}%</strong> ({c.active7dCount}名)
                          </div>
                          <div>
                            1人平均学習時間: <strong>{formatMinutesToHM(c.avgStudyMinutesPerUser)}</strong>{' '}
                            <span style={{ color: '#64748B', fontSize: '0.78rem' }}>
                              (週平均 {formatMinutesToHM(c.avgStudyMinutes7dPerUser)})
                            </span>
                          </div>
                          <div>
                            平均シラバス進捗: <strong>{c.avgSyllabusProgress}%</strong> ・ テスト正答率:{' '}
                            <strong>{c.testAccuracy !== null ? `${c.testAccuracy}%` : '—'}</strong>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                {/* Detailed Grade & Track Matrix Table */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '20px',
                    overflowX: 'auto',
                  }}
                >
                  <div style={{ marginBottom: '14px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.12rem', color: '#1E3A5F' }}>
                      🏫 中・高・学年別・文理別 精密分析マトリクス
                    </h2>
                    <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                      行をクリックすると該当学年・コースの個人一覧へドリルダウンします。
                    </p>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', minWidth: '980px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#475569' }}>
                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>区分・学年・コース</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>在籍数</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>7日稼働 (率)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>平均学習時間 (累計)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>平均偏差値</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>シラバス進捗</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>テキスト閲覧/読了</th>
                        <th style={{ padding: '10px 8px', textAlign: 'right' }}>テスト正答率 (問数)</th>
                        <th style={{ padding: '10px 8px', textAlign: 'left' }}>主な志望校・苦手傾向</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.cohorts.map((c) => {
                        const isSummary = c.group === 'summary';
                        return (
                          <tr
                            key={c.key}
                            onClick={() => handleCohortDrillDown(c.key)}
                            style={{
                              borderBottom: '1px solid #E2E8F0',
                              backgroundColor: isSummary ? '#F8FAFC' : '#FFFFFF',
                              fontWeight: isSummary ? 700 : 400,
                              cursor: 'pointer',
                            }}
                          >
                            <td style={{ padding: '11px 8px', fontWeight: 700, color: '#1E3A5F' }}>
                              {c.label}
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>{c.userCount}名</td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              {c.active7dCount}名 ({c.active7dRate}%)
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              {formatMinutesToHM(c.avgStudyMinutesPerUser)}
                              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                合計 {formatMinutesToHM(c.totalStudyMinutes)}
                              </div>
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              {c.avgDeviationScore !== null ? c.avgDeviationScore : '—'}
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              <div>{c.avgSyllabusProgress}%</div>
                              <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                (構築 {c.syllabusCreatedCount}名)
                              </div>
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              {c.textbooksViewed} / <strong>{c.textbooksCompleted}</strong>
                            </td>
                            <td style={{ padding: '11px 8px', textAlign: 'right' }}>
                              {c.testAccuracy !== null ? (
                                <span
                                  style={{
                                    fontWeight: 700,
                                    color: c.testAccuracy >= 80 ? '#059669' : '#1E3A5F',
                                  }}
                                >
                                  {c.testAccuracy}%
                                </span>
                              ) : (
                                '—'
                              )}
                              <span style={{ fontSize: '0.74rem', color: '#64748B', marginLeft: '4px' }}>
                                ({c.testQuestionsAnswered}問)
                              </span>
                            </td>
                            <td style={{ padding: '11px 8px', fontSize: '0.76rem', color: '#475569' }}>
                              <div>
                                志望:{' '}
                                {c.topTargetSchools.length > 0
                                  ? c.topTargetSchools.map((x) => `${x.name}(${x.count})`).join(', ')
                                  : '—'}
                              </div>
                              <div>
                                苦手:{' '}
                                {c.topWeakSubjects.length > 0
                                  ? c.topWeakSubjects.map((x) => `${x.name}(${x.count})`).join(', ')
                                  : '—'}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ============================================================== */}
            {/* TAB 3: INDIVIDUAL STUDENT ANALYTICS                            */}
            {/* ============================================================== */}
            {activeTab === 'individual' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Filter & Sort Controls */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    padding: '16px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="text"
                    placeholder="氏名・ID・在籍校・志望校で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1,
                      minWidth: '210px',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #CBD5E1',
                      fontSize: '0.86rem',
                    }}
                  />

                  <select
                    value={filterSchoolType}
                    onChange={(e) => setFilterSchoolType(e.target.value as any)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  >
                    <option value="all">学校区分: すべて</option>
                    <option value="high">高等学校</option>
                    <option value="junior_high">中学校</option>
                  </select>

                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value as any)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  >
                    <option value="all">学年: すべて</option>
                    <option value="1">1年生</option>
                    <option value="2">2年生</option>
                    <option value="3">3年生</option>
                  </select>

                  <select
                    value={filterTrack}
                    onChange={(e) => setFilterTrack(e.target.value as any)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  >
                    <option value="all">文理: すべて</option>
                    <option value="science">理系</option>
                    <option value="arts">文系</option>
                    <option value="undecided">未選択</option>
                  </select>

                  <select
                    value={filterActivity}
                    onChange={(e) => setFilterActivity(e.target.value as any)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                  >
                    <option value="all">稼働状況: すべて</option>
                    <option value="active7d">直近7日アクティブ</option>
                    <option value="inactive7d">7日以上未稼働</option>
                    <option value="no_syllabus">シラバス未構築</option>
                    <option value="has_weak">要復習単元あり</option>
                  </select>

                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    style={{
                      padding: '8px',
                      borderRadius: '6px',
                      border: '1px solid #1E3A5F',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: '#1E3A5F',
                    }}
                  >
                    <option value="study7d">並び替え: 直近7日学習時間</option>
                    <option value="studyTotal">並び替え: 累計学習時間</option>
                    <option value="lastActive">並び替え: 最終アクティブ日時</option>
                    <option value="syllabus">並び替え: シラバス進捗率</option>
                    <option value="accuracy">並び替え: テスト正答率</option>
                    <option value="materials">並び替え: テキスト閲覧数</option>
                  </select>
                </div>

                {/* Individual Table */}
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    overflowX: 'auto',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem', minWidth: '1050px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', color: '#475569' }}>
                        <th style={{ padding: '11px 10px', textAlign: 'left' }}>氏名 / ID</th>
                        <th style={{ padding: '11px 8px', textAlign: 'left' }}>学年・コース・在籍校</th>
                        <th style={{ padding: '11px 8px', textAlign: 'left' }}>第一志望 (偏差値)</th>
                        <th style={{ padding: '11px 8px', textAlign: 'left' }}>稼働状況 / ストリーク</th>
                        <th style={{ padding: '11px 8px', textAlign: 'right' }}>学習時間 (7日 / 累計)</th>
                        <th style={{ padding: '11px 8px', textAlign: 'right' }}>シラバス進捗</th>
                        <th style={{ padding: '11px 8px', textAlign: 'right' }}>テキスト (読了/閲覧)</th>
                        <th style={{ padding: '11px 8px', textAlign: 'right' }}>テスト正答率 (問)</th>
                        <th style={{ padding: '11px 8px', textAlign: 'right' }}>AI・暗記</th>
                        <th style={{ padding: '11px 10px', textAlign: 'center' }}>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                            条件に一致する利用者がいません。
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((u) => (
                          <tr key={u.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontWeight: 700, color: '#0F172A' }}>
                                {u.name}
                                {u.role === 'admin' && (
                                  <span
                                    style={{
                                      marginLeft: '5px',
                                      fontSize: '0.68rem',
                                      padding: '1px 5px',
                                      backgroundColor: '#E2E8F0',
                                      borderRadius: '4px',
                                    }}
                                  >
                                    管理者
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'monospace' }}>
                                {u.id}
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontWeight: 600 }}>
                                {u.gradeLabel} {u.trackLabel !== '-' ? `(${u.trackLabel})` : ''}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                {u.schoolName || '学校未設定'}
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ fontWeight: 600 }}>
                                {u.targetSchools[0] && !u.targetSchools[0].includes('未設定')
                                  ? u.targetSchools[0]
                                  : '未設定'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                偏差値: {u.deviationScore ?? '未診断'}
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    backgroundColor: u.isActiveToday
                                      ? '#DCFCE7'
                                      : u.isActive7d
                                      ? '#E0F2FE'
                                      : '#F1F5F9',
                                    color: u.isActiveToday
                                      ? '#166534'
                                      : u.isActive7d
                                      ? '#0369A1'
                                      : '#64748B',
                                  }}
                                >
                                  {u.isActiveToday ? '今日稼働' : u.isActive7d ? '7日以内' : '停滞中'}
                                </span>
                                {u.streakDays > 0 && (
                                  <span style={{ fontSize: '0.74rem', color: '#D97706', fontWeight: 700 }}>
                                    🔥 {u.streakDays}日
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                最終: {formatDateTimeShort(u.lastActiveAt || u.lastLoginAt)}
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, color: '#1E3A5F' }}>
                                {formatMinutesToHM(u.studyMinutes7d)}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                累計 {formatMinutesToHM(u.totalStudyMinutes)}
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              {u.hasSyllabus ? (
                                <>
                                  <div style={{ fontWeight: 700 }}>{u.syllabusProgress}%</div>
                                  <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    {u.syllabusCompletedTasks}/{u.syllabusTotalTasks}
                                  </div>
                                </>
                              ) : (
                                <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>未構築</span>
                              )}
                            </td>

                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <strong>{u.textbooksCompletedCount}</strong> / {u.textbooksViewedCount}
                            </td>

                            <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 700 }}>
                                {u.testAccuracy !== null ? `${u.testAccuracy}%` : '—'}
                              </div>
                              <div style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                ({u.testQuestionsAnswered}問)
                              </div>
                            </td>

                            <td style={{ padding: '10px 8px', textAlign: 'right', fontSize: '0.76rem', color: '#475569' }}>
                              <div>
                                ドリル{u.aiDrillCount} / 質問{u.aiChatCount}
                              </div>
                              <div>
                                カード{u.flashcardsCount}枚
                                {u.feedbackQueueCount > 0 && (
                                  <span style={{ color: '#B45309', fontWeight: 700 }}>
                                    {' '}
                                    (弱{u.feedbackQueueCount})
                                  </span>
                                )}
                              </div>
                            </td>

                            <td style={{ padding: '10px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                <button
                                  onClick={() => setDetailUser(u)}
                                  style={{
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#1E3A5F',
                                    color: '#FFFFFF',
                                    fontSize: '0.76rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  詳細カルテ
                                </button>
                                <Link
                                  href={`/admin/syllabus?userId=${encodeURIComponent(u.id)}`}
                                  style={{
                                    padding: '5px 9px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#334155',
                                    fontSize: '0.76rem',
                                    fontWeight: 600,
                                    textDecoration: 'none',
                                  }}
                                >
                                  シラバス
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}

      {/* ==================================================================== */}
      {/* INDIVIDUAL USER DEEP-DIVE MODAL                                      */}
      {/* ==================================================================== */}
      {detailUser && data && (
        <div
          onClick={() => setDetailUser(null)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.55)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '20px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              width: '100%',
              maxWidth: '1020px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid #E2E8F0',
                paddingBottom: '14px',
                marginBottom: '18px',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#1E3A5F' }}>
                    👤 {detailUser.name} の個人別学習カルテ
                  </h2>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: '#F1F5F9',
                      fontFamily: 'monospace',
                    }}
                  >
                    {detailUser.id}
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '2px 10px',
                      borderRadius: '999px',
                      backgroundColor: '#E0F2FE',
                      color: '#0369A1',
                      fontWeight: 700,
                    }}
                  >
                    {detailUser.gradeLabel}
                    {detailUser.trackLabel !== '-' ? `・${detailUser.trackLabel}` : ''}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: '#475569', marginTop: '6px' }}>
                  在籍: {detailUser.schoolName || '未設定'} ・ 志望校:{' '}
                  {detailUser.targetSchools.join(' / ') || '未設定'} ・ 偏差値:{' '}
                  {detailUser.deviationScore ?? '未診断'} ・ 連続学習: {detailUser.streakDays}日
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Link
                  href={`/admin/syllabus?userId=${encodeURIComponent(detailUser.id)}`}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '7px',
                    backgroundColor: '#1E3A5F',
                    color: '#FFFFFF',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    textDecoration: 'none',
                  }}
                >
                  📋 個別シラバスを管理 →
                </Link>
                <button
                  onClick={() => setDetailUser(null)}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '7px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  ✕ 閉じる
                </button>
              </div>
            </div>

            {/* Modal Summary KPIs */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '10px',
                marginBottom: '18px',
              }}
            >
              {[
                { label: '直近7日学習時間', val: formatMinutesToHM(detailUser.studyMinutes7d) },
                { label: '累計学習時間', val: formatMinutesToHM(detailUser.totalStudyMinutes) },
                {
                  label: 'シラバス進捗',
                  val: detailUser.hasSyllabus ? `${detailUser.syllabusProgress}%` : '未構築',
                },
                {
                  label: 'テキスト読了/閲覧',
                  val: `${detailUser.textbooksCompletedCount} / ${detailUser.textbooksViewedCount}`,
                },
                {
                  label: 'テスト正答率',
                  val: detailUser.testAccuracy !== null ? `${detailUser.testAccuracy}%` : '—',
                },
                {
                  label: 'AIドリル / 質問',
                  val: `${detailUser.aiDrillCount}回 / ${detailUser.aiChatCount}回`,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: '0.73rem', color: '#64748B', fontWeight: 600 }}>
                    {item.label}
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1E3A5F', marginTop: '3px' }}>
                    {item.val}
                  </div>
                </div>
              ))}
            </div>

            {/* 30-Day Study Heatmap */}
            <div
              style={{
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '14px',
                marginBottom: '18px',
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1E3A5F', marginBottom: '8px' }}>
                📅 直近30日間の学習ヒートマップ
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(15, 1fr)', gap: '6px' }}>
                {data.dateRange.last30Dates.map((dKey) => {
                  const mins = detailUser.studyTimeByDate[dKey] || 0;
                  const bg =
                    mins >= 120
                      ? '#1E3A5F'
                      : mins >= 60
                      ? '#3B82F6'
                      : mins > 0
                      ? '#93C5FD'
                      : '#E2E8F0';
                  const fg = mins >= 60 ? '#FFFFFF' : '#334155';
                  return (
                    <div
                      key={dKey}
                      title={`${dKey}: ${mins}分`}
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        borderRadius: '6px',
                        padding: '6px 4px',
                        textAlign: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                      }}
                    >
                      <div>{dKey.slice(5).replace('-', '/')}</div>
                      <div>{mins > 0 ? `${mins}m` : '-'}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Detailed Tabs inside Modal: Materials, Tests, Weak Queue, Recent Logs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Recent Materials */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1E3A5F' }}>
                  📘 公式テキスト学習履歴 ({detailUser.textbooksViewedCount}単元)
                </h3>
                {detailUser.recentMaterials.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748B' }}>履歴なし</div>
                ) : (
                  <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {detailUser.recentMaterials.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <span style={{ fontWeight: 700, color: '#1E3A5F', marginRight: '5px' }}>
                            [{m.unitCode}]
                          </span>
                          <span>{m.title}</span>
                        </div>
                        <div style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.72rem',
                              backgroundColor: m.completed ? '#DCFCE7' : '#E2E8F0',
                              color: m.completed ? '#166534' : '#475569',
                              fontWeight: 600,
                            }}
                          >
                            {m.completed ? '読了' : `${m.viewCount}回閲覧`}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Official Tests */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1E3A5F' }}>
                  📝 公式テスト受験履歴 ({detailUser.testsTakenCount}セッション)
                </h3>
                {detailUser.recentTests.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748B' }}>履歴なし</div>
                ) : (
                  <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {detailUser.recentTests.map((t, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                          gap: '8px',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{t.title}</div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {t.level} ・ {formatDateTimeShort(t.updatedAt)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div
                            style={{
                              fontWeight: 800,
                              color: t.scorePercent >= 80 ? '#059669' : '#B45309',
                            }}
                          >
                            {t.scorePercent}%
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                            {t.correctCount}/{t.answeredCount}問
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Feedback Queue */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#B45309' }}>
                  📌 重点復習・弱点補強キュー ({detailUser.feedbackQueueCount}件)
                </h3>
                {detailUser.feedbackQueue.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748B' }}>登録されている弱点はありません</div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {detailUser.feedbackQueue.map((fq, idx) => (
                      <div
                        key={fq.id || idx}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '6px',
                          backgroundColor: '#FFFBEB',
                          border: '1px solid #FDE68A',
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8rem',
                        }}
                      >
                        <span>
                          <strong>[{fq.subject}]</strong> {fq.topic}
                        </span>
                        <span style={{ fontWeight: 700, color: '#92400E' }}>
                          {fq.scorePercent ?? '-'}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity Timeline */}
              <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', color: '#1E3A5F' }}>
                  🕒 最近のアクティビティログ
                </h3>
                {detailUser.recentLogs.length === 0 ? (
                  <div style={{ fontSize: '0.82rem', color: '#64748B' }}>アクティビティなし</div>
                ) : (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'grid', gap: '6px' }}>
                    {detailUser.recentLogs.map((l, idx) => (
                      <div
                        key={l.id || idx}
                        style={{
                          padding: '6px 9px',
                          borderRadius: '6px',
                          backgroundColor: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div style={{ color: '#64748B', fontSize: '0.7rem' }}>
                          {formatDateTimeShort(l.timestamp)} ・ [{l.type}]
                        </div>
                        <div style={{ color: '#0F172A', marginTop: '2px' }}>{l.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
