const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const env = {};
const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8').replace(/^\uFEFF/, '');
for (const line of raw.split(/\r?\n/)) {
  const idx = line.indexOf('=');
  if (idx < 0) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
}

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

const CATEGORY_PREFIX_MAP = {
  '現代の国語': '現国', '言語文化': '言文', '論理国語': '論国', '文学国語': '文国', '古典探究': '古探',
  '情報Ⅰ': '情Ⅰ',
  '数学Ⅰ': '数Ⅰ', '数学Ⅱ': '数Ⅱ', '数学Ⅲ': '数Ⅲ', '数学Ａ': '数Ａ', '数学Ｂ': '数Ｂ', '数学Ｃ': '数Ｃ',
  '物理基礎': '物基', '物理': '物理', '化学基礎': '化基', '化学': '化学', '生物基礎': '生基', '生物': '生物', '地学基礎': '地基', '地学': '地学',
  '歴史総合': '歴総', '日本史探究': '日探', '世界史探究': '世探', '地理総合': '地総', '地理探究': '地探', '公共': '公共', '倫理': '倫理', '政治・経済': '政経',
  '英語コミュニケーションⅠ': '英Ⅰ', '英語コミュニケーションⅡ': '英Ⅱ', '英語コミュニケーションⅢ': '英Ⅲ',
  '論理・表現Ⅰ': '論Ⅰ', '論理・表現Ⅱ': '論Ⅱ', '論理・表現Ⅲ': '論Ⅲ',
};

const normalizeName = (s) =>
  (s || '')
    .replace(/[†‡*＊]/g, '')
    .replace(/[・_\-—](基礎|標準|応用).*$/g, '')
    .replace(/\s+/g, '')
    .trim();

function extractBaseTitleCode(title) {
  if (!title) return '';
  return title.split('_')[0];
}

async function testTestsSlots() {
  const curSnap = await db.collection('curriculum_db').get();
  const curriculum = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const testSnap = await db.collection('test_materials').get();
  const testMaterials = testSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mathCur = curriculum.find(c => c.id === 'high_school_数学');
  const mathTests = testMaterials.filter(t => t.subject === 'high_school_数学' || t.title.startsWith('数Ⅰ') || t.title.startsWith('数Ａ'));

  const used = new Set();
  const categories = (mathCur.largeCategories || []).map(l => {
    const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
    const slots = [];
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

  // 1. 各大分類内で小分類名一致
  categories.forEach(cat => {
    const prefix = cat.prefix;
    const candidateItems = mathTests.filter(it => {
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

  // 2. 想定ファイル名一致
  categories.forEach(cat => {
    cat.slots.forEach(slot => {
      if (!slot.expectedTitle) return;

      const matchedList = mathTests.filter(it =>
        !used.has(it.id) && (it.title === slot.expectedTitle || extractBaseTitleCode(it.title) === slot.expectedTitle)
      );

      if (matchedList.length > 0) {
        matchedList.forEach(it => used.add(it.id));
        slot.items.push(...matchedList);
        if (!slot.item) slot.item = matchedList[0];
      }
    });
  });

  categories.forEach(cat => {
    cat.filled = cat.slots.filter(s => s.item !== null || s.items.length > 0).length;
    console.log(`[${cat.name}] Filled slots: ${cat.filled} / ${cat.slots.length}`);
  });

  const unmatched = mathTests.filter(it => !used.has(it.id));
  console.log(`Total tests matched: ${used.size} / ${mathTests.length}, Unmatched: ${unmatched.length}`);
}

testTestsSlots().catch(console.error);
