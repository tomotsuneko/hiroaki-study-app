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
};

export type CategorySlots = {
  name: string;
  prefix: string | null;
  slots: ContentSlot[];
  filled: number;
};

const normalizeName = (s: string) =>
  (s || '').replace(/[†‡*＊]/g, '').replace(/\s+/g, '').trim();

/** 接頭辞（例: 数Ａ）から所属する科目IDを逆引きする */
export function resolveSubjectIdByTitle(title: string, curriculum: CurriculumSubject[]): string | null {
  const prefix = (title || '').replace(/-\d+$/, '');
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
 * 戻り値の `unmatched` はどの枠にも当てはまらなかったコンテンツ（取りこぼし防止）。
 */
export function buildSubjectSlots(
  subject: CurriculumSubject,
  items: ContentItem[]
): { categories: CategorySlots[]; unmatched: ContentItem[] } {
  const byTitle = new Map(items.map(i => [i.title, i]));
  const used = new Set<string>();

  const categories: CategorySlots[] = (subject.largeCategories || []).map(l => {
    const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
    const slots: ContentSlot[] = [];
    let no = 0;
    for (const m of l.mediumCategories || []) {
      for (const s of m.smallCategories || []) {
        no++;
        const expectedTitle = prefix ? `${prefix}-${String(no).padStart(3, '0')}` : null;
        let item: ContentItem | null = expectedTitle ? byTitle.get(expectedTitle) || null : null;
        // 接頭辞が未定義の大分類は、コンテンツの<title>と小分類名の一致で当てはめる
        if (!item && !prefix) {
          item = items.find(i => !used.has(i.id) && normalizeName(i.contentTitle || '') === normalizeName(s)) || null;
        }
        if (item) used.add(item.id);
        slots.push({ no, expectedTitle, mediumName: m.name, smallName: s.replace(/\s*[†‡]\s*$/, ''), item });
      }
    }
    return { name: l.name, prefix, slots, filled: slots.filter(s => s.item).length };
  });

  const unmatched = items.filter(i => !used.has(i.id)).sort((a, b) => a.title.localeCompare(b.title));
  return { categories, unmatched };
}
