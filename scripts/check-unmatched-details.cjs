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

async function checkDetails() {
  // 1. 理科: 物基 の小分類数と各中分類の構成
  const rikaDoc = await db.collection('curriculum_db').doc('high_school_理科').get();
  const rika = rikaDoc.data();
  const butsuki = (rika.largeCategories || []).find(l => l.name === '物理基礎');
  console.log('=== 物理基礎 (curriculum) ===');
  let bCount = 0;
  (butsuki.mediumCategories || []).forEach(m => {
    console.log(` - ${m.name}: ${(m.smallCategories || []).length}件 (No. ${bCount + 1} - ${bCount + (m.smallCategories || []).length})`);
    bCount += (m.smallCategories || []).length;
  });
  console.log(`Total 物理基礎 slots in curriculum: ${bCount}`);

  // 2. 数学: 数学Ⅰ の小分類数と各中分類の構成
  const mathDoc = await db.collection('curriculum_db').doc('high_school_数学').get();
  const math = mathDoc.data();
  const math1 = (math.largeCategories || []).find(l => l.name === '数学Ⅰ');
  console.log('\n=== 数学Ⅰ (curriculum) ===');
  let mCount = 0;
  (math1.mediumCategories || []).forEach(m => {
    console.log(` - ${m.name}: ${(m.smallCategories || []).length}件 (No. ${mCount + 1} - ${mCount + (m.smallCategories || []).length})`);
    mCount += (m.smallCategories || []).length;
  });
  console.log(`Total 数学Ⅰ slots in curriculum: ${mCount}`);

  // 3. 英語: 英語コミュニケーションⅡ の小分類数と各中分類の構成
  const engDoc = await db.collection('curriculum_db').doc('high_school_英語').get();
  const eng = engDoc.data();
  const eng2 = (eng.largeCategories || []).find(l => l.name === '英語コミュニケーションⅡ');
  console.log('\n=== 英語コミュニケーションⅡ (curriculum) ===');
  let eCount = 0;
  (eng2.mediumCategories || []).forEach(m => {
    console.log(` - ${m.name}: ${(m.smallCategories || []).length}件 (No. ${eCount + 1} - ${eCount + (m.smallCategories || []).length})`);
    eCount += (m.smallCategories || []).length;
  });
  console.log(`Total 英語コミュニケーションⅡ slots in curriculum: ${eCount}`);

  // 4. すべての learning_materials のタイトル一覧と subject
  const matSnap = await db.collection('learning_materials').get();
  console.log(`\n=== All Materials Subject Distribution ===`);
  const subjCounts = {};
  matSnap.docs.forEach(d => {
    const s = d.data().subject;
    subjCounts[s] = (subjCounts[s] || 0) + 1;
  });
  console.log(subjCounts);
}

checkDetails().catch(console.error);
