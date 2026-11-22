'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  buildUnifiedCatalog,
  findMatchingUnitsForTask,
  UnifiedUnit,
  CurriculumSubject,
  ContentItem,
} from '@/lib/content-slots';
import type { SyllabusPhase, SyllabusTask, FeedbackQueueItem } from '@/lib/db';

type AdminSyllabusUser = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'admin' | 'student';
  status: string;
  createdAt: string;
  lastLoginAt: string;
  profile: {
    name: string;
    schoolType: 'junior_high' | 'high';
    schoolName: string;
    department: string;
    grade: number;
    track: 'arts' | 'science' | 'undecided';
    selectedSubjects: string[];
    targetSchools: string[];
    weakSubjects: string[];
    deviationScore: number | null;
    completedTasks: string[];
  };
  syllabus: SyllabusPhase[];
  syllabusUpdatedAt: string | null;
  syllabusRebalanceAlert: { reason?: string; message?: string; timestamp?: string } | null;
  personalizedCurriculum: any | null;
  masteredUnits: string[];
  materialViewsCount: number;
  feedbackQueue: FeedbackQueueItem[];
  totalTasks: number;
  completedTasksCount: number;
  progressPercent: number;
};

const ALL_SUBJECT_OPTIONS = ['英語', '数学', '国語', '理科', '社会', '情報'];

export default function SyllabusAdminPage() {
  const [users, setUsers] = useState<AdminSyllabusUser[]>([]);
  const [masterDb, setMasterDb] = useState<CurriculumSubject[]>([]);
  const [materials, setMaterials] = useState<ContentItem[]>([]);
  const [tests, setTests] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selection & Filters
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'built' | 'unbuilt' | 'high' | 'junior_high'>('all');

  // Editing States for Selected User
  const [draftSyllabus, setDraftSyllabus] = useState<SyllabusPhase[]>([]);
  const [draftCompletedTasks, setDraftCompletedTasks] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Profile Inline Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [draftProfile, setDraftProfile] = useState({
    schoolType: 'high' as 'junior_high' | 'high',
    grade: 2,
    track: 'undecided' as 'arts' | 'science' | 'undecided',
    schoolName: '',
    department: '',
    deviationScore: '' as string | number,
    targetSchoolsText: '',
    selectedSubjects: [] as string[],
    weakSubjects: [] as string[],
  });

  // Add Task Modal / Inline Controls
  const [addingTaskTarget, setAddingTaskTarget] = useState<{ phaseIdx: number; catIdx: number } | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<'core' | 'weakness' | 'diagnostic'>('core');
  const [catalogSearch, setCatalogSearch] = useState('');

  // Add Category Inline
  const [addingCategoryPhaseIdx, setAddingCategoryPhaseIdx] = useState<number | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Action Status
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showExtraAccordion, setShowExtraAccordion] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((prev) => (prev === msg ? null : prev)), 4000);
  };

  const fetchSyllabusData = async (preserveSelectedId?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/syllabus');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'データの読み込みに失敗しました');
      }

      const loadedUsers: AdminSyllabusUser[] = data.users || [];
      setUsers(loadedUsers);
      setMasterDb(data.masterDb || []);
      setMaterials(data.materials || []);
      setTests(data.tests || []);

      const queryUserId =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('userId')
          : null;

      const targetId =
        preserveSelectedId ||
        (queryUserId && loadedUsers.some((u) => u.id === queryUserId) ? queryUserId : '') ||
        (loadedUsers.find((u) => u.role === 'student')?.id || loadedUsers[0]?.id || '');

      if (targetId) {
        setSelectedUserId(targetId);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || '読み込みエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSyllabusData();
  }, []);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  // Sync draft state when selected user changes
  useEffect(() => {
    if (!selectedUser) return;
    setDraftSyllabus(JSON.parse(JSON.stringify(selectedUser.syllabus || [])));
    setDraftCompletedTasks([...(selectedUser.profile.completedTasks || [])]);
    setDraftProfile({
      schoolType: selectedUser.profile.schoolType || 'high',
      grade: selectedUser.profile.grade || 2,
      track: selectedUser.profile.track || 'undecided',
      schoolName: selectedUser.profile.schoolName || '',
      department: selectedUser.profile.department || '',
      deviationScore:
        typeof selectedUser.profile.deviationScore === 'number'
          ? selectedUser.profile.deviationScore
          : '',
      targetSchoolsText: (selectedUser.profile.targetSchools || []).join('、'),
      selectedSubjects: [...(selectedUser.profile.selectedSubjects || [])],
      weakSubjects: [...(selectedUser.profile.weakSubjects || [])],
    });
    setHasUnsavedChanges(false);
    setIsEditingProfile(false);
    setAddingTaskTarget(null);
    setAddingCategoryPhaseIdx(null);
  }, [selectedUser]);

  // Unified Catalog built from masterDb + materials + tests for real-time unit linkage
  const unifiedCatalog = useMemo(() => {
    const targetLevel =
      selectedUser?.profile.schoolType === 'junior_high' ? 'junior_high' : 'high_school';
    const filteredCurriculum = masterDb.filter(
      (c) => !c.level || c.level === targetLevel
    );
    const completedSet = Array.from(
      new Set([...draftCompletedTasks, ...(selectedUser?.masteredUnits || [])])
    );
    return buildUnifiedCatalog(
      filteredCurriculum.length > 0 ? filteredCurriculum : masterDb,
      materials,
      tests,
      {},
      completedSet
    );
  }, [masterDb, materials, tests, selectedUser, draftCompletedTasks]);

  // Filtered catalog units for quick-picking inside "Add Task"
  const filteredCatalogOptions = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return unifiedCatalog.units.filter((u) => u.material || u.tests.all.length > 0).slice(0, 30);
    return unifiedCatalog.units
      .filter(
        (u) =>
          u.smallName.toLowerCase().includes(q) ||
          u.mediumName.toLowerCase().includes(q) ||
          u.subjectName.toLowerCase().includes(q) ||
          (u.unitCode || '').toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [unifiedCatalog.units, catalogSearch]);

  // Top Summary KPIs
  const kpiStats = useMemo(() => {
    const students = users.filter((u) => u.role === 'student');
    const targetList = students.length > 0 ? students : users;
    const builtList = targetList.filter((u) => u.syllabus && u.syllabus.length > 0);
    const avgProgress =
      builtList.length > 0
        ? Math.round(builtList.reduce((acc, u) => acc + u.progressPercent, 0) / builtList.length)
        : 0;
    const totalCompletedCount = targetList.reduce((acc, u) => acc + u.completedTasksCount, 0);

    return {
      totalAccounts: users.length,
      studentCount: students.length,
      builtCount: builtList.length,
      builtRate: targetList.length > 0 ? Math.round((builtList.length / targetList.length) * 100) : 0,
      avgProgress,
      totalCompletedCount,
    };
  }, [users]);

  // Filtered User List in Sidebar
  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (userFilter === 'built' && u.syllabus.length === 0) return false;
      if (userFilter === 'unbuilt' && u.syllabus.length > 0) return false;
      if (userFilter === 'high' && u.profile.schoolType !== 'high') return false;
      if (userFilter === 'junior_high' && u.profile.schoolType !== 'junior_high') return false;
      if (!q) return true;
      return (
        u.id.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q) ||
        (u.profile.schoolName || '').toLowerCase().includes(q) ||
        (u.profile.targetSchools || []).some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [users, searchQuery, userFilter]);

  const isTaskCompleted = (task: SyllabusTask): boolean => {
    if (!selectedUser) return false;
    const completedSet = new Set([
      ...draftCompletedTasks,
      ...(selectedUser.masteredUnits || []),
    ]);
    return completedSet.has(task.title) || Boolean(task.id && completedSet.has(task.id));
  };

  // Actions
  const handleToggleTask = async (task: SyllabusTask) => {
    if (!selectedUser) return;
    const currentlyCompleted = isTaskCompleted(task);
    const nextCompleted = !currentlyCompleted;

    // Optimistic UI update
    const updatedCompleted = nextCompleted
      ? Array.from(new Set([...draftCompletedTasks, task.title]))
      : draftCompletedTasks.filter((item) => item !== task.title && item !== task.id);
    setDraftCompletedTasks(updatedCompleted);

    try {
      const res = await fetch('/api/admin/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_task',
          userId: selectedUser.id,
          taskTitle: task.title,
          taskId: task.id,
          completed: nextCompleted,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '更新に失敗しました');

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== selectedUser.id) return u;
          const nextProfileCompleted: string[] = data.completedTasks || updatedCompleted;
          const nextMastered: string[] = data.masteredUnits || u.masteredUnits;
          const set = new Set([...nextProfileCompleted, ...nextMastered]);
          let done = 0;
          let total = 0;
          for (const ph of draftSyllabus) {
            for (const c of ph.categories || []) {
              for (const t of c.tasks || []) {
                total++;
                if (set.has(t.title) || (t.id && set.has(t.id))) done++;
              }
            }
          }
          return {
            ...u,
            profile: { ...u.profile, completedTasks: nextProfileCompleted },
            masteredUnits: nextMastered,
            totalTasks: total,
            completedTasksCount: done,
            progressPercent: total > 0 ? Math.round((done / total) * 100) : 0,
          };
        })
      );
      showToast(
        nextCompleted
          ? `✅ 「${task.title}」を完了済みに更新しました`
          : `↩️ 「${task.title}」を未完了に戻しました`
      );
    } catch (e: any) {
      setDraftCompletedTasks(selectedUser.profile.completedTasks || []);
      alert(e?.message || '完了状態の更新に失敗しました');
    }
  };

  const buildProfilePayload = () => {
    const targetSchools = draftProfile.targetSchoolsText
      .split(/[、,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const deviationNum =
      draftProfile.deviationScore === '' ? null : Number(draftProfile.deviationScore);
    return {
      schoolType: draftProfile.schoolType,
      grade: Number(draftProfile.grade) || 2,
      track: draftProfile.track,
      schoolName: draftProfile.schoolName.trim(),
      department: draftProfile.department.trim(),
      deviationScore: Number.isFinite(deviationNum) && (deviationNum as number) > 0 ? deviationNum : undefined,
      targetSchools,
      selectedSubjects: draftProfile.selectedSubjects,
      weakSubjects: draftProfile.weakSubjects,
    };
  };

  const handleSaveProfileAndSyllabus = async (saveProfileAlso: boolean) => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      const payload: any = {
        action: 'save_syllabus',
        userId: selectedUser.id,
        syllabus: draftSyllabus,
        completedTasks: draftCompletedTasks,
      };
      if (saveProfileAlso || isEditingProfile) {
        payload.profileOverrides = buildProfilePayload();
      }

      const res = await fetch('/api/admin/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '保存に失敗しました');

      setHasUnsavedChanges(false);
      setIsEditingProfile(false);
      showToast('💾 シラバスおよび目標・プロフィール設定を保存しました');
      await fetchSyllabusData(selectedUser.id);
    } catch (e: any) {
      alert(e?.message || '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateAISyllabus = async () => {
    if (!selectedUser) return;
    if (
      selectedUser.syllabus.length > 0 &&
      !confirm(
        `${selectedUser.name} (${selectedUser.id}) の現在のシラバスを、最新のプロフィールと目標校に基づいてAI逆算再構築しますか？\n（完了済み記録は維持されます）`
      )
    ) {
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch('/api/admin/syllabus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          userId: selectedUser.id,
          profileOverrides: isEditingProfile ? buildProfilePayload() : undefined,
          reason: 'admin_manual_rebuild',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || '生成に失敗しました');

      setIsEditingProfile(false);
      setHasUnsavedChanges(false);
      showToast(`✨ ${selectedUser.name} のAI逆算シラバスを構築・反映しました`);
      await fetchSyllabusData(selectedUser.id);
    } catch (e: any) {
      alert(e?.message || 'AIシラバスの構築に失敗しました');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInitEmptyTemplate = () => {
    const schoolStr = selectedUser?.profile.schoolType === 'junior_high' ? '中' : '高';
    const g = selectedUser?.profile.grade || 2;
    const template: SyllabusPhase[] = [
      {
        phase: 'Phase 1',
        title: '基礎基盤確立期',
        period: `${schoolStr}${g} 前半`,
        targetMilestone: '教科書・基本事項の網羅',
        categories: [
          { name: '📘 英語', tasks: [] },
          { name: '📐 数学', tasks: [] },
        ],
      },
      {
        phase: 'Phase 2',
        title: '標準演習展開期',
        period: `${schoolStr}${g} 後半`,
        targetMilestone: '入試典型問題の定着',
        categories: [{ name: '📘 英語', tasks: [] }],
      },
      {
        phase: 'Phase 3',
        title: '実践力完成・過去問期',
        period: `${schoolStr}${g} 直前期`,
        targetMilestone: '志望校レベルの合格点到達',
        categories: [{ name: '📘 英語', tasks: [] }],
      },
    ];
    setDraftSyllabus(template);
    setHasUnsavedChanges(true);
    showToast('手動編集用の3フェーズ枠を作成しました。タスクを追加して保存してください。');
  };

  // Draft syllabus manipulation helpers
  const updatePhaseField = (pIdx: number, field: keyof SyllabusPhase, value: string) => {
    setDraftSyllabus((prev) =>
      prev.map((p, idx) => (idx === pIdx ? { ...p, [field]: value } : p))
    );
    setHasUnsavedChanges(true);
  };

  const updateTaskField = (
    pIdx: number,
    cIdx: number,
    tIdx: number,
    patch: Partial<SyllabusTask>
  ) => {
    setDraftSyllabus((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          categories: p.categories.map((c, j) => {
            if (j !== cIdx) return c;
            return {
              ...c,
              tasks: c.tasks.map((t, k) => (k === tIdx ? { ...t, ...patch } : t)),
            };
          }),
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const removeTask = (pIdx: number, cIdx: number, tIdx: number) => {
    setDraftSyllabus((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          categories: p.categories.map((c, j) => {
            if (j !== cIdx) return c;
            return { ...c, tasks: c.tasks.filter((_, k) => k !== tIdx) };
          }),
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const handleAddTaskToCategory = (pIdx: number, cIdx: number, customTitle?: string) => {
    const titleToAdd = (customTitle ?? newTaskTitle).trim();
    if (!titleToAdd) return;
    const newTask: SyllabusTask = {
      id: `admin_task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: titleToAdd,
      type: newTaskType,
    };
    setDraftSyllabus((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          categories: p.categories.map((c, j) => {
            if (j !== cIdx) return c;
            return { ...c, tasks: [...(c.tasks || []), newTask] };
          }),
        };
      })
    );
    setNewTaskTitle('');
    setAddingTaskTarget(null);
    setHasUnsavedChanges(true);
  };

  const handleAddCategoryToPhase = (pIdx: number) => {
    const name = newCategoryName.trim();
    if (!name) return;
    setDraftSyllabus((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          categories: [...(p.categories || []), { name, tasks: [] }],
        };
      })
    );
    setNewCategoryName('');
    setAddingCategoryPhaseIdx(null);
    setHasUnsavedChanges(true);
  };

  const removeCategory = (pIdx: number, cIdx: number) => {
    if (!confirm('この科目カテゴリ内のタスクも含めて削除しますか？')) return;
    setDraftSyllabus((prev) =>
      prev.map((p, i) => {
        if (i !== pIdx) return p;
        return {
          ...p,
          categories: p.categories.filter((_, j) => j !== cIdx),
        };
      })
    );
    setHasUnsavedChanges(true);
  };

  const toggleProfileSubject = (field: 'selectedSubjects' | 'weakSubjects', subj: string) => {
    setDraftProfile((prev) => {
      const current = prev[field];
      const next = current.includes(subj)
        ? current.filter((s) => s !== subj)
        : [...current, subj];
      return { ...prev, [field]: next };
    });
  };

  // Compute current selected user's draft progress
  const draftProgress = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const ph of draftSyllabus) {
      for (const c of ph.categories || []) {
        for (const t of c.tasks || []) {
          total++;
          if (isTaskCompleted(t)) done++;
        }
      }
    }
    return {
      total,
      done,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    };
  }, [draftSyllabus, draftCompletedTasks, selectedUser]);

  const formatSchoolBadge = (u: AdminSyllabusUser) => {
    const sType = u.profile.schoolType === 'junior_high' ? '中' : '高';
    const grade = u.profile.grade || 2;
    const track =
      u.profile.schoolType === 'high'
        ? u.profile.track === 'science'
          ? '・理系'
          : u.profile.track === 'arts'
          ? '・文系'
          : ''
        : '';
    return `${sType}${grade}${track}`;
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', color: '#0F172A' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 'bold', color: '#1E3A5F', margin: 0 }}>
            📋 個別シラバス管理
          </h1>
          <p style={{ color: '#475569', margin: '4px 0 0 0', fontSize: '0.92rem' }}>
            利用者ごとの目標校・現在地・マスターカリキュラム連携を点検し、個別シラバスのAI逆算構築・編集・進捗管理を行います。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link
            href="/admin/analytics"
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              color: '#1E3A5F',
              fontWeight: 600,
              fontSize: '0.88rem',
              textDecoration: 'none',
            }}
          >
            📊 利用状況分析へ
          </Link>
          <button
            onClick={() => fetchSyllabusData(selectedUserId)}
            style={{
              padding: '9px 16px',
              borderRadius: '8px',
              backgroundColor: '#1E3A5F',
              color: 'white',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: 'pointer',
            }}
          >
            🔄 最新状態に更新
          </button>
        </div>
      </div>

      {/* Toast Banner */}
      {toastMessage && (
        <div
          style={{
            marginBottom: '16px',
            padding: '12px 16px',
            borderRadius: '8px',
            backgroundColor: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            fontWeight: 600,
            fontSize: '0.92rem',
          }}
        >
          {toastMessage}
        </div>
      )}

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

      {/* Top 4 KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>対象利用者数</div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E3A5F', marginTop: '4px' }}>
            {kpiStats.studentCount}{' '}
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>
              名（全{kpiStats.totalAccounts}アカウント）
            </span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
            シラバス構築済みユーザー
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E3A5F', marginTop: '4px' }}>
            {kpiStats.builtCount}{' '}
            <span style={{ fontSize: '0.9rem', color: '#059669', fontWeight: 600 }}>
              ({kpiStats.builtRate}%)
            </span>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
            構築済ユーザー平均進捗率
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E3A5F', marginTop: '4px' }}>
            {kpiStats.avgProgress}%
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '16px 20px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
            累計シラバス完了・習得タスク
          </div>
          <div style={{ fontSize: '1.65rem', fontWeight: 700, color: '#1E3A5F', marginTop: '4px' }}>
            {kpiStats.totalCompletedCount}{' '}
            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 500 }}>件</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Workspace */}
      {loading ? (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            padding: '48px',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            textAlign: 'center',
            color: '#64748B',
          }}
        >
          シラバス管理データを読み込み中...
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '320px 1fr',
            gap: '20px',
            alignItems: 'start',
          }}
        >
          {/* Left Column: User List & Filter */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #E2E8F0',
              overflow: 'hidden',
              position: 'sticky',
              top: '16px',
            }}
          >
            <div style={{ padding: '14px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
              <input
                type="text"
                placeholder="氏名・ID・学校名・志望校で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.86rem',
                  boxSizing: 'border-box',
                  marginBottom: '10px',
                }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {[
                  { key: 'all', label: 'すべて' },
                  { key: 'built', label: '構築済' },
                  { key: 'unbuilt', label: '未構築' },
                  { key: 'high', label: '高校' },
                  { key: 'junior_high', label: '中学' },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setUserFilter(f.key as any)}
                    style={{
                      padding: '4px 9px',
                      fontSize: '0.75rem',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: userFilter === f.key ? '#1E3A5F' : '#CBD5E1',
                      backgroundColor: userFilter === f.key ? '#1E3A5F' : '#FFFFFF',
                      color: userFilter === f.key ? '#FFFFFF' : '#475569',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {filteredUsers.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.88rem' }}>
                  該当する利用者がいません。
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = u.id === selectedUserId;
                  const hasSyl = u.syllabus.length > 0;
                  return (
                    <div
                      key={u.id}
                      onClick={() => {
                        if (
                          hasUnsavedChanges &&
                          !confirm('未保存のシラバス編集内容があります。破棄して別ユーザーへ移動しますか？')
                        ) {
                          return;
                        }
                        setSelectedUserId(u.id);
                      }}
                      style={{
                        padding: '12px 14px',
                        borderBottom: '1px solid #F1F5F9',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#EFF6FF' : '#FFFFFF',
                        borderLeft: isSelected ? '4px solid #1E3A5F' : '4px solid transparent',
                        transition: 'background-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.92rem', color: '#0F172A' }}>
                          {u.name}
                          {u.role === 'admin' && (
                            <span
                              style={{
                                marginLeft: '6px',
                                fontSize: '0.7rem',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                backgroundColor: '#E2E8F0',
                                color: '#475569',
                              }}
                            >
                              管理者
                            </span>
                          )}
                        </div>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            padding: '2px 7px',
                            borderRadius: '999px',
                            fontWeight: 600,
                            backgroundColor: hasSyl ? '#DCFCE7' : '#F1F5F9',
                            color: hasSyl ? '#166534' : '#64748B',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {hasSyl ? `構築済 ${u.progressPercent}%` : '未構築'}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '3px' }}>
                        ID: {u.id} ・ {formatSchoolBadge(u)}
                        {u.profile.deviationScore ? ` / 偏差値${u.profile.deviationScore}` : ''}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#475569',
                          marginTop: '3px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        志望:{' '}
                        {u.profile.targetSchools.length > 0
                          ? u.profile.targetSchools.join(', ')
                          : '未設定'}
                      </div>
                      {hasSyl && (
                        <div
                          style={{
                            marginTop: '6px',
                            height: '5px',
                            backgroundColor: '#E2E8F0',
                            borderRadius: '999px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${u.progressPercent}%`,
                              height: '100%',
                              backgroundColor: '#1E3A5F',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Selected User Profile + Interactive Syllabus Editor */}
          {selectedUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Profile & Actions Card */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #E2E8F0',
                  padding: '20px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '12px',
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#1E3A5F' }}>
                        {selectedUser.name}
                      </h2>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: '#F1F5F9',
                          color: '#475569',
                          fontFamily: 'monospace',
                        }}
                      >
                        {selectedUser.id}
                      </span>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          padding: '2px 9px',
                          borderRadius: '999px',
                          backgroundColor: '#E0F2FE',
                          color: '#0369A1',
                          fontWeight: 600,
                        }}
                      >
                        {formatSchoolBadge(selectedUser)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '6px' }}>
                      最終シラバス更新:{' '}
                      {selectedUser.syllabusUpdatedAt
                        ? new Date(selectedUser.syllabusUpdatedAt).toLocaleString('ja-JP')
                        : '未構築'}
                      　|　学習済みテキスト単元: {selectedUser.materialViewsCount}件　|　要復習キュー:{' '}
                      {selectedUser.feedbackQueue.length}件
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setIsEditingProfile((v) => !v)}
                      style={{
                        padding: '8px 13px',
                        borderRadius: '7px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: isEditingProfile ? '#EFF6FF' : '#FFFFFF',
                        color: '#1E3A5F',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                      }}
                    >
                      ✏️ 目標・プロフィール設定を編集
                    </button>

                    <button
                      onClick={handleGenerateAISyllabus}
                      disabled={isGenerating}
                      style={{
                        padding: '8px 15px',
                        borderRadius: '7px',
                        border: 'none',
                        backgroundColor: isGenerating ? '#94A3B8' : '#1E3A5F',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        cursor: isGenerating ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isGenerating
                        ? '⏳ AI逆算シラバス構築中...'
                        : selectedUser.syllabus.length > 0
                        ? '✨ AI逆算シラバスを再構築'
                        : '✨ AI逆算シラバスを新規構築'}
                    </button>

                    <Link
                      href={`/admin/analytics?userId=${encodeURIComponent(selectedUser.id)}`}
                      style={{
                        padding: '8px 13px',
                        borderRadius: '7px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC',
                        color: '#334155',
                        fontWeight: 600,
                        fontSize: '0.84rem',
                        textDecoration: 'none',
                      }}
                    >
                      📊 利用状況カルテ →
                    </Link>
                  </div>
                </div>

                {/* Read-Only Profile Grid OR Inline Editor */}
                {!isEditingProfile ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: '12px',
                      backgroundColor: '#F8FAFC',
                      padding: '14px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      fontSize: '0.86rem',
                    }}
                  >
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.76rem' }}>在籍学校・学科</div>
                      <div style={{ fontWeight: 600, marginTop: '2px' }}>
                        {selectedUser.profile.schoolName || '未設定'}
                        {selectedUser.profile.department ? `（${selectedUser.profile.department}）` : ''}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.76rem' }}>第一〜第三志望校・目標</div>
                      <div style={{ fontWeight: 600, marginTop: '2px' }}>
                        {selectedUser.profile.targetSchools.length > 0
                          ? selectedUser.profile.targetSchools.join(' / ')
                          : '未設定'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.76rem' }}>目安偏差値</div>
                      <div style={{ fontWeight: 600, marginTop: '2px' }}>
                        {selectedUser.profile.deviationScore ?? '未診断'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#64748B', fontSize: '0.76rem' }}>選択科目 / 苦手科目</div>
                      <div style={{ fontWeight: 600, marginTop: '2px' }}>
                        {selectedUser.profile.selectedSubjects.length > 0
                          ? selectedUser.profile.selectedSubjects.join('・')
                          : '全般'}
                        {selectedUser.profile.weakSubjects.length > 0 && (
                          <span style={{ color: '#B45309', marginLeft: '6px' }}>
                            (苦手: {selectedUser.profile.weakSubjects.join('・')})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      backgroundColor: '#F8FAFC',
                      padding: '16px',
                      borderRadius: '8px',
                      border: '1px solid #BFDBFE',
                      display: 'grid',
                      gap: '12px',
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '10px',
                      }}
                    >
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        学校区分
                        <select
                          value={draftProfile.schoolType}
                          onChange={(e) =>
                            setDraftProfile((p) => ({
                              ...p,
                              schoolType: e.target.value as 'junior_high' | 'high',
                            }))
                          }
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                          }}
                        >
                          <option value="high">高等学校</option>
                          <option value="junior_high">中学校</option>
                        </select>
                      </label>

                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        学年
                        <select
                          value={draftProfile.grade}
                          onChange={(e) =>
                            setDraftProfile((p) => ({ ...p, grade: Number(e.target.value) }))
                          }
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                          }}
                        >
                          <option value={1}>1年生</option>
                          <option value={2}>2年生</option>
                          <option value={3}>3年生</option>
                        </select>
                      </label>

                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        文理区分（高校）
                        <select
                          value={draftProfile.track}
                          onChange={(e) =>
                            setDraftProfile((p) => ({
                              ...p,
                              track: e.target.value as 'arts' | 'science' | 'undecided',
                            }))
                          }
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                          }}
                        >
                          <option value="undecided">未定・共通</option>
                          <option value="science">理系</option>
                          <option value="arts">文系</option>
                        </select>
                      </label>

                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        目安偏差値
                        <input
                          type="number"
                          min={25}
                          max={85}
                          placeholder="例: 55"
                          value={draftProfile.deviationScore}
                          onChange={(e) =>
                            setDraftProfile((p) => ({ ...p, deviationScore: e.target.value }))
                          }
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        在籍校名
                        <input
                          type="text"
                          value={draftProfile.schoolName}
                          onChange={(e) =>
                            setDraftProfile((p) => ({ ...p, schoolName: e.target.value }))
                          }
                          placeholder="例: ○○県立△△高校"
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                        志望校（読点「、」区切りで複数入力可）
                        <input
                          type="text"
                          value={draftProfile.targetSchoolsText}
                          onChange={(e) =>
                            setDraftProfile((p) => ({ ...p, targetSchoolsText: e.target.value }))
                          }
                          placeholder="例: 千葉大学工学部、東京理科大学"
                          style={{
                            width: '100%',
                            marginTop: '4px',
                            padding: '7px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            boxSizing: 'border-box',
                          }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                          学習希望科目
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {ALL_SUBJECT_OPTIONS.map((subj) => {
                            const active = draftProfile.selectedSubjects.includes(subj);
                            return (
                              <button
                                key={subj}
                                type="button"
                                onClick={() => toggleProfileSubject('selectedSubjects', subj)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '999px',
                                  fontSize: '0.78rem',
                                  border: '1px solid',
                                  borderColor: active ? '#1E3A5F' : '#CBD5E1',
                                  backgroundColor: active ? '#1E3A5F' : '#FFFFFF',
                                  color: active ? '#FFFFFF' : '#475569',
                                  cursor: 'pointer',
                                }}
                              >
                                {subj}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>
                          重点補強（苦手）科目
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {ALL_SUBJECT_OPTIONS.map((subj) => {
                            const active = draftProfile.weakSubjects.includes(subj);
                            return (
                              <button
                                key={subj}
                                type="button"
                                onClick={() => toggleProfileSubject('weakSubjects', subj)}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '999px',
                                  fontSize: '0.78rem',
                                  border: '1px solid',
                                  borderColor: active ? '#B45309' : '#CBD5E1',
                                  backgroundColor: active ? '#FEF3C7' : '#FFFFFF',
                                  color: active ? '#92400E' : '#475569',
                                  cursor: 'pointer',
                                }}
                              >
                                {subj}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        style={{
                          padding: '7px 14px',
                          borderRadius: '6px',
                          border: '1px solid #CBD5E1',
                          backgroundColor: '#FFFFFF',
                          cursor: 'pointer',
                        }}
                      >
                        キャンセル
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSaveProfileAndSyllabus(true)}
                        style={{
                          padding: '7px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          backgroundColor: '#1E3A5F',
                          color: '#FFFFFF',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isSaving ? '保存中...' : '💾 プロフィール設定を保存'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Unsaved Changes Save Bar */}
              {hasUnsavedChanges && (
                <div
                  style={{
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    borderRadius: '10px',
                    padding: '12px 18px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <span style={{ color: '#92400E', fontWeight: 600, fontSize: '0.9rem' }}>
                    ⚠️ シラバス構成に未保存の編集があります。生徒画面へ反映するには保存してください。
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => {
                        setDraftSyllabus(JSON.parse(JSON.stringify(selectedUser.syllabus || [])));
                        setHasUnsavedChanges(false);
                      }}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '6px',
                        border: '1px solid #D97706',
                        backgroundColor: '#FFFFFF',
                        color: '#92400E',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      変更を元に戻す
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => handleSaveProfileAndSyllabus(false)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#1E3A5F',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isSaving ? '保存中...' : '💾 シラバスの編集内容を保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* Syllabus Content OR Empty State */}
              {draftSyllabus.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '40px 24px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>🧭</div>
                  <h3 style={{ margin: '0 0 8px 0', color: '#1E3A5F' }}>
                    この利用者の個別シラバスはまだ構築されていません
                  </h3>
                  <p style={{ color: '#64748B', fontSize: '0.9rem', maxWidth: '520px', margin: '0 auto 20px auto' }}>
                    利用者本人が初期設定後に「合格逆算シラバス生成」を実行するか、管理者側から下のボタンでAI逆算シラバス（または手動テンプレート）を作成・配信できます。
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleGenerateAISyllabus}
                      disabled={isGenerating}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: 'none',
                        backgroundColor: '#1E3A5F',
                        color: '#FFFFFF',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {isGenerating ? '⏳ AI構築中...' : '✨ 今すぐAI逆算シラバスを構築する'}
                    </button>
                    <button
                      onClick={handleInitEmptyTemplate}
                      style={{
                        padding: '10px 20px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#FFFFFF',
                        color: '#334155',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ＋ 手動で3フェーズ枠を作成する
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '20px',
                  }}
                >
                  {/* Overall Progress Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '10px',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 700, fontSize: '1.05rem', color: '#1E3A5F' }}>
                        📚 3段階逆算シラバス・タスク管理
                      </span>
                      <span style={{ marginLeft: '12px', fontSize: '0.86rem', color: '#475569' }}>
                        完了 {draftProgress.done} / {draftProgress.total} タスク（{draftProgress.percent}%）
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      height: '10px',
                      backgroundColor: '#E2E8F0',
                      borderRadius: '999px',
                      overflow: 'hidden',
                      marginBottom: '20px',
                    }}
                  >
                    <div
                      style={{
                        width: `${draftProgress.percent}%`,
                        height: '100%',
                        backgroundColor: '#1E3A5F',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>

                  {/* Phases */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {draftSyllabus.map((phase, pIdx) => {
                      let pTotal = 0;
                      let pDone = 0;
                      for (const c of phase.categories || []) {
                        for (const t of c.tasks || []) {
                          pTotal++;
                          if (isTaskCompleted(t)) pDone++;
                        }
                      }
                      const pPercent = pTotal > 0 ? Math.round((pDone / pTotal) * 100) : 0;

                      return (
                        <div
                          key={pIdx}
                          style={{
                            border: '1px solid #CBD5E1',
                            borderRadius: '10px',
                            overflow: 'hidden',
                          }}
                        >
                          {/* Phase Header */}
                          <div
                            style={{
                              backgroundColor: '#F8FAFC',
                              padding: '14px 16px',
                              borderBottom: '1px solid #E2E8F0',
                              display: 'grid',
                              gap: '8px',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: '10px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span
                                  style={{
                                    padding: '3px 10px',
                                    borderRadius: '6px',
                                    backgroundColor: '#1E3A5F',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                  }}
                                >
                                  {phase.phase || `Phase ${pIdx + 1}`}
                                </span>
                                <input
                                  type="text"
                                  value={phase.title}
                                  onChange={(e) => updatePhaseField(pIdx, 'title', e.target.value)}
                                  style={{
                                    fontWeight: 700,
                                    fontSize: '1rem',
                                    color: '#0F172A',
                                    border: '1px solid transparent',
                                    backgroundColor: 'transparent',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                  }}
                                />
                                <input
                                  type="text"
                                  value={phase.period}
                                  onChange={(e) => updatePhaseField(pIdx, 'period', e.target.value)}
                                  placeholder="目安時期"
                                  style={{
                                    fontSize: '0.82rem',
                                    color: '#475569',
                                    border: '1px solid #E2E8F0',
                                    backgroundColor: '#FFFFFF',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    width: '130px',
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E3A5F' }}>
                                進捗 {pDone}/{pTotal} ({pPercent}%)
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.78rem', color: '#64748B', whiteSpace: 'nowrap' }}>
                                🎯 到達目標:
                              </span>
                              <input
                                type="text"
                                value={phase.targetMilestone || ''}
                                onChange={(e) =>
                                  updatePhaseField(pIdx, 'targetMilestone', e.target.value)
                                }
                                placeholder="このフェーズの到達目標を入力"
                                style={{
                                  flex: 1,
                                  fontSize: '0.83rem',
                                  color: '#334155',
                                  border: '1px solid #E2E8F0',
                                  backgroundColor: '#FFFFFF',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                }}
                              />
                            </div>
                          </div>

                          {/* Categories inside Phase */}
                          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {(phase.categories || []).map((cat, cIdx) => {
                              const isAddingHere =
                                addingTaskTarget?.phaseIdx === pIdx && addingTaskTarget?.catIdx === cIdx;

                              return (
                                <div key={cIdx}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      marginBottom: '8px',
                                    }}
                                  >
                                    <div style={{ fontWeight: 700, color: '#1E3A5F', fontSize: '0.95rem' }}>
                                      {cat.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                      <button
                                        onClick={() => {
                                          setAddingTaskTarget(
                                            isAddingHere ? null : { phaseIdx: pIdx, catIdx: cIdx }
                                          );
                                          setNewTaskTitle('');
                                          setNewTaskType('core');
                                          setCatalogSearch('');
                                        }}
                                        style={{
                                          padding: '3px 9px',
                                          fontSize: '0.76rem',
                                          borderRadius: '6px',
                                          border: '1px solid #CBD5E1',
                                          backgroundColor: '#FFFFFF',
                                          color: '#1E3A5F',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        ＋ タスク追加
                                      </button>
                                      <button
                                        onClick={() => removeCategory(pIdx, cIdx)}
                                        style={{
                                          padding: '3px 8px',
                                          fontSize: '0.75rem',
                                          borderRadius: '6px',
                                          border: '1px solid #FECACA',
                                          backgroundColor: '#FEF2F2',
                                          color: '#B91C1C',
                                          cursor: 'pointer',
                                        }}
                                      >
                                        科目削除
                                      </button>
                                    </div>
                                  </div>

                                  {/* Add Task Drawer */}
                                  {isAddingHere && (
                                    <div
                                      style={{
                                        marginBottom: '10px',
                                        padding: '12px',
                                        borderRadius: '8px',
                                        backgroundColor: '#F8FAFC',
                                        border: '1px solid #BFDBFE',
                                      }}
                                    >
                                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <select
                                          value={newTaskType}
                                          onChange={(e) => setNewTaskType(e.target.value as any)}
                                          style={{
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                          }}
                                        >
                                          <option value="core">基本ルート (core)</option>
                                          <option value="weakness">弱点補強 (weakness)</option>
                                          <option value="diagnostic">レベル診断 (diagnostic)</option>
                                        </select>
                                        <input
                                          type="text"
                                          placeholder="単元名・タスクタイトルを入力（例: 2次関数の最大・最小）"
                                          value={newTaskTitle}
                                          onChange={(e) => setNewTaskTitle(e.target.value)}
                                          style={{
                                            flex: 1,
                                            minWidth: '220px',
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.84rem',
                                          }}
                                        />
                                        <button
                                          onClick={() => handleAddTaskToCategory(pIdx, cIdx)}
                                          style={{
                                            padding: '6px 14px',
                                            borderRadius: '6px',
                                            border: 'none',
                                            backgroundColor: '#1E3A5F',
                                            color: '#FFFFFF',
                                            fontWeight: 600,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          追加する
                                        </button>
                                      </div>

                                      {/* Quick Pick from Master Catalog */}
                                      <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                        <div style={{ marginBottom: '4px', fontWeight: 600 }}>
                                          または公式カリキュラム・学習テキスト単元から選んで追加：
                                        </div>
                                        <input
                                          type="text"
                                          placeholder="公式単元を検索（例: 三角比, 助動詞, 数Ａ-010）"
                                          value={catalogSearch}
                                          onChange={(e) => setCatalogSearch(e.target.value)}
                                          style={{
                                            width: '100%',
                                            padding: '5px 8px',
                                            borderRadius: '5px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.78rem',
                                            marginBottom: '6px',
                                            boxSizing: 'border-box',
                                          }}
                                        />
                                        <div
                                          style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '5px',
                                            maxHeight: '110px',
                                            overflowY: 'auto',
                                          }}
                                        >
                                          {filteredCatalogOptions.map((u) => (
                                            <button
                                              key={u.unitKey}
                                              type="button"
                                              onClick={() =>
                                                handleAddTaskToCategory(pIdx, cIdx, u.smallName)
                                              }
                                              style={{
                                                padding: '3px 8px',
                                                fontSize: '0.74rem',
                                                borderRadius: '5px',
                                                border: '1px solid #CBD5E1',
                                                backgroundColor: '#FFFFFF',
                                                color: '#0F172A',
                                                cursor: 'pointer',
                                              }}
                                            >
                                              {u.unitCode ? `[${u.unitCode}] ` : ''}
                                              {u.smallName}
                                              {u.material ? ' 📖' : ''}
                                              {u.tests.all.length > 0 ? ' 📝' : ''}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Task List */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(cat.tasks || []).length === 0 ? (
                                      <div style={{ fontSize: '0.82rem', color: '#94A3B8', paddingLeft: '8px' }}>
                                        （タスクがありません）
                                      </div>
                                    ) : (
                                      (cat.tasks || []).map((task, tIdx) => {
                                        const done = isTaskCompleted(task);
                                        const matchedUnits: UnifiedUnit[] =
                                          task.type === 'diagnostic'
                                            ? []
                                            : findMatchingUnitsForTask(
                                                task.title,
                                                cat.name,
                                                unifiedCatalog.units
                                              );
                                        const primaryUnit = matchedUnits[0] || null;

                                        return (
                                          <div
                                            key={task.id || tIdx}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'space-between',
                                              gap: '10px',
                                              padding: '8px 10px',
                                              borderRadius: '8px',
                                              border: '1px solid #E2E8F0',
                                              backgroundColor: done ? '#F8FAFC' : '#FFFFFF',
                                              flexWrap: 'wrap',
                                            }}
                                          >
                                            <div
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                flex: 1,
                                                minWidth: '250px',
                                              }}
                                            >
                                              <input
                                                type="checkbox"
                                                checked={done}
                                                onChange={() => handleToggleTask(task)}
                                                title="完了・未完了を切り替え"
                                                style={{
                                                  width: '16px',
                                                  height: '16px',
                                                  cursor: 'pointer',
                                                  accentColor: '#1E3A5F',
                                                }}
                                              />
                                              <select
                                                value={task.type || 'core'}
                                                onChange={(e) =>
                                                  updateTaskField(pIdx, cIdx, tIdx, {
                                                    type: e.target.value as any,
                                                  })
                                                }
                                                style={{
                                                  fontSize: '0.72rem',
                                                  fontWeight: 700,
                                                  padding: '2px 6px',
                                                  borderRadius: '4px',
                                                  border: '1px solid',
                                                  borderColor:
                                                    task.type === 'weakness'
                                                      ? '#FCD34D'
                                                      : task.type === 'diagnostic'
                                                      ? '#C4B5FD'
                                                      : '#CBD5E1',
                                                  backgroundColor:
                                                    task.type === 'weakness'
                                                      ? '#FEF3C7'
                                                      : task.type === 'diagnostic'
                                                      ? '#EDE9FE'
                                                      : '#F1F5F9',
                                                  color:
                                                    task.type === 'weakness'
                                                      ? '#92400E'
                                                      : task.type === 'diagnostic'
                                                      ? '#5B21B6'
                                                      : '#334155',
                                                }}
                                              >
                                                <option value="core">基本ルート</option>
                                                <option value="weakness">弱点補強</option>
                                                <option value="diagnostic">レベル診断</option>
                                              </select>

                                              <input
                                                type="text"
                                                value={task.title}
                                                onChange={(e) =>
                                                  updateTaskField(pIdx, cIdx, tIdx, {
                                                    title: e.target.value,
                                                  })
                                                }
                                                style={{
                                                  flex: 1,
                                                  fontSize: '0.88rem',
                                                  fontWeight: 600,
                                                  color: done ? '#94A3B8' : '#0F172A',
                                                  textDecoration: done ? 'line-through' : 'none',
                                                  border: '1px solid transparent',
                                                  backgroundColor: 'transparent',
                                                  padding: '2px 4px',
                                                  minWidth: '160px',
                                                }}
                                              />
                                            </div>

                                            {/* Linked Content Preview & Delete */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              {primaryUnit ? (
                                                <>
                                                  {primaryUnit.material && (
                                                    <a
                                                      href={`/materials/${encodeURIComponent(
                                                        primaryUnit.material.id
                                                      )}`}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      style={{
                                                        fontSize: '0.73rem',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        backgroundColor: '#E0F2FE',
                                                        color: '#0369A1',
                                                        textDecoration: 'none',
                                                        fontWeight: 600,
                                                      }}
                                                      title={`一致単元: ${primaryUnit.smallName}`}
                                                    >
                                                      📖 {primaryUnit.unitCode || 'テキスト'}
                                                    </a>
                                                  )}
                                                  {primaryUnit.tests.all.length > 0 && (
                                                    <a
                                                      href={`/tests/${encodeURIComponent(
                                                        (primaryUnit.tests.l1 || primaryUnit.tests.all[0]).id
                                                      )}`}
                                                      target="_blank"
                                                      rel="noreferrer"
                                                      style={{
                                                        fontSize: '0.73rem',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        backgroundColor: '#ECFDF5',
                                                        color: '#047857',
                                                        textDecoration: 'none',
                                                        fontWeight: 600,
                                                      }}
                                                    >
                                                      📝 テスト({primaryUnit.tests.all.length})
                                                    </a>
                                                  )}
                                                  {!primaryUnit.material && primaryUnit.tests.all.length === 0 && (
                                                    <span
                                                      style={{
                                                        fontSize: '0.72rem',
                                                        color: '#64748B',
                                                        backgroundColor: '#F1F5F9',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                      }}
                                                    >
                                                      AI講義連携 ({primaryUnit.unitCode || '標準'})
                                                    </span>
                                                  )}
                                                </>
                                              ) : (
                                                task.type !== 'diagnostic' && (
                                                  <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                                    AI講義対応
                                                  </span>
                                                )
                                              )}

                                              <button
                                                onClick={() => removeTask(pIdx, cIdx, tIdx)}
                                                title="このタスクを削除"
                                                style={{
                                                  border: 'none',
                                                  backgroundColor: 'transparent',
                                                  color: '#94A3B8',
                                                  cursor: 'pointer',
                                                  fontSize: '0.85rem',
                                                  padding: '2px 5px',
                                                }}
                                              >
                                                ✕
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                </div>
                              );
                            })}

                            {/* Add New Category to Phase */}
                            {addingCategoryPhaseIdx === pIdx ? (
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                <input
                                  type="text"
                                  placeholder="カテゴリ名（例: 🔬 化学, 📐 数学IIBC）"
                                  value={newCategoryName}
                                  onChange={(e) => setNewCategoryName(e.target.value)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.84rem',
                                    width: '260px',
                                  }}
                                />
                                <button
                                  onClick={() => handleAddCategoryToPhase(pIdx)}
                                  style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#1E3A5F',
                                    color: '#FFFFFF',
                                    fontWeight: 600,
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  科目追加
                                </button>
                                <button
                                  onClick={() => setAddingCategoryPhaseIdx(null)}
                                  style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer',
                                  }}
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <div>
                                <button
                                  onClick={() => {
                                    setAddingCategoryPhaseIdx(pIdx);
                                    setNewCategoryName('');
                                  }}
                                  style={{
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    border: '1px dashed #94A3B8',
                                    backgroundColor: '#F8FAFC',
                                    color: '#475569',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ＋ このPhaseに科目カテゴリを追加
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* FeedbackQueue & PersonalizedCurriculum Accordion */}
              {(selectedUser.feedbackQueue.length > 0 || selectedUser.personalizedCurriculum) && (
                <div
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setShowExtraAccordion((v) => !v)}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: '#F8FAFC',
                      border: 'none',
                      cursor: 'pointer',
                      fontWeight: 700,
                      color: '#1E3A5F',
                      fontSize: '0.92rem',
                    }}
                  >
                    <span>
                      🔍 弱点補強キュー（{selectedUser.feedbackQueue.length}件）・在籍校別最適化データ
                    </span>
                    <span>{showExtraAccordion ? '▲ 閉じる' : '▼ 開く'}</span>
                  </button>

                  {showExtraAccordion && (
                    <div style={{ padding: '16px 18px', display: 'grid', gap: '16px' }}>
                      {selectedUser.feedbackQueue.length > 0 && (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '8px', color: '#B45309' }}>
                            📌 テスト・ドリル結果から自動登録された重点復習キュー
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {selectedUser.feedbackQueue.map((fq, idx) => (
                              <div
                                key={fq.id || idx}
                                style={{
                                  padding: '8px 12px',
                                  borderRadius: '6px',
                                  backgroundColor: '#FFFBEB',
                                  border: '1px solid #FDE68A',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  fontSize: '0.84rem',
                                }}
                              >
                                <span>
                                  <strong>[{fq.subject}]</strong> {fq.topic}
                                  {fq.unitCode ? ` (${fq.unitCode})` : ''}
                                </span>
                                <span style={{ color: '#92400E', fontWeight: 600 }}>
                                  正答率 {fq.scorePercent ?? '-'}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedUser.personalizedCurriculum && (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px', color: '#1E3A5F' }}>
                            🏫 在籍校別カリキュラム調査・最適化データ
                          </div>
                          <pre
                            style={{
                              backgroundColor: '#F8FAFC',
                              padding: '12px',
                              borderRadius: '8px',
                              border: '1px solid #E2E8F0',
                              fontSize: '0.78rem',
                              overflowX: 'auto',
                              margin: 0,
                            }}
                          >
                            {JSON.stringify(selectedUser.personalizedCurriculum, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '40px',
                textAlign: 'center',
                color: '#64748B',
              }}
            >
              左のリストから利用者を選択してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
