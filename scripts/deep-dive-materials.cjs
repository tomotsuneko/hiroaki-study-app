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

async function deepDive() {
  const matSnap = await db.collection('learning_materials').get();
  const allMaterials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 1. 数学Ⅰ 090〜106 の教材とカリキュラムの対応
  const mathDoc = await db.collection('curriculum_db').doc('high_school_数学').get();
  const m1 = (mathDoc.data().largeCategories || []).find(l => l.name === '数学Ⅰ');
  let mNo = 0;
  const m1Slots = [];
  m1.mediumCategories.forEach(m => {
    m.smallCategories.forEach(s => {
      mNo++;
      m1Slots.push({ no: mNo, expected: `数Ⅰ-${String(mNo).padStart(3, '0')}`, medium: m.name, small: s });
    });
  });

  console.log('=== Math 1 Slots vs Materials (No. 85 - 105) ===');
  for (let i = 85; i <= m1Slots.length; i++) {
    const slot = m1Slots[i - 1];
    const mat = allMaterials.find(m => m.title === slot.expected);
    console.log(`[Slot ${slot.no}] ${slot.expected} (${slot.small}): matched mat = ${mat ? mat.title + ' / ' + mat.contentTitle : 'NONE'}`);
  }

  // 2. 物理基礎 040〜046 の教材とカリキュラムの対応
  const rikaDoc = await db.collection('curriculum_db').doc('high_school_理科').get();
  const b1 = (rikaDoc.data().largeCategories || []).find(l => l.name === '物理基礎');
  let bNo = 0;
  const b1Slots = [];
  b1.mediumCategories.forEach(m => {
    m.smallCategories.forEach(s => {
      bNo++;
      b1Slots.push({ no: bNo, expected: `物基-${String(bNo).padStart(3, '0')}`, medium: m.name, small: s });
    });
  });

  console.log('\n=== Physics Slots vs Materials (No. 40 - 48) ===');
  for (let i = 40; i <= 48; i++) {
    const slot = b1Slots[i - 1];
    const mat = allMaterials.find(m => m.title === slot.expected);
    console.log(`[Slot ${slot.no}] ${slot.expected} (${slot.small}): matched mat = ${mat ? mat.title + ' / ' + mat.contentTitle : 'NONE'}`);
  }

  // 3. 英語コミュニケーションⅡ の全スロットで「分詞」を探す
  const engDoc = await db.collection('curriculum_db').doc('high_school_英語').get();
  const e2 = (engDoc.data().largeCategories || []).find(l => l.name === '英語コミュニケーションⅡ');
  let eNo = 0;
  const e2Slots = [];
  e2.mediumCategories.forEach(m => {
    m.smallCategories.forEach(s => {
      eNo++;
      e2Slots.push({ no: eNo, expected: `英Ⅱ-${String(eNo).padStart(3, '0')}`, medium: m.name, small: s });
    });
  });

  console.log('\n=== English 2 Slots containing "分詞" ===');
  e2Slots.filter(s => s.small.includes('分詞') || s.small.includes('構文')).forEach(s => {
    const mat = allMaterials.find(m => m.title === s.expected);
    console.log(`[Slot ${s.no}] ${s.expected} (${s.small}): matched mat = ${mat ? mat.title + ' / ' + mat.contentTitle : 'NONE'}`);
  });

  // 4. 英Ⅱ-142 の中身を少し確認
  const e142 = allMaterials.find(m => m.id === '英Ⅱ-142');
  if (e142) {
    console.log('\n=== Content of 英Ⅱ-142 ===');
    console.log('Title:', e142.title, 'ContentTitle:', e142.contentTitle);
    console.log('Content excerpt:', (e142.content || '').slice(0, 300));
  }
}

deepDive().catch(console.error);
