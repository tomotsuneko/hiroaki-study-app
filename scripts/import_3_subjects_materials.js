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

const TARGET_SETS = [
  {
    folder: 'g:\\Claude\\kit_hs_kokugo_all_20261102_1620\\return_hs_kokugo_all_gengo_20261108_0319\\export\\hs_kokugo_gengobunka_single_r20261108',
    categoryName: '言語文化',
    subject: 'high_school_国語',
    subjectName: '国語',
    prefix: '言文',
  },
  {
    folder: 'g:\\Claude\\kit_hs_kokugo_all_20261102_1620\\curriculum_map\\export\\hs_kokugo_gendaikokugo_single_r20261103',
    categoryName: '現代の国語',
    subject: 'high_school_国語',
    subjectName: '国語',
    prefix: '現国',
  },
  {
    folder: 'g:\\Claude\\Claude\\return_hs_eigo_all_20261103_0000\\export\\hs_ronhyo23_lr2_single_r20261102',
    categoryName: '論理・表現Ⅱ',
    subject: 'high_school_英語',
    subjectName: '英語',
    prefix: '論Ⅱ',
  },
];

async function run() {
  console.log('🚀 Starting import of 3 subject materials (言語文化, 現代の国語, 論理・表現Ⅱ)...\n');

  const materialsToImport = [];

  for (const item of TARGET_SETS) {
    if (!fs.existsSync(item.folder)) {
      throw new Error(`Directory not found: ${item.folder}`);
    }

    const files = fs.readdirSync(item.folder).filter((f) => f.endsWith('.html'));
    files.sort();
    console.log(`📁 ${item.categoryName} (${item.prefix}): found ${files.length} HTML files in ${item.folder}`);

    for (const filename of files) {
      const fullPath = path.join(item.folder, filename);
      const content = fs.readFileSync(fullPath, 'utf8');
      const title = filename.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      let contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : title;
      contentTitle = contentTitle.split('|')[0].trim();

      materialsToImport.push({
        categoryName: item.categoryName,
        subject: item.subject,
        subjectName: item.subjectName,
        prefix: item.prefix,
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

  const BATCH_SIZE = 25; // Safe batch size
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
  console.log('\n🔍 Verifying imported materials in Firestore...');
  const kokugoSnap = await db.collection('learning_materials').where('subject', '==', 'high_school_国語').get();
  console.log(`Total materials in Firestore for high_school_国語: ${kokugoSnap.size}`);
  const kokugoTitles = kokugoSnap.docs.map((d) => d.data().title);
  const genCount = kokugoTitles.filter((t) => t.startsWith('言文')).length;
  const gendaiCount = kokugoTitles.filter((t) => t.startsWith('現国')).length;
  console.log(`  Breakdown -> 言文: ${genCount}, 現国: ${gendaiCount}`);

  const eigoSnap = await db.collection('learning_materials').where('subject', '==', 'high_school_英語').get();
  console.log(`Total materials in Firestore for high_school_英語: ${eigoSnap.size}`);
  const eigoTitles = eigoSnap.docs.map((d) => d.data().title);
  const lr2Count = eigoTitles.filter((t) => t.startsWith('論Ⅱ')).length;
  console.log(`  Breakdown -> 論Ⅱ: ${lr2Count}`);
}

run().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
