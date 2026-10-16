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

const normalizeStrict = (s) =>
  (s || '').replace(/[†‡*＊]/g, '').replace(/\s+/g, '').trim();

async function testTitleFirstMatching() {
  const curSnap = await db.collection('curriculum_db').get();
  const curriculum = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const matSnap = await db.collection('learning_materials').get();
  const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const grouped = {};
  for (const m of materials) {
    const subj = m.subject || 'unknown';
    if (!grouped[subj]) grouped[subj] = [];
    grouped[subj].push(m);
  }

  for (const [subjId, items] of Object.entries(grouped)) {
    const curSubj = curriculum.find(c => c.id === subjId);
    if (!curSubj) continue;

    const used = new Set();
    const categories = [];

    // 大分類ごとにスロットを生成
    for (const l of curSubj.largeCategories || []) {
      const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
      // この大分類に属する候補アイテム（prefix 一致 または subject 一致）
      const candidateItems = items.filter(it => {
        if (prefix && it.title.startsWith(prefix)) return true;
        return false;
      });

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
            smallName: s,
            item: null
          });
        }
      }

      // 1. まず小分類名（contentTitle）の完全一致で紐付け（同大分類内）
      for (const slot of slots) {
        const sNorm = normalizeStrict(slot.smallName);
        const match = candidateItems.find(it => !used.has(it.id) && normalizeStrict(it.contentTitle || '') === sNorm);
        if (match) {
          slot.item = match;
          used.add(match.id);
        }
      }

      // 2. 次にファイル名（expectedTitle）の完全一致で紐付け
      for (const slot of slots) {
        if (slot.item) continue;
        const match = candidateItems.find(it => !used.has(it.id) && it.title === slot.expectedTitle);
        if (match) {
          slot.item = match;
          used.add(match.id);
        }
      }

      categories.push({ name: l.name, prefix, slots, filled: slots.filter(s => s.item).length });
    }

    // 全大分類で拾えなかった残りの候補を、prefixなしや他大分類で小分類名一致
    const remaining = items.filter(it => !used.has(it.id));
    for (const cat of categories) {
      for (const slot of cat.slots) {
        if (slot.item) continue;
        const sNorm = normalizeStrict(slot.smallName);
        const match = remaining.find(it => !used.has(it.id) && normalizeStrict(it.contentTitle || '') === sNorm);
        if (match) {
          slot.item = match;
          used.add(match.id);
          cat.filled++;
        }
      }
    }

    const unmatched = items.filter(it => !used.has(it.id));
    console.log(`[${subjId}] Matched: ${used.size} / ${items.length}, Unmatched: ${unmatched.length}`);
    if (unmatched.length > 0) {
      unmatched.forEach(u => console.log(`   - UNMATCHED: ${u.id} (${u.contentTitle})`));
    }
  }
}

testTitleFirstMatching().catch(console.error);
