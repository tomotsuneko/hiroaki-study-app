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

// content-slots.ts のロジックをシミュレート
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

function normalizeName(s) {
  return (s || '').replace(/[†‡*＊]/g, '').replace(/\s+/g, '').trim();
}

function extractBaseTitleCode(title) {
  if (!title) return '';
  return title.split('_')[0];
}

async function analyzeUnmatched() {
  // 1. カリキュラムDB取得
  const curSnap = await db.collection('curriculum_db').get();
  const curriculum = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 2. 学習コンテンツ取得
  const matSnap = await db.collection('learning_materials').get();
  const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Total learning materials: ${materials.length}`);
  console.log(`Total curriculum subjects: ${curriculum.length}`);

  // 各科目ごとにグルーピング
  const grouped = {};
  for (const m of materials) {
    const subj = m.subject || 'unknown';
    if (!grouped[subj]) grouped[subj] = [];
    grouped[subj].push(m);
  }

  for (const [subjId, items] of Object.entries(grouped)) {
    const curSubj = curriculum.find(c => c.id === subjId);
    console.log(`\n========================================`);
    console.log(`Subject: ${subjId} (${items.length} items) - Found in curriculum?: ${!!curSubj}`);

    if (!curSubj) {
      console.log(`❌ No curriculum found for subject id: ${subjId}`);
      console.log(`Sample item titles:`, items.slice(0, 5).map(i => i.title));
      continue;
    }

    // スロット生成チェック
    const used = new Set();
    const slots = [];

    const byBaseCode = new Map();
    items.forEach(it => {
      const code = extractBaseTitleCode(it.title);
      if (!byBaseCode.has(code)) byBaseCode.set(code, []);
      byBaseCode.get(code).push(it);
    });

    (curSubj.largeCategories || []).forEach(l => {
      const prefix = CATEGORY_PREFIX_MAP[l.name] || null;
      let no = 0;
      (l.mediumCategories || []).forEach(m => {
        (m.smallCategories || []).forEach(s => {
          no++;
          const expectedTitle = prefix ? `${prefix}-${String(no).padStart(3, '0')}` : null;
          const matched = expectedTitle && byBaseCode.has(expectedTitle) ? byBaseCode.get(expectedTitle) : [];
          matched.forEach(it => used.add(it.id));
        });
      });
    });

    const unmatched = items.filter(it => !used.has(it.id));
    console.log(`Matched: ${used.size} / ${items.length}, Unmatched: ${unmatched.length}`);

    if (unmatched.length > 0) {
      console.log(`\n⚠️ Unmatched items for ${subjId}:`);
      unmatched.forEach(u => {
        console.log(` - ID: "${u.id}", title: "${u.title}", contentTitle: "${u.contentTitle}", subject: "${u.subject}", subjectName: "${u.subjectName}"`);
      });

      console.log(`\nCurriculum Large Categories for ${subjId}:`);
      (curSubj.largeCategories || []).forEach(l => {
        const prefix = CATEGORY_PREFIX_MAP[l.name];
        console.log(`   - "${l.name}" -> prefix: ${prefix || 'NONE'}`);
      });
    }
  }
}

analyzeUnmatched().catch(console.error);
