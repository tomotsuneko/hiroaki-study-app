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

async function checkRange() {
  const matSnap = await db.collection('learning_materials').get();
  const allMaterials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log('=== Math 1: 095 to 106 ===');
  allMaterials
    .filter(m => m.title.startsWith('数Ⅰ-09') || m.title.startsWith('数Ⅰ-10'))
    .sort((a,b) => a.title.localeCompare(b.title))
    .forEach(m => console.log(m.title, ':', m.contentTitle));

  console.log('\n=== Physics: 035 to 045 ===');
  allMaterials
    .filter(m => m.title.startsWith('物基-03') || m.title.startsWith('物基-04'))
    .sort((a,b) => a.title.localeCompare(b.title))
    .forEach(m => console.log(m.title, ':', m.contentTitle));
}

checkRange().catch(console.error);
