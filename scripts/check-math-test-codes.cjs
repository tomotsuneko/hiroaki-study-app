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

async function checkMathUnmatched() {
  const testSnap = await db.collection('test_materials').get();
  const mathTests = testSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.title.startsWith('数Ⅰ'));
  console.log('Math 1 tests count:', mathTests.length);
  const baseCodes = new Set(mathTests.map(t => t.title.split('_')[0]));
  console.log('Math 1 distinct base codes:', baseCodes.size);
  const arr = Array.from(baseCodes).sort();
  console.log('Max code:', arr[arr.length - 1]);
  console.log('Codes around 100:', arr.slice(-12));
}

checkMathUnmatched().catch(console.error);
