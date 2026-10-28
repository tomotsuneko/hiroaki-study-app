'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  buildUnifiedCatalog,
  CurriculumSubject,
  ContentItem,
  TestRecordSummary,
  UnifiedUnit,
  UnifiedSubjectCatalog,
} from './content-slots';
import type { SyllabusPhase, DayPlan, MaterialViewRecord, FeedbackQueueItem } from './db';

export type SavedNote = {
  id: string;
  title: string;
  content: string;
  date: string;
};

export type UserProfile = {
  name: string;
  targetSchools: string[];
  weakSubjects: string[];
  savedNotes: SavedNote[];
  tutorPersona?: string;
  currentMood?: string;
  completedTasks?: string[];

  schoolType?: 'junior_high' | 'high';
  schoolName?: string;
  department?: string;
  grade?: number;
  track?: 'arts' | 'science' | 'undecided';
  selectedSubjects?: string[];
  lastGradeUpdateAcademicYear?: number;
  needsProfileUpdate?: boolean;

  // 逆算シラバス & レベル判定・自動組み換え用
  deviationScore?: number;
  levelCheckCompleted?: boolean;
  levelCheckResult?: {
    score: number;
    level: string;
    evaluatedAt: string;
    recommendedFocus: string;
  };
  syllabusRebalanceAlert?: {
    reason: string;
    message: string;
    timestamp: string;
  } | null;
};

export type SharedStudyData = {
  curriculum: CurriculumSubject[];
  materials: ContentItem[];
  tests: ContentItem[];
  userRecords: Record<string, TestRecordSummary>;
  testSummary: {
    totalTestsTaken: number;
    completedTestsCount: number;
    totalAnswered: number;
    totalCorrect: number;
    totalFirstCorrect: number;
    overallAccuracy: number;
  };
  dailyAnalysis: any;
  recentLogs: any[];
  studyTime: Record<string, number>;
  syllabus: SyllabusPhase[];
  syllabusUpdatedAt: string | null;
  syllabusRebalanceAlert: { reason: string; message: string; timestamp: string } | null;
  dayPlans: Record<string, DayPlan>;
  materialViews: Record<string, MaterialViewRecord>;
  feedbackQueue: FeedbackQueueItem[];
  masteredUnits: string[];
  flashcards: any[];
};

type UserContextType = {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  saveNote: (title: string, content: string) => void;
  deleteNote: (id: string) => void;
  clearRebalanceAlert: () => void;
  // Shared high-speed cached study data & unified catalog
  studyData: SharedStudyData;
  catalog: {
    units: UnifiedUnit[];
    subjects: UnifiedSubjectCatalog[];
  };
  isDataReady: boolean;
  refreshStudyData: (force?: boolean) => Promise<void>;
  updateLocalSyllabus: (syllabus: SyllabusPhase[], alert?: any) => void;
  updateLocalDailyAnalysis: (analysis: any) => void;
  updateLocalDayPlan: (plan: DayPlan) => void;
  recordMaterialStudy: (params: {
    unitCode: string;
    title: string;
    subject: string;
    completed?: boolean;
    minutes?: number;
  }) => Promise<void>;
  recordPomodoroTime: (minutes: number, task?: string) => Promise<void>;
};

const defaultProfile: UserProfile = {
  name: 'ゲスト',
  targetSchools: ['未設定 (プロフィールから設定)'],
  weakSubjects: [],
  savedNotes: [],
  tutorPersona: '優しいお姉さん',
  currentMood: '普通',
  completedTasks: [],
  deviationScore: undefined,
  levelCheckCompleted: false,
  syllabusRebalanceAlert: null,
};

const defaultStudyData: SharedStudyData = {
  curriculum: [],
  materials: [],
  tests: [],
  userRecords: {},
  testSummary: {
    totalTestsTaken: 0,
    completedTestsCount: 0,
    totalAnswered: 0,
    totalCorrect: 0,
    totalFirstCorrect: 0,
    overallAccuracy: 0,
  },
  dailyAnalysis: null,
  recentLogs: [],
  studyTime: {},
  syllabus: [],
  syllabusUpdatedAt: null,
  syllabusRebalanceAlert: null,
  dayPlans: {},
  materialViews: {},
  feedbackQueue: [],
  masteredUnits: [],
  flashcards: [],
};

const STUDY_CACHE_KEY = 'ai_tutor_study_cache_v2';

const UserContext = createContext<UserContextType>({
  profile: defaultProfile,
  setProfile: () => {},
  saveNote: () => {},
  deleteNote: () => {},
  clearRebalanceAlert: () => {},
  studyData: defaultStudyData,
  catalog: { units: [], subjects: [] },
  isDataReady: false,
  refreshStudyData: async () => {},
  updateLocalSyllabus: () => {},
  updateLocalDailyAnalysis: () => {},
  updateLocalDayPlan: () => {},
  recordMaterialStudy: async () => {},
  recordPomodoroTime: async () => {},
});

function getTodayJST(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-');
}

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfileState] = useState<UserProfile>(defaultProfile);
  const [studyData, setStudyData] = useState<SharedStudyData>(defaultStudyData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const dailyCronTriggeredRef = useRef(false);

  // Sync profile to cloud in background
  const syncProfileToCloud = useCallback((p: UserProfile) => {
    fetch('/api/db/daily', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'saveProfile', data: p }),
    }).catch((err) => console.warn('Cloud profile sync warning:', err));
  }, []);

  // Save studyData snapshot to localStorage for 0ms instant boot on reload/navigation
  const persistStudyCache = useCallback((nextData: SharedStudyData) => {
    try {
      localStorage.setItem(STUDY_CACHE_KEY, JSON.stringify(nextData));
    } catch (e) {
      // Ignore storage quota errors
    }
  }, []);

  // Fetch unified bootstrap data (Stale-While-Revalidate)
  const refreshStudyData = useCallback(
    async (force = false) => {
      try {
        const res = await fetch(`/api/user/bootstrap${force ? '?refresh=1' : ''}`);
        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (errData.accountStatus === 'expired' || errData.accountStatus === 'suspended') {
            try {
              localStorage.removeItem(STUDY_CACHE_KEY);
              localStorage.removeItem('ai_tutor_profile');
            } catch (_) {}
            window.location.href = `/login?error=${encodeURIComponent(errData.error || '利用権限がありません')}`;
            return;
          }
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        const recMap: Record<string, TestRecordSummary> = {};
        const rawResults = data.testSummary?.results || [];
        if (Array.isArray(rawResults)) {
          rawResults.forEach((r: any) => {
            if (r.testId) recMap[r.testId] = r;
          });
        }

        const nextStudyData: SharedStudyData = {
          curriculum: Array.isArray(data.masterDb) ? data.masterDb : [],
          materials: Array.isArray(data.materials) ? data.materials : [],
          tests: Array.isArray(data.tests) ? data.tests : [],
          userRecords: recMap,
          testSummary: {
            totalTestsTaken: data.testSummary?.totalTestsTaken || 0,
            completedTestsCount: data.testSummary?.completedTestsCount || 0,
            totalAnswered: data.testSummary?.totalAnswered || 0,
            totalCorrect: data.testSummary?.totalCorrect || 0,
            totalFirstCorrect: data.testSummary?.totalFirstCorrect || 0,
            overallAccuracy: data.testSummary?.overallAccuracy || 0,
          },
          dailyAnalysis: data.daily?.dailyAnalysis || null,
          recentLogs: data.daily?.recentLogs || [],
          studyTime: data.daily?.studyTime || {},
          syllabus: Array.isArray(data.daily?.syllabus) ? data.daily.syllabus : [],
          syllabusUpdatedAt: data.daily?.syllabusUpdatedAt || null,
          syllabusRebalanceAlert: data.daily?.syllabusRebalanceAlert || null,
          dayPlans: data.daily?.dayPlans || {},
          materialViews: data.daily?.materialViews || {},
          feedbackQueue: data.daily?.feedbackQueue || [],
          masteredUnits: data.daily?.masteredUnits || [],
          flashcards: data.daily?.flashcards || [],
        };

        setStudyData(nextStudyData);
        setIsDataReady(true);
        persistStudyCache(nextStudyData);

        // Merge cloud profile & server masteredUnits into local profile so nothing is lost across devices
        setProfileState((prev) => {
          const cloudProf = data.daily?.profile;
          const serverMastered = data.daily?.masteredUnits || [];
          const mergedCompleted = Array.from(
            new Set([
              ...(prev.completedTasks || []),
              ...(cloudProf?.completedTasks || []),
              ...serverMastered,
            ])
          );

          // If local profile is still default 'ゲスト' and cloud has a saved profile, restore from cloud
          const base =
            prev.name === 'ゲスト' && cloudProf && cloudProf.name
              ? { ...prev, ...cloudProf }
              : prev;

          const updated: UserProfile = {
            ...base,
            completedTasks: mergedCompleted,
            syllabusRebalanceAlert:
              data.daily?.syllabusRebalanceAlert ?? base.syllabusRebalanceAlert ?? null,
          };
          localStorage.setItem('ai_tutor_profile', JSON.stringify(updated));
          return updated;
        });

        // Auto-run daily batch in background if not yet run today (JST)
        const todayStr = getTodayJST();
        const lastRunIso = data.daily?.dailyAnalysis?.lastRunDate;
        const lastRunDateStr = lastRunIso ? lastRunIso.slice(0, 10) : '';
        if (lastRunDateStr !== todayStr && !dailyCronTriggeredRef.current) {
          dailyCronTriggeredRef.current = true;
          const currentLocalProf = localStorage.getItem('ai_tutor_profile');
          const parsedProf = currentLocalProf ? JSON.parse(currentLocalProf) : defaultProfile;
          fetch('/api/cron/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: parsedProf }),
          })
            .then((r) => r.json())
            .then((newDaily) => {
              if (newDaily && !newDaily.error) {
                setStudyData((prev) => {
                  const updated = { ...prev, dailyAnalysis: newDaily };
                  persistStudyCache(updated);
                  return updated;
                });
              }
            })
            .catch((e) => console.warn('Background daily batch error:', e));
        }
      } catch (e) {
        console.error('Failed to bootstrap study data:', e);
        setIsDataReady(true);
      }
    },
    [persistStudyCache]
  );

  useEffect(() => {
    // 1. Hydrate profile from localStorage immediately
    const saved = localStorage.getItem('ai_tutor_profile');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.targetSchool && !parsed.targetSchools) {
          parsed.targetSchools = [parsed.targetSchool];
        }
        if (!parsed.targetSchools) parsed.targetSchools = ['未設定 (プロフィールから設定)'];
        if (!parsed.savedNotes) parsed.savedNotes = [];
        if (!parsed.weakSubjects) parsed.weakSubjects = [];
        if (!parsed.tutorPersona) parsed.tutorPersona = '優しいお姉さん';
        if (!parsed.currentMood) parsed.currentMood = '普通';
        if (!parsed.completedTasks) parsed.completedTasks = [];

        // 学年自動進級ロジック
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentAcademicYear = currentMonth >= 4 ? currentYear : currentYear - 1;

        if (parsed.grade && parsed.lastGradeUpdateAcademicYear) {
          const diff = currentAcademicYear - parsed.lastGradeUpdateAcademicYear;
          if (diff > 0) {
            if (parsed.grade === 3) {
              parsed.needsProfileUpdate = true;
            } else {
              parsed.grade += diff;
              if (parsed.grade > 3) {
                parsed.grade = 3;
                parsed.needsProfileUpdate = true;
              }
              parsed.lastGradeUpdateAcademicYear = currentAcademicYear;
            }
            localStorage.setItem('ai_tutor_profile', JSON.stringify(parsed));
          }
        }

        setProfileState(parsed);
      } catch (e) {
        console.error(e);
      }
    }

    // 2. Hydrate studyData from localStorage cache immediately (0ms menu rendering!)
    const cachedStudy = localStorage.getItem(STUDY_CACHE_KEY);
    if (cachedStudy) {
      try {
        const parsedCache = JSON.parse(cachedStudy);
        if (parsedCache && Array.isArray(parsedCache.curriculum)) {
          setStudyData({ ...defaultStudyData, ...parsedCache });
          setIsDataReady(true);
        }
      } catch (e) {
        // Ignore parse error
      }
    }

    setIsLoaded(true);

    // 3. Revalidate with server via unified /api/user/bootstrap
    refreshStudyData(false);
  }, [refreshStudyData]);

  const setProfile = useCallback(
    (newProfile: UserProfile) => {
      if (!newProfile.savedNotes) newProfile.savedNotes = [];
      if (!newProfile.targetSchools) newProfile.targetSchools = ['未設定 (プロフィールから設定)'];
      if (!newProfile.tutorPersona) newProfile.tutorPersona = '優しいお姉さん';
      if (!newProfile.currentMood) newProfile.currentMood = '普通';
      if (!newProfile.completedTasks) newProfile.completedTasks = [];
      setProfileState(newProfile);
      localStorage.setItem('ai_tutor_profile', JSON.stringify(newProfile));
      syncProfileToCloud(newProfile);
    },
    [syncProfileToCloud]
  );

  const saveNote = useCallback(
    (title: string, content: string) => {
      const newNote = {
        id: Date.now().toString(),
        title,
        content,
        date: new Date().toLocaleDateString('ja-JP'),
      };
      setProfileState((prev) => {
        const updatedProfile = {
          ...prev,
          savedNotes: [newNote, ...(prev.savedNotes || [])],
        };
        localStorage.setItem('ai_tutor_profile', JSON.stringify(updatedProfile));
        syncProfileToCloud(updatedProfile);
        return updatedProfile;
      });
    },
    [syncProfileToCloud]
  );

  const deleteNote = useCallback(
    (id: string) => {
      setProfileState((prev) => {
        const updatedProfile = {
          ...prev,
          savedNotes: (prev.savedNotes || []).filter((note) => note.id !== id),
        };
        localStorage.setItem('ai_tutor_profile', JSON.stringify(updatedProfile));
        syncProfileToCloud(updatedProfile);
        return updatedProfile;
      });
    },
    [syncProfileToCloud]
  );

  const clearRebalanceAlert = useCallback(() => {
    setProfileState((prev) => {
      const updatedProfile = {
        ...prev,
        syllabusRebalanceAlert: null,
      };
      localStorage.setItem('ai_tutor_profile', JSON.stringify(updatedProfile));
      syncProfileToCloud(updatedProfile);
      return updatedProfile;
    });
    setStudyData((prev) => {
      const next = { ...prev, syllabusRebalanceAlert: null };
      persistStudyCache(next);
      return next;
    });
  }, [persistStudyCache, syncProfileToCloud]);

  const updateLocalSyllabus = useCallback(
    (syllabus: SyllabusPhase[], alert?: any) => {
      setStudyData((prev) => {
        const next = {
          ...prev,
          syllabus,
          syllabusUpdatedAt: new Date().toISOString(),
          syllabusRebalanceAlert: alert !== undefined ? alert : prev.syllabusRebalanceAlert,
        };
        persistStudyCache(next);
        return next;
      });
    },
    [persistStudyCache]
  );

  const updateLocalDailyAnalysis = useCallback(
    (analysis: any) => {
      setStudyData((prev) => {
        const next = { ...prev, dailyAnalysis: analysis };
        persistStudyCache(next);
        return next;
      });
    },
    [persistStudyCache]
  );

  const updateLocalDayPlan = useCallback(
    (plan: DayPlan) => {
      setStudyData((prev) => {
        const next = {
          ...prev,
          dayPlans: { ...prev.dayPlans, [plan.date]: plan },
        };
        persistStudyCache(next);
        return next;
      });
    },
    [persistStudyCache]
  );

  const recordMaterialStudy = useCallback(
    async (params: {
      unitCode: string;
      title: string;
      subject: string;
      completed?: boolean;
      minutes?: number;
    }) => {
      const key = params.unitCode || params.title;
      const nowIso = new Date().toISOString();
      const todayStr = getTodayJST();

      // Optimistic local update
      setStudyData((prev) => {
        const existing = prev.materialViews[key];
        const nextViews = {
          ...prev.materialViews,
          [key]: {
            unitCode: key,
            title: params.title,
            subject: params.subject,
            viewCount: (existing?.viewCount || 0) + 1,
            completed: params.completed ?? existing?.completed ?? false,
            lastViewedAt: nowIso,
          },
        };
        const nextMastered =
          params.completed && !prev.masteredUnits.includes(params.title)
            ? [...prev.masteredUnits, params.title]
            : prev.masteredUnits;
        const nextStudyTime =
          params.minutes && params.minutes > 0
            ? {
                ...prev.studyTime,
                [todayStr]: (prev.studyTime[todayStr] || 0) + params.minutes,
              }
            : prev.studyTime;
        const next = {
          ...prev,
          materialViews: nextViews,
          masteredUnits: nextMastered,
          studyTime: nextStudyTime,
        };
        persistStudyCache(next);
        return next;
      });

      if (params.completed) {
        setProfileState((prev) => {
          const merged = Array.from(new Set([...(prev.completedTasks || []), params.title]));
          const updated = { ...prev, completedTasks: merged };
          localStorage.setItem('ai_tutor_profile', JSON.stringify(updated));
          return updated;
        });
      }

      try {
        await fetch('/api/db/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'materialView', data: params }),
        });
      } catch (e) {
        console.warn('Failed to persist materialView:', e);
      }
    },
    [persistStudyCache]
  );

  const recordPomodoroTime = useCallback(
    async (minutes: number, task?: string) => {
      if (minutes <= 0) return;
      const todayStr = getTodayJST();
      const nowIso = new Date().toISOString();

      setStudyData((prev) => {
        const nextStudyTime = {
          ...prev.studyTime,
          [todayStr]: (prev.studyTime[todayStr] || 0) + minutes,
        };
        const newLog = {
          id: Date.now().toString(),
          timestamp: nowIso,
          type: 'pomodoro',
          data: {
            minutes,
            task,
            message: task
              ? `【集中学習】「${task}」に${minutes}分間取り組みました！`
              : `ポモドーロタイマーで${minutes}分間集中しました！`,
          },
        };
        const next = {
          ...prev,
          studyTime: nextStudyTime,
          recentLogs: [...prev.recentLogs, newLog].slice(-25),
        };
        persistStudyCache(next);
        return next;
      });

      try {
        await fetch('/api/db/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'studyTime', data: { minutes, task } }),
        });
      } catch (e) {
        console.warn('Failed to persist pomodoro study time:', e);
      }
    },
    [persistStudyCache]
  );

  // Compute unified catalog once and share across all pages (/plan, /lesson, /drill, /flashcard, /dashboard)
  const allCompletedTasks = useMemo(() => {
    return Array.from(
      new Set([
        ...(profile.completedTasks || []),
        ...(studyData.masteredUnits || []),
        ...Object.values(studyData.materialViews || {})
          .filter((v) => v.completed)
          .map((v) => v.title),
      ])
    );
  }, [profile.completedTasks, studyData.masteredUnits, studyData.materialViews]);

  const catalog = useMemo(() => {
    return buildUnifiedCatalog(
      studyData.curriculum,
      studyData.materials,
      studyData.tests,
      studyData.userRecords,
      allCompletedTasks
    );
  }, [
    studyData.curriculum,
    studyData.materials,
    studyData.tests,
    studyData.userRecords,
    allCompletedTasks,
  ]);

  if (!isLoaded) return null; // Avoid hydration mismatch

  return (
    <UserContext.Provider
      value={{
        profile,
        setProfile,
        saveNote,
        deleteNote,
        clearRebalanceAlert,
        studyData,
        catalog,
        isDataReady,
        refreshStudyData,
        updateLocalSyllabus,
        updateLocalDailyAnalysis,
        updateLocalDayPlan,
        recordMaterialStudy,
        recordPomodoroTime,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
