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

async function testUpdatedContentSlots() {
  // src/lib/content-slots.ts を tsx/ts-node またはトランスパイルで検証するか、Next.jsビルドで検証
  const curSnap = await db.collection('curriculum_db').get();
  const curriculum = curSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const matSnap = await db.collection('learning_materials').get();
  const materials = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const testSnap = await db.collection('test_materials').get();
  const testMaterials = testSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Learning Materials total: ${materials.length}`);
  console.log(`Test Materials total: ${testMaterials.length}`);
}

testUpdatedContentSlots().catch(console.error);
