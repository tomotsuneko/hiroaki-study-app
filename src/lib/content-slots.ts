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

/** 単元タイトルの表記揺れ・改訂差分を吸収するエイリアスマップ */
export const TITLE_ALIASES: Record<string, string> = {
  // 英語コミュニケーションⅡ
  '中学校で学んだ文構造と否定の文の活用': '中学校で学んだ文構造の活用',
  '仮定法の活用（仮定法過去完了・as if・仮定法現在）': '仮定法の活用（仮定法過去完了・as if）',
};

const normalizeName = (s: string) => {
  const base = (s || '')
    .replace(/[†‡*＊]/g, '')
    .replace(/[・_\-—](基礎|標準|応用).*$/g, '')
    .replace(/\s+/g, '')
    .trim();
  const aliased = TITLE_ALIASES[base] || base;
  return aliased
    .replace(/[†‡*＊]/g, '')
    .replace(/[・_\-—](基礎|標準|応用).*$/g, '')
    .replace(/\s+/g, '')
    .trim();
};

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

/** 検索・照合用に表記揺れや数字表記（1次/一次 等）、記号、空白を正規化する */
export function normalizeSearchText(s: string): string {
  return (s || '')
    .normalize('NFKC')
    .replace(/1次/g, '一次')
    .replace(/2次/g, '二次')
    .replace(/3次/g, '三次')
    .replace(/2倍角/g, '二倍角')
    .replace(/2項/g, '二項')
    .replace(/[\s\u3000・･,、。.:：/／()（）「」『』【】\[\]!?！？†‡*＊\-ー—]+/g, '')
    .toLowerCase()
    .trim();
}

/** 中分類名先頭の章番号接頭辞（例: "Ⅰ-4 ", "英Ⅰ-5 ", "A-1 "）を除去する */
export function stripMediumPrefix(mediumName: string): string {
  return (mediumName || '').replace(/^[^\s]+[-ー－]\d+\s*/u, '').trim();
}

function stripLeadingDecorators(str: string): string {
  return (str || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function sortByMaterialAvailability(units: UnifiedUnit[]): UnifiedUnit[] {
  return [...units].sort((a, b) => {
    const aScore =
      (a.material ? 40 : 0) +
      (a.tests.all.length > 0 ? 20 : 0) +
      (a.status !== 'mastered' ? 10 : 0);
    const bScore =
      (b.material ? 40 : 0) +
      (b.tests.all.length > 0 ? 20 : 0) +
      (b.status !== 'mastered' ? 10 : 0);
    if (bScore !== aScore) return bScore - aScore;
    return a.no - b.no;
  });
}

function getScopedUnitsByHint(
  subjectHint: string | undefined,
  taskTitle: string,
  allUnits: UnifiedUnit[]
): UnifiedUnit[] {
  const hintClean = stripLeadingDecorators(subjectHint || '').normalize('NFKC');
  const combined = `${hintClean} ${stripLeadingDecorators(taskTitle).normalize('NFKC')}`;

  let candidates: UnifiedUnit[] = [];

  if (/数学\s*(?:IA|I・A|1A|I\s*・?\s*A)/i.test(hintClean) || /数学IA/i.test(combined)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ⅰ' || u.largeName === '数学Ａ');
  } else if (/数学\s*(?:IIBC|II・B・C|IIB|2BC|2B)/i.test(hintClean) || /数学IIBC/i.test(combined)) {
    candidates = allUnits.filter(
      u => u.largeName === '数学Ⅱ' || u.largeName === '数学Ｂ' || u.largeName === '数学Ｃ'
    );
  } else if (/数学\s*(?:III|Ⅲ|3)/i.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ⅲ');
  } else if (/数学\s*(?:I|Ⅰ|1)$/i.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ⅰ');
  } else if (/数学\s*(?:A|Ａ)$/i.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ａ');
  } else if (/数学\s*(?:II|Ⅱ|2)$/i.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ⅱ');
  } else if (/数学\s*(?:B|Ｂ)$/i.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '数学Ｂ');
  } else if (/数学/.test(hintClean)) {
    candidates = allUnits.filter(u => u.subjectName === '数学');
  } else if (/現代文/.test(hintClean)) {
    candidates = allUnits.filter(
      u => u.largeName === '現代の国語' || u.largeName === '論理国語' || u.largeName === '文学国語'
    );
  } else if (/古文|漢文|古典/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '言語文化' || u.largeName === '古典探究');
  } else if (/国語/.test(hintClean)) {
    candidates = allUnits.filter(u => u.subjectName === '国語');
  } else if (/英語/.test(hintClean)) {
    candidates = allUnits.filter(u => u.subjectName === '英語');
  } else if (/物理/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '物理基礎' || u.largeName === '物理');
  } else if (/化学/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '化学基礎' || u.largeName === '化学');
  } else if (/生物/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '生物基礎' || u.largeName === '生物');
  } else if (/地学/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '地学基礎' || u.largeName === '地学');
  } else if (/日本史/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '歴史総合' || u.largeName === '日本史探究');
  } else if (/世界史/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '歴史総合' || u.largeName === '世界史探究');
  } else if (/地理/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '地理総合' || u.largeName === '地理探究');
  } else if (/政経|政治・経済|倫理|公共|公民/.test(hintClean)) {
    candidates = allUnits.filter(
      u => u.largeName === '公共' || u.largeName === '倫理' || u.largeName === '政治・経済'
    );
  } else if (/情報/.test(hintClean)) {
    candidates = allUnits.filter(u => u.largeName === '情報Ⅰ');
  }

  if (candidates.length > 0) return candidates;

  const hintNorm = normalizeSearchText(hintClean);
  if (!hintNorm) return [];
  return allUnits.filter(u => {
    const sNorm = normalizeSearchText(u.subjectName);
    const lNorm = normalizeSearchText(u.largeName);
    return (
      sNorm.includes(hintNorm) ||
      hintNorm.includes(sNorm) ||
      lNorm.includes(hintNorm) ||
      hintNorm.includes(lNorm)
    );
  });
}

const SYNONYM_EXPANSIONS: Array<[RegExp, string[]]> = [
  [/受動態/, ['受け身', '受身']],
  [/5文型|基本文型|文型/, ['文構造']],
  [/準動詞/, ['不定詞', '動名詞', '分詞']],
  [/関係詞/, ['関係代名詞', '関係副詞']],
  [/比較構文|比較/, ['比較']],
  [/仮定法/, ['仮定法']],
  [/時制/, ['時制', '完了形']],
  [/助動詞/, ['助動詞']],
  [/語法|イディオム|英単語|熟語|語彙/, ['語句', '文構造']],
  [/長文|パラグラフ|精読|読解/, ['読解', '説明文', '論証文']],
  [/式と証明/, ['いろいろな式', '乗法公式', '二項定理', '恒等式', '因数分解']],
  [/複素数と方程式|高次方程式/, ['複素数', '解と係数の関係', '剰余の定理', '因数定理', '高次方程式']],
  [/整数の性質/, ['約数と倍数', 'ユークリッドの互除法', '一次不定方程式']],
  [/微分法と積分法|微分係数|導関数/, ['微分', '導関数', '微分係数', '接線']],
  [/不定積分|定積分|積分と面積/, ['不定積分', '定積分', '面積']],
  [/平面ベクトル|平面上のベクトル/, ['ベクトル', '成分による演算', '内積']],
  [/空間のベクトル|空間ベクトル/, ['空間', 'ベクトル']],
  [/評論/, ['論証', '論理', '説明文', '主張', '要約']],
  [/小説|随筆/, ['文学', '小説', '表現']],
  [/漢字/, ['語句', '表記']],
];

const SEARCH_STOP_TOKENS = new Set([
  '性質', '公式', '基本', '基礎', '標準', '応用', '演習', '練習',
  '整理', '意味', '活用', '表現', '用法', '構造', '種類', '関係',
  '特徴', '役割', '確認', 'まとめ', '総復習', '復習', '単元末',
  '計算', '把握', '理解', '習得', '解放', '解法', '定着', '課題',
]);

function extractSearchTokens(query: string): string[] {
  const cleaned = stripLeadingDecorators(query)
    .normalize('NFKC')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  const rawParts = cleaned
    .split(/[\s\u3000・･,、。.:：/／()（）「」『』【】\[\]とや及・]+/)
    .map(part =>
      part
        .replace(/(?:の基礎|の基本|の応用|の解法|の演習|の整理|の習得|の把握|の理解|の性質|の計算|の基本公式|フレームワーク|プロセス|演習|入門|基礎|標準|応用|総合)$/g, '')
        .trim()
    )
    .filter(p => p.length >= 2);

  const tokens = new Set<string>();
  const fullNorm = normalizeSearchText(cleaned);
  if (fullNorm.length >= 2 && !SEARCH_STOP_TOKENS.has(fullNorm)) tokens.add(fullNorm);

  for (const p of rawParts) {
    const np = normalizeSearchText(p);
    if (np.length >= 2 && !SEARCH_STOP_TOKENS.has(np)) {
      tokens.add(np);
    }
    // 「三角関数の基本公式」等から「の」前の主要概念（「三角関数」）も抽出
    for (const sub of p.split('の')) {
      const ns = normalizeSearchText(sub);
      if (ns.length >= 2 && !SEARCH_STOP_TOKENS.has(ns)) {
        tokens.add(ns);
      }
    }
  }

  for (const [pattern, expansions] of SYNONYM_EXPANSIONS) {
    if (pattern.test(cleaned)) {
      for (const exp of expansions) {
        const ne = normalizeSearchText(exp);
        if (ne.length >= 2) tokens.add(ne);
      }
    }
  }

  return Array.from(tokens);
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

  const cleanedTitle = stripLeadingDecorators(taskTitle)
    .normalize('NFKC')
    .replace(/【.*?】/g, '')
    .replace(/\[.*?\]/g, '')
    .trim();

  // 1. 全単元から単元コード / 教材ID の完全一致を最優先で確認 (例: 数Ⅰ-001, 英Ⅰ-028)
  const exactCodeMatch = allUnits.filter(
    u =>
      (u.unitCode && u.unitCode.normalize('NFKC') === cleanedTitle) ||
      (u.material?.id && u.material.id.normalize('NFKC') === cleanedTitle)
  );
  if (exactCodeMatch.length > 0) return sortByMaterialAvailability(exactCodeMatch);

  const normTask = normalizeSearchText(cleanedTitle);
  const scopedUnits = getScopedUnitsByHint(subjectHint, cleanedTitle, allUnits);
  // 科目スコープが特定できている場合は、別科目への誤マッチを防ぐためその科目内でのみ探索する
  const pool = scopedUnits.length > 0 ? scopedUnits : allUnits;

  if (normTask) {
    // 2. 小分類名 (smallName) の完全一致
    const exactSmall = pool.filter(u => normalizeSearchText(u.smallName) === normTask);
    if (exactSmall.length > 0) return sortByMaterialAvailability(exactSmall);

    // 3. 中分類名 (mediumName: 先頭番号除去後も含む) の完全一致
    const exactMedium = pool.filter(u => {
      const mFull = normalizeSearchText(u.mediumName);
      const mStripped = normalizeSearchText(stripMediumPrefix(u.mediumName));
      return mFull === normTask || (mStripped && mStripped === normTask);
    });
    if (exactMedium.length > 0) return sortByMaterialAvailability(exactMedium);

    // 4. 部分一致（2文字以上）& トークン＋同義語スコアリング
    if (normTask.length >= 2) {
      const partial = pool.filter(u => {
        const s = normalizeSearchText(u.smallName);
        return s.length >= 2 && (s.includes(normTask) || normTask.includes(s));
      });
      if (partial.length > 0) return sortByMaterialAvailability(partial);
    }

    const tokens = extractSearchTokens(cleanedTitle);
    if (tokens.length > 0) {
      const scored: { unit: UnifiedUnit; score: number }[] = [];
      for (const u of pool) {
        const sNorm = normalizeSearchText(u.smallName);
        const mNorm = normalizeSearchText(stripMediumPrefix(u.mediumName));
        const lNorm = normalizeSearchText(u.largeName);

        let contentScore = 0;
        for (const tok of tokens) {
          if (sNorm.includes(tok)) {
            contentScore += 30 * tok.length;
          } else if (mNorm && (mNorm.includes(tok) || (mNorm.length >= 2 && tok.includes(mNorm)))) {
            contentScore += 18 * Math.min(tok.length, mNorm.length);
          } else if (lNorm.includes(tok)) {
            contentScore += 8 * tok.length;
          }
        }

        if (contentScore > 0) {
          const bonus =
            (u.material ? 25 : 0) +
            (u.tests.all.length > 0 ? 10 : 0) +
            (u.status !== 'mastered' ? 8 : 0);
          scored.push({ unit: u, score: contentScore + bonus });
        }
      }

      if (scored.length > 0) {
        scored.sort((a, b) => b.score - a.score || a.unit.no - b.unit.no);
        return scored.map(x => x.unit);
      }
    }
  }

  // 5. 科目スコープが特定できている場合は、同科目内の教材が配架済みの先頭単元に確実に着地させる
  if (scopedUnits.length > 0) {
    return sortByMaterialAvailability(scopedUnits);
  }

  return [];
}

