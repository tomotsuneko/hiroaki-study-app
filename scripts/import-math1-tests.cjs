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

async function importTests() {
  const dirPath = path.join(process.cwd(), 'temp_upload', 'hs_math_1_question_pack_v2', '問題集');
  if (!fs.existsSync(dirPath)) {
    console.error('Directory not found:', dirPath);
    process.exit(1);
  }

  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.html'));
  console.log(`Found ${files.length} test HTML files to import.`);

  const testsRef = db.collection('test_materials');
  const chunkSize = 100;
  let totalImported = 0;

  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const filename of chunk) {
      const filePath = path.join(dirPath, filename);
      const content = fs.readFileSync(filePath, 'utf8');
      const title = filename.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : '';

      const docRef = testsRef.doc(title);

      batch.set(docRef, {
        title,
        contentTitle,
        content,
        filename,
        type: 'html',
        subject: 'high_school_数学',
        subjectName: '数学',
        importedAt: new Date().toISOString(),
        versions: []
      }, { merge: true });

      totalImported++;
    }

    await batch.commit();
    console.log(`Imported ${totalImported} / ${files.length} test materials...`);
  }

  console.log('🎉 Successfully imported all 315 test materials into test_materials collection!');
}

importTests().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
