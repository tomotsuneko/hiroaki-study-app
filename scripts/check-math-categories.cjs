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

async function checkCurriculum() {
  const doc = await db.collection('curriculum_db').doc('high_school_数学').get();
  if (doc.exists) {
    const data = doc.data();
    console.log('high_school_数学 Large Categories:');
    (data.largeCategories || []).forEach(l => {
      let count = 0;
      (l.mediumCategories || []).forEach(m => count += (m.smallCategories || []).length);
      console.log(' - ' + l.name + ' (total smalls: ' + count + ')');
    });
  } else {
    console.log('high_school_数学 not found!');
  }
}

checkCurriculum().catch(console.error);
