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

async function checkSpecificMaterials() {
  // 1. 英Ⅱ-142 と他の英Ⅱ教材
  const matSnap = await db.collection('learning_materials').get();
  const allMaterials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const engMaterials = allMaterials.filter(m => m.title.startsWith('英Ⅱ') || m.subject === 'high_school_英語');
  console.log('=== English Materials ===');
  engMaterials.forEach(m => console.log(` - ID: ${m.id}, title: ${m.title}, contentTitle: ${m.contentTitle}`));

  // 2. 物基-071 と物基-065〜070
  const rikaMaterials = allMaterials.filter(m => m.title.startsWith('物基-06') || m.title.startsWith('物基-07'));
  console.log('\n=== Physics Materials (end) ===');
  rikaMaterials.sort((a,b) => a.title.localeCompare(b.title)).forEach(m => console.log(` - ID: ${m.id}, title: ${m.title}, contentTitle: ${m.contentTitle}`));

  // 3. 数Ⅰ-100〜106
  const mathMaterials = allMaterials.filter(m => m.title.startsWith('数Ⅰ-10'));
  console.log('\n=== Math 1 Materials (end) ===');
  mathMaterials.sort((a,b) => a.title.localeCompare(b.title)).forEach(m => console.log(` - ID: ${m.id}, title: ${m.title}, contentTitle: ${m.contentTitle}`));

  // 4. カリキュラム側の小分類リスト（末尾付近）
  const mathDoc = await db.collection('curriculum_db').doc('high_school_数学').get();
  const m1 = (mathDoc.data().largeCategories || []).find(l => l.name === '数学Ⅰ');
  const lastMGroup = m1.mediumCategories[m1.mediumCategories.length - 1];
  console.log('\n=== Math 1 Last Medium Category ===');
  console.log(`Medium: ${lastMGroup.name}`);
  console.log(lastMGroup.smallCategories);

  const rikaDoc = await db.collection('curriculum_db').doc('high_school_理科').get();
  const b1 = (rikaDoc.data().largeCategories || []).find(l => l.name === '物理基礎');
  console.log('\n=== Physics Medium Categories ===');
  b1.mediumCategories.forEach(m => console.log(`Medium: ${m.name}, count: ${(m.smallCategories||[]).length}, smalls:`, m.smallCategories));
}

checkSpecificMaterials().catch(console.error);
