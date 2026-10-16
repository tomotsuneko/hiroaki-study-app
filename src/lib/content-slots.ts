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
