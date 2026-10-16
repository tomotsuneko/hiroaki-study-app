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

const normalizeName = (s) =>
  (s || '').replace(/[†‡*＊]/g, '').replace(/\s+/g, '').replace(/[（(].*?[）)]/g, '').trim();

const normalizeStrict = (s) =>
  (s || '').replace(/[†‡*＊]/g, '').replace(/\s+/g, '').trim();

function extractBaseTitleCode(title) {
  if (!title) return '';
  return title.split('_')[0];
}

async function testImprovedMatching() {
  const curSnap = await db.collection('curriculum_db').get();
  const curriculum = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const matSnap = await db.collection('learning_materials').get();
  const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // グルーピング
  const grouped = {};
  for (const m of materials) {
    const subj = m.subject || 'unknown';
    if (!grouped[subj]) grouped[subj] = [];
    grouped[subj].push(m);
  }

  for (const [subjId, items] of Object.entries(grouped)) {
    const curSubj = curriculum.find(c => c.id === subjId);
    if (!curSubj) continue;

    const byBaseCode = new Map();
    items.forEach(it => {
      const code = extractBaseTitleCode(it.title);
      if (!byBaseCode.has(code)) byBaseCode.set(code, []);
      byBaseCode.get(code).push(it);
    });

    const used = new Set();
    const allSlots = [];

    // パス1: ファイル名（expectedTitle）による完全一致
    curSubj.largeCategories.forEach(l => {
      const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
      let no = 0;
      (l.mediumCategories || []).forEach(m => {
        (m.smallCategories || []).forEach(s => {
          no++;
          const expectedTitle = prefix ? `${prefix}-${String(no).padStart(3, '0')}` : null;
          let matchedItem = null;
          if (expectedTitle && byBaseCode.has(expectedTitle)) {
            const list = byBaseCode.get(expectedTitle);
            if (list.length > 0) {
              matchedItem = list[0];
              used.add(matchedItem.id);
            }
          }
          allSlots.push({ no, expectedTitle, mediumName: m.name, smallName: s, item: matchedItem, largeName: l.name });
        });
      });
    });

    // パス2: まだ埋まっていないスロットに対して、contentTitle（単元名）でマッチング
    const remainingItems = items.filter(it => !used.has(it.id));
    console.log(`\n[${subjId}] After Path 1: ${used.size} matched, ${remainingItems.length} remaining`);

    for (const slot of allSlots) {
      if (slot.item) continue;
      const sNorm = normalizeStrict(slot.smallName);
      const match = remainingItems.find(it => !used.has(it.id) && normalizeStrict(it.contentTitle || '') === sNorm);
      if (match) {
        slot.item = match;
        used.add(match.id);
        console.log(`✨ Path 2 Match: Slot ${slot.no} [${slot.expectedTitle}] (${slot.smallName}) <= Item "${match.id}" (${match.contentTitle})`);
      }
    }

    // パス3: 括弧を除いた柔軟マッチング（念のため）
    for (const slot of allSlots) {
      if (slot.item) continue;
      const sLoose = normalizeName(slot.smallName);
      if (!sLoose) continue;
      const match = remainingItems.find(it => !used.has(it.id) && normalizeName(it.contentTitle || '') === sLoose);
      if (match) {
        slot.item = match;
        used.add(match.id);
        console.log(`✨ Path 3 Loose Match: Slot ${slot.no} [${slot.expectedTitle}] (${slot.smallName}) <= Item "${match.id}" (${match.contentTitle})`);
      }
    }

    const finalUnmatched = items.filter(it => !used.has(it.id));
    console.log(`[${subjId}] Final: ${used.size} / ${items.length} matched. Unmatched count: ${finalUnmatched.length}`);
    if (finalUnmatched.length > 0) {
      finalUnmatched.forEach(u => console.log(`   - STILL UNMATCHED: ${u.id} (${u.contentTitle})`));
    }
  }
}

testImprovedMatching().catch(console.error);
