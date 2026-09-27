'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type SavedNote = {
  id: string;
  title: string;
  content: string;
  date: string;
};

type UserProfile = {
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
  lastGradeUpdateAcademicYear?: number;
  needsProfileUpdate?: boolean;
};

type UserContextType = {
  profile: UserProfile;
  setProfile: (p: UserProfile) => void;
  saveNote: (title: string, content: string) => void;
  deleteNote: (id: string) => void;
};

const defaultProfile: UserProfile = {
  name: 'ゲスト',
  targetSchools: ['未設定 (プロフィールから設定)'],
  weakSubjects: [],
  savedNotes: [],
  tutorPersona: '優しいお姉さん',
  currentMood: '普通',
  completedTasks: [],
};

const UserContext = createContext<UserContextType>({
  profile: defaultProfile,
  setProfile: () => {},
  saveNote: () => {},
  deleteNote: () => {},
});

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [profile, setProfileState] = useState<UserProfile>(defaultProfile);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
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
        
        // --- 学年自動進級ロジック ---
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth() + 1;
        const currentAcademicYear = currentMonth >= 4 ? currentYear : currentYear - 1;

        if (parsed.grade && parsed.lastGradeUpdateAcademicYear) {
          const diff = currentAcademicYear - parsed.lastGradeUpdateAcademicYear;
          if (diff > 0) {
            if (parsed.grade === 3) {
              // 3年生が進級のタイミングを迎えた場合はアラートフラグを立てる
              parsed.needsProfileUpdate = true;
            } else {
              // 1年生や2年生なら自動進級
              parsed.grade += diff;
              if (parsed.grade > 3) {
                parsed.grade = 3;
                parsed.needsProfileUpdate = true;
              }
              parsed.lastGradeUpdateAcademicYear = currentAcademicYear;
            }
            // localStorageも更新しておく
            localStorage.setItem('ai_tutor_profile', JSON.stringify(parsed));
          }
        }

        setProfileState(parsed);
      } catch (e) {
        console.error(e);
      }
    }
    setIsLoaded(true);
  }, []);

  const setProfile = (newProfile: UserProfile) => {
    // Ensure properties exist on legacy profiles
    if (!newProfile.savedNotes) newProfile.savedNotes = [];
    if (!newProfile.targetSchools) newProfile.targetSchools = ['未設定 (プロフィールから設定)'];
    if (!newProfile.tutorPersona) newProfile.tutorPersona = '優しいお姉さん';
    if (!newProfile.currentMood) newProfile.currentMood = '普通';
    if (!newProfile.completedTasks) newProfile.completedTasks = [];
    setProfileState(newProfile);
    localStorage.setItem('ai_tutor_profile', JSON.stringify(newProfile));
  };

  const saveNote = (title: string, content: string) => {
    const newNote = {
      id: Date.now().toString(),
      title,
      content,
      date: new Date().toLocaleDateString('ja-JP'),
    };
    const updatedProfile = {
      ...profile,
      savedNotes: [newNote, ...(profile.savedNotes || [])],
    };
    setProfile(updatedProfile);
  };

  const deleteNote = (id: string) => {
    const updatedProfile = {
      ...profile,
      savedNotes: (profile.savedNotes || []).filter(note => note.id !== id),
    };
    setProfile(updatedProfile);
  };

  if (!isLoaded) return null; // Avoid hydration mismatch

  return (
    <UserContext.Provider value={{ profile, setProfile, saveNote, deleteNote }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
