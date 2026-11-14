const fs = require('fs');
const path = require('path');

const appDir = path.resolve(__dirname, '..');
const envStr = fs.readFileSync(path.join(appDir, '.env.local'), 'utf8');
const env = {};
for (const line of envStr.split('\n')) {
  const idx = line.indexOf('=');
  if (idx > -1 && !line.trim().startsWith('#')) {
    const k = line.slice(0, idx).trim();
    let v = line.slice(idx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[k] = v;
  }
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({
  credential: cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

const TARGET_FOLDER = 'G:\\Claude\\hs_kokugo_gengobunka_single_r20261108-20261114T111017Z-1-001\\hs_kokugo_gengobunka_single_r20261108';

async function run() {
  console.log('🚀 Starting import of 言語文化 (hs_kokugo_gengobunka_single_r20261108)...');
  console.log(`Source folder: ${TARGET_FOLDER}\n`);

  if (!fs.existsSync(TARGET_FOLDER)) {
    throw new Error(`Directory not found: ${TARGET_FOLDER}`);
  }

  const files = fs.readdirSync(TARGET_FOLDER).filter((f) => f.endsWith('.html'));
  files.sort();
  console.log(`Found ${files.length} HTML files.`);

  const materialsToImport = [];
  for (const filename of files) {
    const fullPath = path.join(TARGET_FOLDER, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const title = filename.replace(/\.html?$/i, '');
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    let contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : title;
    contentTitle = contentTitle.split('|')[0].trim();

    materialsToImport.push({
      categoryName: '言語文化',
      subject: 'high_school_国語',
      subjectName: '国語',
      prefix: '言文',
      filename,
      title,
      contentTitle,
      content,
      size: content.length,
    });
  }

  console.log(`Sample first item: ${materialsToImport[0].title} - ${materialsToImport[0].contentTitle}`);
  console.log(`Sample last item: ${materialsToImport[materialsToImport.length - 1].title} - ${materialsToImport[materialsToImport.length - 1].contentTitle}`);

  const materialsRef = db.collection('learning_materials');
  const now = new Date().toISOString();

  const BATCH_SIZE = 25;
  let processedCount = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (let i = 0; i < materialsToImport.length; i++) {
    const item = materialsToImport[i];
    const docRef = materialsRef.doc(item.title);

    const docSnap = await docRef.get();
    let versions = [];
    if (docSnap.exists) {
      const existingData = docSnap.data();
      versions = existingData.versions || [];
      if (existingData.content && existingData.content !== item.content) {
        versions.unshift({
          content: existingData.content,
          importedAt: existingData.importedAt || now,
        });
      }
      if (versions.length > 2) {
        versions = versions.slice(0, 2);
      }
    }

    batch.set(
      docRef,
      {
        title: item.title,
        contentTitle: item.contentTitle,
        content: item.content,
        filename: item.filename,
        type: 'html',
        subject: item.subject,
        subjectName: item.subjectName,
        importedAt: now,
        versions,
      },
      { merge: true }
    );

    batchCount++;
    processedCount++;

    if (batchCount >= BATCH_SIZE || i === materialsToImport.length - 1) {
      await batch.commit();
      console.log(`  💾 Committed batch (${processedCount} / ${materialsToImport.length})`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  console.log(`\n✅ Successfully imported all ${processedCount} materials into Firestore!`);

  // Verification
  console.log('\n🔍 Verifying in Firestore...');
  const snap = await db.collection('learning_materials').where('subject', '==', 'high_school_国語').get();
  console.log(`Total materials in Firestore for high_school_国語: ${snap.size}`);
  const titles = snap.docs.map((d) => d.data().title);
  const genbunkaCount = titles.filter((t) => t.startsWith('言文')).length;
  console.log(`  Breakdown -> 言文: ${genbunkaCount}`);
}

run().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
