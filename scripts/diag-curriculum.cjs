// Diagnostic: inspect curriculum hierarchy and how material titles map to it
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
initializeApp({ credential: cert({
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
}) });
const db = getFirestore();

(async () => {
  const cur = await db.collection('curriculum_db').get();
  cur.forEach(d => {
    const x = d.data();
    console.log(`\n### ${d.id}  keys=${Object.keys(x).join(',')}`);
    (x.largeCategories || []).forEach(l => {
      const mids = l.mediumCategories || [];
      const smalls = mids.reduce((n, m) => n + (m.smallCategories || []).length, 0);
      console.log(`  L: ${l.name} | keys=${Object.keys(l).join(',')} | mid=${mids.length} small=${smalls}`);
      if (d.id === 'high_school_数学' && /A|Ａ/.test(l.name)) {
        mids.slice(0, 2).forEach(m => console.log(`     M: ${m.name} keys=${Object.keys(m).join(',')} -> ${JSON.stringify((m.smallCategories || []).slice(0, 3))}`));
      }
    });
  });

  const mats = await db.collection('learning_materials').select('title', 'contentTitle', 'subject').get();
  const prefixes = {};
  mats.forEach(d => {
    const t = d.data().title || '';
    const p = t.replace(/-\d+$/, '');
    prefixes[p] = (prefixes[p] || 0) + 1;
  });
  console.log('\n=== material title prefixes ===');
  console.log(JSON.stringify(prefixes));
  const samples = mats.docs.filter(d => /^数Ａ-00[1-3]$|^物基-00[1-3]$|^数Ⅰ-00[1-3]$/.test(d.data().title));
  samples.forEach(d => console.log(JSON.stringify(d.data())));
})().catch(e => { console.error(e); process.exit(1); });
