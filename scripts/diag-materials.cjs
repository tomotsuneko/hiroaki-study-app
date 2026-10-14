// Diagnostic: compare curriculum_db subjects vs learning_materials subject field
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

(async () => {
  const cur = await db.collection('curriculum_db').get();
  console.log('=== curriculum_db ===');
  cur.forEach(d => {
    const x = d.data();
    console.log(JSON.stringify({ id: d.id, subjectName: x.subjectName, level: x.level }));
  });

  const mats = await db.collection('learning_materials').select('title', 'subject', 'importedAt').get();
  const bySubject = {};
  mats.forEach(d => {
    const s = d.data().subject || '(none)';
    bySubject[s] = bySubject[s] || [];
    bySubject[s].push(d.data().title);
  });
  console.log('=== learning_materials by subject field ===');
  for (const [s, titles] of Object.entries(bySubject)) {
    console.log(JSON.stringify({ subject: s, count: titles.length, sample: titles.slice(0, 3) }));
  }
})().catch(e => { console.error(e); process.exit(1); });
