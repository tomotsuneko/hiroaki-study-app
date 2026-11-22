import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { requireAdminSession } from '@/lib/session';
import { checkAccountPeriod } from '@/lib/auth-util';
import { getServerCache, setServerCache } from '@/lib/server-cache';
import { readDB, writeDB, SyllabusPhase } from '@/lib/db';
import { genAI } from '@/lib/gemini';
import { getActiveModels } from '@/lib/model-manager';

export const maxDuration = 60;

async function fetchMasterCatalogData() {
  if (!dbAdmin) {
    return { masterDb: [] as any[], materials: [] as any[], tests: [] as any[] };
  }

  let masterDb = getServerCache<any[]>('master_db');
  let materials = getServerCache<any[]>('materials_list');
  let tests = getServerCache<any[]>('tests_list');

  const tasks: Promise<void>[] = [];

  if (!masterDb) {
    tasks.push(
      dbAdmin
        .collection('curriculum_db')
        .get()
        .then((snap) => {
          const arr: any[] = [];
          snap.forEach((doc: any) => arr.push({ id: doc.id, ...doc.data() }));
          setServerCache('master_db', arr);
          masterDb = arr;
        })
    );
  }

  if (!materials) {
    tasks.push(
      dbAdmin
        .collection('learning_materials')
        .select('title', 'contentTitle', 'subject', 'importedAt', 'versions')
        .get()
        .then((snap) => {
          const arr = snap.docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              title: d.title,
              contentTitle: d.contentTitle || '',
              subject: d.subject || '未分類',
              importedAt: d.importedAt,
              versions: (d.versions || []).map((v: any) => ({ importedAt: v.importedAt })),
            };
          });
          setServerCache('materials_list', arr);
          materials = arr;
        })
    );
  }

  if (!tests) {
    tasks.push(
      dbAdmin
        .collection('test_materials')
        .select('title', 'contentTitle', 'subject', 'importedAt', 'versions')
        .get()
        .then((snap) => {
          const arr = snap.docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              title: d.title,
              contentTitle: d.contentTitle || '',
              subject: d.subject || '未分類',
              importedAt: d.importedAt,
              versions: (d.versions || []).map((v: any) => ({ importedAt: v.importedAt })),
            };
          });
          setServerCache('tests_list', arr);
          tests = arr;
        })
    );
  }

  if (tasks.length > 0) {
    await Promise.all(tasks);
  }

  return {
    masterDb: masterDb || [],
    materials: materials || [],
    tests: tests || [],
  };
}

function buildFallbackSyllabus(profile: any, filteredCurriculum: any[]): SyllabusPhase[] {
  const grade = profile?.grade || 2;
  const schoolTypeStr = profile?.schoolType === 'junior_high' ? '中' : '高';
  const weakSubjects: string[] = Array.isArray(profile?.weakSubjects) ? profile.weakSubjects : [];
  const hasDeviation = typeof profile?.deviationScore === 'number' && profile.deviationScore > 0;
  const targetSchool =
    Array.isArray(profile?.targetSchools) && profile.targetSchools.length > 0
      ? profile.targetSchools[0]
      : '志望校合格';

  const subjectIcons: Record<string, string> = {
    英語: '📘',
    数学: '📐',
    国語: '📖',
    理科: '🔬',
    社会: '🌏',
    情報: '💻',
  };

  const phasesMeta = [
    {
      phase: 'Phase 1',
      title: '基礎基盤確立期',
      period: `${schoolTypeStr}${grade} 基礎完成`,
      targetMilestone: `${targetSchool}に向けた基礎・基本事項の完全網羅`,
    },
    {
      phase: 'Phase 2',
      title: '標準演習展開期',
      period: `${schoolTypeStr}${grade} 実力養成`,
      targetMilestone: `入試標準レベル問題の攻略と弱点分野の克服`,
    },
    {
      phase: 'Phase 3',
      title: '実践力完成・過去問期',
      period: `${schoolTypeStr}${grade} 直前突破`,
      targetMilestone: `${targetSchool}レベルの得点力定着と実戦演習`,
    },
  ];

  const pickedSubjects = filteredCurriculum.slice(0, 4);
  if (pickedSubjects.length === 0) {
    return phasesMeta.map((meta, pIdx) => ({
      ...meta,
      categories: [
        {
          name: '📘 英語',
          tasks:
            pIdx === 0 && !hasDeviation
              ? [{ id: `diag_eng_1`, title: '【学力レベル診断】現在の基礎力チェックテスト', type: 'diagnostic' }]
              : [{ id: `eng_core_${pIdx + 1}`, title: '文法・構文の基礎演習', type: 'core' }],
        },
        {
          name: '📐 数学',
          tasks: [{ id: `math_core_${pIdx + 1}`, title: '計算・基本定理の確認', type: 'core' }],
        },
      ],
    }));
  }

  return phasesMeta.map((meta, pIdx) => {
    const categories = pickedSubjects.map((subj: any) => {
      const sName = (subj.subjectName || subj.id || '科目').replace(/^(high_school_|junior_high_)/, '');
      const icon = Object.entries(subjectIcons).find(([k]) => sName.includes(k))?.[1] || '📚';
      const isWeak = weakSubjects.some((w) => sName.includes(w) || w.includes(sName));

      const allSmallItems: string[] = [];
      for (const lc of subj.largeCategories || []) {
        for (const mc of lc.mediumCategories || []) {
          for (const sc of mc.smallCategories || []) {
            if (typeof sc === 'string' && sc.trim()) {
              allSmallItems.push(sc.trim());
            }
          }
        }
      }

      const sliceStart = Math.floor((allSmallItems.length * pIdx) / 3);
      const sliceItems = allSmallItems.slice(sliceStart, sliceStart + 4);
      const tasks: SyllabusPhase['categories'][0]['tasks'] = [];

      if (pIdx === 0 && !hasDeviation) {
        tasks.push({
          id: `diag_${sName}_${Date.now()}_${pIdx}`,
          title: '【学力レベル診断】現在の基礎力チェックテスト',
          type: 'diagnostic',
        });
      }

      sliceItems.forEach((itemTitle, idx) => {
        tasks.push({
          id: `${sName}_${pIdx}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
          title: itemTitle,
          type: isWeak && idx % 2 === 1 ? 'weakness' : 'core',
        });
      });

      if (tasks.length === 0) {
        tasks.push({
          id: `${sName}_fallback_${pIdx}`,
          title: `${sName} 総合演習`,
          type: isWeak ? 'weakness' : 'core',
        });
      }

      return {
        name: `${icon} ${sName}`,
        tasks,
      };
    });

    return {
      ...meta,
      categories,
    };
  });
}

export async function GET() {
  try {
    const adminSession = await requireAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const [usersSnapshot, masterCatalog] = await Promise.all([
      dbAdmin.collection('users').get(),
      fetchMasterCatalogData(),
    ]);

    const users: any[] = [];

    usersSnapshot.forEach((doc: any) => {
      const data = doc.data() || {};
      const dbData = data.db || {};
      const profile = dbData.profile || {};
      const syllabus: SyllabusPhase[] = Array.isArray(dbData.syllabus) ? dbData.syllabus : [];
      const completedTasks: string[] = Array.isArray(profile.completedTasks) ? profile.completedTasks : [];
      const masteredUnits: string[] = Array.isArray(dbData.masteredUnits) ? dbData.masteredUnits : [];
      const materialViews: Record<string, any> = dbData.materialViews || {};
      const feedbackQueue: any[] = Array.isArray(dbData.feedbackQueue) ? dbData.feedbackQueue : [];

      let currentStatus = data.status || 'active';
      if (currentStatus === 'active' && data.validUntil) {
        const periodCheck = checkAccountPeriod(data.validFrom, data.validUntil);
        if (!periodCheck.isValid) {
          currentStatus = periodCheck.reason === 'expired' ? 'expired' : 'pending';
        }
      }

      const completedSet = new Set<string>([
        ...completedTasks,
        ...masteredUnits,
        ...Object.values(materialViews)
          .filter((v: any) => v?.completed && v?.title)
          .map((v: any) => v.title),
      ]);

      let totalTasks = 0;
      let completedTasksCount = 0;
      for (const phase of syllabus) {
        for (const cat of phase.categories || []) {
          for (const t of cat.tasks || []) {
            totalTasks++;
            if (completedSet.has(t.title) || (t.id && completedSet.has(t.id))) {
              completedTasksCount++;
            }
          }
        }
      }

      const progressPercent = totalTasks > 0 ? Math.round((completedTasksCount / totalTasks) * 100) : 0;

      users.push({
        id: doc.id,
        userId: doc.id,
        name: data.name || profile.name || doc.id,
        email: data.email || profile.email || '',
        role: data.role || (doc.id === 'admin' ? 'admin' : 'student'),
        status: currentStatus,
        createdAt: data.createdAt || '',
        lastLoginAt: data.lastLoginAt || '',
        profile: {
          name: profile.name || data.name || doc.id,
          schoolType: profile.schoolType || 'high',
          schoolName: profile.schoolName || '',
          department: profile.department || '',
          grade: profile.grade || 2,
          track: profile.track || 'undecided',
          selectedSubjects: Array.isArray(profile.selectedSubjects) ? profile.selectedSubjects : [],
          targetSchools: Array.isArray(profile.targetSchools) ? profile.targetSchools : [],
          weakSubjects: Array.isArray(profile.weakSubjects) ? profile.weakSubjects : [],
          deviationScore: typeof profile.deviationScore === 'number' ? profile.deviationScore : null,
          completedTasks,
        },
        syllabus,
        syllabusUpdatedAt: dbData.syllabusUpdatedAt || null,
        syllabusRebalanceAlert: dbData.syllabusRebalanceAlert || null,
        personalizedCurriculum: dbData.personalizedCurriculum || null,
        masteredUnits,
        materialViewsCount: Object.keys(materialViews).length,
        feedbackQueue,
        totalTasks,
        completedTasksCount,
        progressPercent,
      });
    });

    users.sort((a, b) => {
      if (a.role === 'student' && b.role !== 'student') return -1;
      if (a.role !== 'student' && b.role === 'student') return 1;
      if (a.syllabus.length > 0 && b.syllabus.length === 0) return -1;
      if (a.syllabus.length === 0 && b.syllabus.length > 0) return 1;
      return (b.lastLoginAt || b.createdAt || '').localeCompare(a.lastLoginAt || a.createdAt || '');
    });

    return NextResponse.json({
      success: true,
      users,
      masterDb: masterCatalog.masterDb,
      materials: masterCatalog.materials,
      tests: masterCatalog.tests,
    });
  } catch (error: any) {
    console.error('Admin Syllabus GET Error:', error);
    return NextResponse.json({ error: 'シラバス管理データの取得に失敗しました。' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const adminSession = await requireAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const body = await req.json();
    const { action, userId } = body;

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: '対象ユーザーIDが指定されていません。' }, { status: 400 });
    }

    const userDocRef = dbAdmin.collection('users').doc(userId);
    const userDoc = await userDocRef.get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: '指定されたユーザーが見つかりません。' }, { status: 404 });
    }

    const dbData = await readDB(userId);
    const existingProfile = dbData.profile || {};

    if (action === 'toggle_task') {
      const { taskTitle, taskId, completed } = body;
      const targetName = typeof taskTitle === 'string' ? taskTitle.trim() : '';
      if (!targetName) {
        return NextResponse.json({ error: 'タスク名が指定されていません。' }, { status: 400 });
      }

      const currentCompleted: string[] = Array.isArray(existingProfile.completedTasks)
        ? [...existingProfile.completedTasks]
        : [];

      let nextCompleted: string[];
      if (completed) {
        nextCompleted = Array.from(new Set([...currentCompleted, targetName]));
      } else {
        nextCompleted = currentCompleted.filter((item) => item !== targetName && item !== taskId);
      }

      dbData.profile = {
        ...existingProfile,
        completedTasks: nextCompleted,
        updatedAt: new Date().toISOString(),
      };
      if (!completed && Array.isArray(dbData.masteredUnits)) {
        dbData.masteredUnits = dbData.masteredUnits.filter((u) => u !== targetName && u !== taskId);
      }

      await writeDB(dbData, userId);

      return NextResponse.json({
        success: true,
        completedTasks: nextCompleted,
        masteredUnits: dbData.masteredUnits || [],
      });
    }

    if (action === 'save_syllabus') {
      const { syllabus, completedTasks, profileOverrides } = body;

      if (profileOverrides && typeof profileOverrides === 'object') {
        dbData.profile = {
          ...existingProfile,
          ...profileOverrides,
          updatedAt: new Date().toISOString(),
        };
      }

      if (Array.isArray(completedTasks)) {
        dbData.profile = {
          ...(dbData.profile || existingProfile),
          completedTasks: Array.from(new Set(completedTasks)),
          updatedAt: new Date().toISOString(),
        };
      }

      if (Array.isArray(syllabus)) {
        dbData.syllabus = syllabus;
        dbData.syllabusUpdatedAt = new Date().toISOString();
      }

      await writeDB(dbData, userId);

      return NextResponse.json({
        success: true,
        syllabus: dbData.syllabus || [],
        syllabusUpdatedAt: dbData.syllabusUpdatedAt || null,
        profile: dbData.profile,
      });
    }

    if (action === 'generate') {
      const { profileOverrides, reason } = body;
      const mergedProfile = {
        ...existingProfile,
        ...(profileOverrides || {}),
      };

      const { masterDb } = await fetchMasterCatalogData();
      const targetLevel = mergedProfile.schoolType === 'junior_high' ? 'junior_high' : 'high_school';
      const selectedSubjectsList: string[] = Array.isArray(mergedProfile.selectedSubjects)
        ? mergedProfile.selectedSubjects
        : [];

      let filteredCurriculum = masterDb.filter((s: any) => s.level === targetLevel);
      if (selectedSubjectsList.length > 0) {
        const subFiltered = filteredCurriculum.filter((s: any) =>
          selectedSubjectsList.some(
            (sel) =>
              s.subjectName?.includes(sel) || s.id?.includes(sel) || sel.includes(s.subjectName || '')
          )
        );
        if (subFiltered.length > 0) {
          filteredCurriculum = subFiltered;
        }
      }
      if (filteredCurriculum.length === 0) {
        filteredCurriculum = masterDb.filter((s: any) => s.level === targetLevel);
      }

      const userName = mergedProfile.name || userDoc.data()?.name || userId;
      const targetSchools =
        Array.isArray(mergedProfile.targetSchools) && mergedProfile.targetSchools.length > 0
          ? mergedProfile.targetSchools.join('、')
          : '志望校未設定';
      const weakSubjects =
        Array.isArray(mergedProfile.weakSubjects) && mergedProfile.weakSubjects.length > 0
          ? mergedProfile.weakSubjects.join('、')
          : '特になし';
      const schoolTypeStr = mergedProfile.schoolType === 'junior_high' ? '中学' : '高校';
      const grade = mergedProfile.grade || 2;
      const gradeStr = `${grade}年生`;
      const trackStr =
        mergedProfile.track === 'arts' ? '（文系）' : mergedProfile.track === 'science' ? '（理系）' : '';
      const selectedSubjectsStr =
        selectedSubjectsList.length > 0 ? selectedSubjectsList.join('、') : '主要科目全般';
      const deviationScore = mergedProfile.deviationScore;
      const isLevelClear = typeof deviationScore === 'number' && deviationScore > 0;
      const completedTasks: string[] = Array.isArray(mergedProfile.completedTasks)
        ? mergedProfile.completedTasks
        : [];

      const levelGuidance = isLevelClear
        ? `【生徒の現在地データ】現在偏差値：約 ${deviationScore}。目標校（${targetSchools}）とのギャップを分析してステップを構築してください。`
        : `【生徒の現在地データ（未診断）】Phase 1 の各科目冒頭に「【学力レベル診断】現在の基礎力チェックテスト」（type: "diagnostic"）を含め、基礎基本から無理なく立ち上げられるルートを構築してください。`;

      const systemInstruction = `あなたは超一流の進学予備校の教務統括ディレクターです。
生徒情報：
・生徒名：「${userName}」、${schoolTypeStr}${gradeStr}${trackStr}
・在籍校：「${mergedProfile.schoolName || '未設定'}」
・第一志望・目標校：「${targetSchools}」
・苦手科目：「${weakSubjects}」
・学習希望科目：「${selectedSubjectsStr}」
・既完了タスク（参考）：${completedTasks.slice(-10).join('、') || 'なし'}

${levelGuidance}

【マスターカリキュラムDB】
${JSON.stringify(filteredCurriculum)}

【個人最適化データ】
${userDoc.data()?.db?.personalizedCurriculum ? JSON.stringify(userDoc.data()?.db?.personalizedCurriculum) : 'なし'}

【設計の絶対条件（厳守）】
1. 出力するタスクの title には、提供した【マスターカリキュラムDB】内の smallCategories にある文字列をそのまま使用すること（※レベル診断タスクのみ例外として「【学力レベル診断】現在の基礎力チェックテスト」を使用可）。
2. Phase 1、Phase 2、Phase 3 の3段階構成で、1フェーズ・1科目あたり3〜5個の無理のない分量に厳選すること。
3. 各Phaseには "phase", "title", "period", "targetMilestone", "categories": [{ "name": "📘 英語", "tasks": [{ "id", "title", "type": "core" | "weakness" | "diagnostic" }] }] を含めること。
4. 必ず有効なJSON配列のみを出力し、マークダウン記法(\`\`\`json等)は含めないこと。`;

      let syllabusData: SyllabusPhase[] | null = null;
      const modelsToTry = await getActiveModels('syllabus');

      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
          });
          const promptMsg = reason
            ? `管理者指示（理由: ${reason}）に基づき、生徒「${userName}」の最新プロフィール・目標校「${targetSchools}」に応じた逆算学習シラバスを構築してください。`
            : `生徒「${userName}」の最新プロフィール・目標校「${targetSchools}」合格に向けた、無理のない逆算学習シラバスを構築してください。`;

          const result = await model.generateContent(promptMsg);
          const rawText = result.response
            .text()
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed) && parsed.length > 0) {
            syllabusData = parsed;
            break;
          }
        } catch (err: any) {
          console.warn(`Admin Syllabus generate model ${modelName} failed:`, err?.message || err);
        }
      }

      if (!syllabusData) {
        syllabusData = buildFallbackSyllabus(mergedProfile, filteredCurriculum);
      }

      const nowIso = new Date().toISOString();
      dbData.profile = {
        ...mergedProfile,
        updatedAt: nowIso,
      };
      dbData.syllabus = syllabusData;
      dbData.syllabusUpdatedAt = nowIso;
      dbData.syllabusRebalanceAlert = {
        reason: reason || 'admin_update',
        message: '管理者により目標・現在地に合わせた最新シラバスが構築・配信されました。',
        timestamp: nowIso,
      };

      await writeDB(dbData, userId);

      return NextResponse.json({
        success: true,
        syllabus: syllabusData,
        syllabusUpdatedAt: nowIso,
        profile: dbData.profile,
      });
    }

    return NextResponse.json({ error: '不正なアクションです。' }, { status: 400 });
  } catch (error: any) {
    console.error('Admin Syllabus POST Error:', error);
    return NextResponse.json(
      { error: 'シラバス更新処理中にエラーが発生しました: ' + (error?.message || '') },
      { status: 500 }
    );
  }
}
