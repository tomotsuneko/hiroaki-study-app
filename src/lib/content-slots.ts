/**
 * 学習コンテンツ / テストコンテンツの「枠（スロット）」生成ロジック
 *
 * カリキュラムDB（curriculum_db）の 科目 → 大分類 → 中分類 → 小分類 の階層において、
 * 大分類ごとの小分類の通し番号がコンテンツのファイル名（例: 数Ａ-001）に対応する。
 *   例) 高等学校 数学 > 数学Ａ > (小分類 1件目) ⇔ 数Ａ-001.html
 */

/** 大分類名 → コンテンツファイル名の接頭辞 */
export const CATEGORY_PREFIX_MAP: Record<string, string> = {
  // 国語
  '現代の国語': '現国',
  '言語文化': '言文',
  '論理国語': '論国',
  '文学国語': '文国',
  '古典探究': '古探',
  // 情報
  '情報Ⅰ': '情Ⅰ',
  // 数学
  '数学Ⅰ': '数Ⅰ',
  '数学Ⅱ': '数Ⅱ',
  '数学Ⅲ': '数Ⅲ',
  '数学Ａ': '数Ａ',
  '数学Ｂ': '数Ｂ',
  '数学Ｃ': '数Ｃ',
  // 理科
  '物理基礎': '物基',
  '物理': '物理',
  '化学基礎': '化基',
  '化学': '化学',
  '生物基礎': '生基',
  '生物': '生物',
  '地学基礎': '地基',
  '地学': '地学',
  // 社会
  '歴史総合': '歴総',
  '日本史探究': '日探',
  '世界史探究': '世探',
  '地理総合': '地総',
  '地理探究': '地探',
  '公共': '公共',
  '倫理': '倫理',
  '政治・経済': '政経',
  // 英語
  '英語コミュニケーションⅠ': '英Ⅰ',
  '英語コミュニケーションⅡ': '英Ⅱ',
  '英語コミュニケーションⅢ': '英Ⅲ',
  '論理・表現Ⅰ': '論Ⅰ',
  '論理・表現Ⅱ': '論Ⅱ',
  '論理・表現Ⅲ': '論Ⅲ',
};

export type ContentItem = {
  id: string;
  title: string;
  contentTitle?: string;
  subject: string;
  importedAt: string;
  versions: { importedAt: string }[];
};

export type CurriculumSubject = {
  id: string;
  subjectName?: string;
  level?: string;
  largeCategories?: {
    name: string;
    mediumCategories?: { name: string; smallCategories?: string[] }[];
  }[];
};

export type ContentSlot = {
  no: number;
  /** 想定ファイル名（接頭辞が未定義の大分類は null） */
  expectedTitle: string | null;
  mediumName: string;
  smallName: string;
  item: ContentItem | null;
  /** テスト教材のように複数レベル（L1基礎・L2標準・L3応用）が紐づく場合 */
  items: ContentItem[];
  levels: {
    l1?: ContentItem;
    l2?: ContentItem;
    l3?: ContentItem;
  };
};

export type CategorySlots = {
  name: string;
  prefix: string | null;
  slots: ContentSlot[];
  filled: number;
};

const normalizeName = (s: string) =>
  (s || '')
    .replace(/[†‡*＊]/g, '')
    .replace(/[・_\-—](基礎|標準|応用).*$/g, '')
    .replace(/\s+/g, '')
    .trim();

/** タイトル（例: 数Ⅰ-001_L1_基礎）から基本コード（例: 数Ⅰ-001）を抽出する */
export function extractBaseTitleCode(title: string): string {
  if (!title) return '';
  // "数Ⅰ-001_L1_基礎" -> "数Ⅰ-001"
  const under = title.split('_')[0];
  return under;
}

/** 接頭辞（例: 数Ⅰ, 数Ａ, 物基）から所属する科目IDを逆引きする */
export function resolveSubjectIdByTitle(title: string, curriculum: CurriculumSubject[]): string | null {
  const baseCode = extractBaseTitleCode(title);
  const prefix = baseCode.replace(/-\d+$/, '');
  for (const subj of curriculum) {
    for (const l of subj.largeCategories || []) {
      if (CATEGORY_PREFIX_MAP[l.name] === prefix) return subj.id;
    }
  }
  return null;
}

/**
 * 保存されている subject（科目ID or 旧仕様の表示名）を科目IDに正規化する。
 * 旧仕様で表示名（例: "数学"）が保存されたデータも、タイトル接頭辞から正しい科目へ割り当てる。
 */
export function normalizeSubjectId(item: ContentItem, curriculum: CurriculumSubject[]): string {
  if (curriculum.some(s => s.id === item.subject)) return item.subject;
  return resolveSubjectIdByTitle(item.title, curriculum) || item.subject;
}

/**
 * 科目のカリキュラム全体から枠を生成し、登録済みコンテンツを当てはめる。
 * テストコンテンツ等の基礎(L1)・標準(L2)・応用(L3)のマルチレベルにも対応。
 * 戻り値の `unmatched` はどの枠にも当てはまらなかったコンテンツ（取りこぼし防止）。
 */
export function buildSubjectSlots(
  subject: CurriculumSubject,
  items: ContentItem[]
): { categories: CategorySlots[]; unmatched: ContentItem[] } {
  const used = new Set<string>();

  // 1. 全大分類のスロット構造を構築
  const categories: CategorySlots[] = (subject.largeCategories || []).map(l => {
    const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
    const slots: ContentSlot[] = [];
    let no = 0;
    for (const m of l.mediumCategories || []) {
      for (const s of m.smallCategories || []) {
        no++;
        const expectedTitle = prefix ? `${prefix}-${String(no).padStart(3, '0')}` : null;
        slots.push({
          no,
          expectedTitle,
          mediumName: m.name,
          smallName: s.replace(/\s*[†‡]\s*$/, ''),
          item: null,
          items: [],
          levels: {}
        });
      }
    }
    return { name: l.name, prefix, slots, filled: 0 };
  });

  // 2. パス1: 各大分類内で、小分類名（contentTitle）の完全一致を最優先でマッチング
  // （ファイル番号のズレや欠番、末尾配置などがあっても単元名から本来の枠に自動整合させる）
  categories.forEach(cat => {
    const prefix = cat.prefix;
    const candidateItems = items.filter(it => {
      if (used.has(it.id)) return false;
      if (prefix && (it.title.startsWith(prefix) || it.id.startsWith(prefix))) return true;
      return !prefix;
    });

    cat.slots.forEach(slot => {
      if (slot.item) return;
      const sNorm = normalizeName(slot.smallName);
      if (!sNorm) return;

      const matchedList = candidateItems.filter(it =>
        !used.has(it.id) && normalizeName(it.contentTitle || '') === sNorm
      );

      if (matchedList.length > 0) {
        matchedList.forEach(it => used.add(it.id));
        slot.items.push(...matchedList);
        slot.item = matchedList[0];
      }
    });
  });

  // 3. パス2: まだ埋まっていないスロットについて、想定ファイル名（expectedTitle）でマッチング
  categories.forEach(cat => {
    cat.slots.forEach(slot => {
      if (slot.item || !slot.expectedTitle) return;

      const matchedList = items.filter(it =>
        !used.has(it.id) && (it.title === slot.expectedTitle || extractBaseTitleCode(it.title) === slot.expectedTitle)
      );

      if (matchedList.length > 0) {
        matchedList.forEach(it => used.add(it.id));
        slot.items.push(...matchedList);
        slot.item = matchedList[0];
      }
    });
  });

  // 4. パス3: まだ未マッチのアイテムについて、科目内の全スロットから contentTitle でフォールバック救済
  const remainingItems = items.filter(it => !used.has(it.id));
  if (remainingItems.length > 0) {
    categories.forEach(cat => {
      cat.slots.forEach(slot => {
        if (slot.item) return;
        const sNorm = normalizeName(slot.smallName);
        if (!sNorm) return;

        const matchedList = remainingItems.filter(it =>
          !used.has(it.id) && normalizeName(it.contentTitle || '') === sNorm
        );

        if (matchedList.length > 0) {
          matchedList.forEach(it => used.add(it.id));
          slot.items.push(...matchedList);
          slot.item = matchedList[0];
        }
      });
    });
  }

  // 5. 各スロットのレベル（L1, L2, L3）の振り分けと充足数の計算
  categories.forEach(cat => {
    cat.slots.forEach(slot => {
      const levels: ContentSlot['levels'] = {};
      slot.items.forEach(it => {
        const t = it.title;
        if (t.includes('_L1') || t.includes('基礎') || t.includes('-L1')) {
          levels.l1 = it;
        } else if (t.includes('_L2') || t.includes('標準') || t.includes('-L2')) {
          levels.l2 = it;
        } else if (t.includes('_L3') || t.includes('応用') || t.includes('-L3')) {
          levels.l3 = it;
        }
      });
      slot.levels = levels;
    });

    cat.filled = cat.slots.filter(s => s.item !== null || s.items.length > 0).length;
  });

  const unmatched = items.filter(i => !used.has(i.id)).sort((a, b) => a.title.localeCompare(b.title));
  return { categories, unmatched };
}

export type TestRecordSummary = {
  testId?: string;
  answeredCount: number;
  correctCount: number;
  firstCorrectCount: number;
  totalQuestions: number;
  updatedAt?: string;
};

export type UnifiedUnit = {
  unitKey: string;
  no: number;
  unitCode: string | null;
  subjectId: string;
  subjectName: string;
  largeName: string;
  prefix: string | null;
  mediumName: string;
  smallName: string;
  material: ContentItem | null;
  tests: {
    l1?: ContentItem;
    l2?: ContentItem;
    l3?: ContentItem;
    all: ContentItem[];
  };
  testRecords: {
    l1?: TestRecordSummary;
    l2?: TestRecordSummary;
    l3?: TestRecordSummary;
  };
  bestAccuracy: number | null;
  totalAnswered: number;
  isSyllabusCompleted: boolean;
  status: 'mastered' | 'studying' | 'ready' | 'upcoming';
};

export type UnifiedLargeCategory = {
  name: string;
  prefix: string | null;
  units: UnifiedUnit[];
  mediumGroups: { name: string; units: UnifiedUnit[] }[];
  filledMaterials: number;
  filledTests: number;
};

export type UnifiedSubjectCatalog = {
  subjectId: string;
  subjectName: string;
  largeCategories: UnifiedLargeCategory[];
  totalUnits: number;
  filledMaterials: number;
  filledTests: number;
};

/**
 * カリキュラムDB × 学習コンテンツ管理 × テストコンテンツ管理 × ユーザー回答実績 を
 * 単元単位で完全に統合したカタログを構築する。
 */
export function buildUnifiedCatalog(
  curriculum: CurriculumSubject[],
  materials: ContentItem[],
  tests: ContentItem[],
  userRecords: Record<string, TestRecordSummary> = {},
  completedTasks: string[] = []
): {
  units: UnifiedUnit[];
  subjects: UnifiedSubjectCatalog[];
} {
  const highSchoolCurriculum = curriculum.filter(c => !c.level || c.level === 'high_school');
  const targetCurriculum = highSchoolCurriculum.length > 0 ? highSchoolCurriculum : curriculum;

  // 科目の表示順を整える（数学・英語・理科・社会・国語・情報）
  const SUBJECT_ORDER = ['数学', '英語', '理科', '社会', '国語', '情報'];
  const sortedCurriculum = [...targetCurriculum].sort((a, b) => {
    const aName = a.subjectName || a.id;
    const bName = b.subjectName || b.id;
    const aIdx = SUBJECT_ORDER.findIndex(s => aName.includes(s));
    const bIdx = SUBJECT_ORDER.findIndex(s => bName.includes(s));
    return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
  });

  const completedNormSet = new Set(completedTasks.map(t => normalizeName(t)));
  const allUnits: UnifiedUnit[] = [];
  const subjects: UnifiedSubjectCatalog[] = [];

  for (const subj of sortedCurriculum) {
    const subjMaterials = materials.filter(m => normalizeSubjectId(m, targetCurriculum) === subj.id);
    const subjTests = tests.filter(t => normalizeSubjectId(t, targetCurriculum) === subj.id);

    const matBuilt = buildSubjectSlots(subj, subjMaterials);
    const testBuilt = buildSubjectSlots(subj, subjTests);

    const largeCategories: UnifiedLargeCategory[] = [];
    let subjFilledMat = 0;
    let subjFilledTest = 0;
    let subjTotalUnits = 0;

    matBuilt.categories.forEach((matCat, cIdx) => {
      const testCat = testBuilt.categories[cIdx];
      const catUnits: UnifiedUnit[] = [];
      const mediumMap = new Map<string, UnifiedUnit[]>();
      let catFilledMat = 0;
      let catFilledTest = 0;

      matCat.slots.forEach((matSlot, sIdx) => {
        const testSlot = testCat?.slots[sIdx];
        const l1 = testSlot?.levels.l1;
        const l2 = testSlot?.levels.l2;
        const l3 = testSlot?.levels.l3;
        const allTestItems = testSlot?.items || [];

        const recL1 = l1 ? userRecords[l1.id] : undefined;
        const recL2 = l2 ? userRecords[l2.id] : undefined;
        const recL3 = l3 ? userRecords[l3.id] : undefined;

        const accuracies: number[] = [];
        let totalAnswered = 0;
        [recL1, recL2, recL3].forEach(r => {
          if (r && r.answeredCount > 0) {
            totalAnswered += r.answeredCount;
            accuracies.push(Math.round((r.correctCount / r.answeredCount) * 100));
          }
        });

        const bestAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : null;
        const isSyllabusCompleted = completedNormSet.has(normalizeName(matSlot.smallName));
        const hasMaterial = matSlot.item !== null;
        const hasTests = allTestItems.length > 0;

        if (hasMaterial) catFilledMat++;
        if (hasTests) catFilledTest++;

        let status: UnifiedUnit['status'] = 'upcoming';
        if (isSyllabusCompleted || (bestAccuracy !== null && bestAccuracy >= 80 && totalAnswered >= 5)) {
          status = 'mastered';
        } else if (totalAnswered > 0) {
          status = 'studying';
        } else if (hasMaterial || hasTests) {
          status = 'ready';
        }

        const unit: UnifiedUnit = {
          unitKey: `${subj.id}::${matCat.name}::${matSlot.no}`,
          no: matSlot.no,
          unitCode: matSlot.expectedTitle,
          subjectId: subj.id,
          subjectName: (subj.subjectName || subj.id).replace(/^high_school_/, ''),
          largeName: matCat.name,
          prefix: matCat.prefix,
          mediumName: matSlot.mediumName,
          smallName: matSlot.smallName,
          material: matSlot.item,
          tests: {
            l1,
            l2,
            l3,
            all: allTestItems,
          },
          testRecords: {
            l1: recL1,
            l2: recL2,
            l3: recL3,
          },
          bestAccuracy,
          totalAnswered,
          isSyllabusCompleted,
          status,
        };

        catUnits.push(unit);
        allUnits.push(unit);

        if (!mediumMap.has(unit.mediumName)) {
          mediumMap.set(unit.mediumName, []);
        }
        mediumMap.get(unit.mediumName)!.push(unit);
      });

      const mediumGroups = Array.from(mediumMap.entries()).map(([name, units]) => ({
        name,
        units,
      }));

      largeCategories.push({
        name: matCat.name,
        prefix: matCat.prefix,
        units: catUnits,
        mediumGroups,
        filledMaterials: catFilledMat,
        filledTests: catFilledTest,
      });

      subjFilledMat += catFilledMat;
      subjFilledTest += catFilledTest;
      subjTotalUnits += catUnits.length;
    });

    subjects.push({
      subjectId: subj.id,
      subjectName: (subj.subjectName || subj.id).replace(/^high_school_/, ''),
      largeCategories,
      totalUnits: subjTotalUnits,
      filledMaterials: subjFilledMat,
      filledTests: subjFilledTest,
    });
  }

  return { units: allUnits, subjects };
}

/**
 * シラバスのタスク名（または検索クエリ）から対応する UnifiedUnit を検索する。
 */
export function findMatchingUnitsForTask(
  taskTitle: string,
  subjectHint: string | undefined,
  allUnits: UnifiedUnit[]
): UnifiedUnit[] {
  if (!taskTitle || allUnits.length === 0) return [];

  const cleanedTitle = taskTitle
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  const normTask = normalizeName(cleanedTitle);
  if (!normTask) return [];

  // 科目ヒントがある場合はその科目を優先
  const hintNorm = subjectHint ? normalizeName(subjectHint) : '';
  const scopedUnits = hintNorm
    ? allUnits.filter(
        u =>
          normalizeName(u.subjectName).includes(hintNorm) ||
          hintNorm.includes(normalizeName(u.subjectName)) ||
          normalizeName(u.largeName).includes(hintNorm) ||
          hintNorm.includes(normalizeName(u.largeName))
      )
    : [];

  const pools = scopedUnits.length > 0 ? [scopedUnits, allUnits] : [allUnits];

  for (const pool of pools) {
    // 1. 単元コード完全一致 (例: 数Ⅰ-001)
    const codeMatch = pool.filter(u => u.unitCode && u.unitCode === cleanedTitle);
    if (codeMatch.length > 0) return codeMatch;

    // 2. 小分類名 (smallName) の完全一致
    const exactSmall = pool.filter(u => normalizeName(u.smallName) === normTask);
    if (exactSmall.length > 0) {
      // 学習教材やテストが入っている枠を先頭に並べる
      return exactSmall.sort((a, b) => {
        const aScore = (a.material ? 2 : 0) + (a.tests.all.length > 0 ? 2 : 0);
        const bScore = (b.material ? 2 : 0) + (b.tests.all.length > 0 ? 2 : 0);
        return bScore - aScore;
      });
    }

    // 3. 中分類名 (mediumName) の完全一致
    const exactMedium = pool.filter(u => normalizeName(u.mediumName) === normTask);
    if (exactMedium.length > 0) return exactMedium;

    // 4. 部分一致（3文字以上の場合）
    if (normTask.length >= 3) {
      const partial = pool.filter(u => {
        const s = normalizeName(u.smallName);
        return s.length >= 3 && (s.includes(normTask) || normTask.includes(s));
      });
      if (partial.length > 0) return partial;
    }
  }

  return [];
}

