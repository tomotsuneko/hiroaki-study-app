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

const BASE_EXPORT_DIR = 'G:\\Claude\\return_hs_eigo_all_20261028_1451\\export';

const TARGET_FOLDERS = [
  {
    folder: 'hs_eigo1_ec1_single_r20261014',
    categoryName: '英語コミュニケーションⅠ',
    prefix: '英Ⅰ',
  },
  {
    folder: 'hs_eigo1_lr1_single_r20261021',
    categoryName: '論理・表現Ⅰ',
    prefix: '論Ⅰ',
  },
  {
    folder: 'hs_eigo2_ec2_single_r20261028',
    categoryName: '英語コミュニケーションⅡ',
    prefix: '英Ⅱ',
  },
];

async function run() {
  console.log('🚀 Starting import of English learning materials...\n');

  const materialsToImport = [];

  for (const item of TARGET_FOLDERS) {
    const folderPath = path.join(BASE_EXPORT_DIR, item.folder);
    if (!fs.existsSync(folderPath)) {
      throw new Error(`Directory not found: ${folderPath}`);
    }

    const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.html'));
    files.sort();
    console.log(`📁 ${item.categoryName} (${item.folder}): found ${files.length} HTML files.`);

    for (const filename of files) {
      const fullPath = path.join(folderPath, filename);
      const content = fs.readFileSync(fullPath, 'utf8');
      const title = filename.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      let contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : title;
      contentTitle = contentTitle.split('|')[0].trim();

      materialsToImport.push({
        folder: item.folder,
        categoryName: item.categoryName,
        filename,
        title,
        contentTitle,
        content,
        size: content.length,
      });
    }
  }

  console.log(`\n📊 Total materials to import: ${materialsToImport.length} files.`);
  console.log(`First 3:`, materialsToImport.slice(0, 3).map((m) => `${m.title} (${m.contentTitle})`));
  console.log(`Last 3:`, materialsToImport.slice(-3).map((m) => `${m.title} (${m.contentTitle})`));

  const materialsRef = db.collection('learning_materials');
  const now = new Date().toISOString();

  const BATCH_SIZE = 30; // Safe batch size avoiding Firestore 10MB payload limit
  let processedCount = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (let i = 0; i < materialsToImport.length; i++) {
    const item = materialsToImport[i];
    const docRef = materialsRef.doc(item.title);

    // Fetch existing document to preserve version history
    const docSnap = await docRef.get();
    let versions = [];
    if (docSnap.exists) {
      const existingData = docSnap.data();
      versions = existingData.versions || [];
      if (existingData.content) {
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
        subject: 'high_school_英語',
        subjectName: '英語',
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

  console.log(`\n✅ Successfully imported all ${processedCount} English learning materials into Firestore!`);

  // Verification
  console.log('\n🔍 Verifying imported materials in Firestore...');
  const countSnap = await materialsRef
    .where('subject', '==', 'high_school_英語')
    .select('title', 'contentTitle', 'importedAt')
    .get();

  console.log(`Total materials in Firestore for high_school_英語: ${countSnap.size}`);
  const sampleDocs = countSnap.docs.map((d) => d.data().title);
  const ec1Count = sampleDocs.filter((t) => t.startsWith('英Ⅰ')).length;
  const lr1Count = sampleDocs.filter((t) => t.startsWith('論Ⅰ')).length;
  const ec2Count = sampleDocs.filter((t) => t.startsWith('英Ⅱ')).length;
  console.log(`Breakdown -> 英Ⅰ: ${ec1Count}, 論Ⅰ: ${lr1Count}, 英Ⅱ: ${ec2Count}`);
}

run().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
