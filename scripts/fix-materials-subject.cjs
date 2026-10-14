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
  const snapshot = await db.collection('learning_materials').get();
  let updatedCount = 0;
  const batch = db.batch();

  snapshot.forEach(doc => {
    const data = doc.data();
    const currentSubject = data.subject;
    let newSubject = null;

    if (currentSubject === '数学' || (!currentSubject?.startsWith('high_school_') && doc.id.startsWith('数'))) {
      newSubject = 'high_school_数学';
    } else if (currentSubject === '理科' || (!currentSubject?.startsWith('high_school_') && (doc.id.startsWith('物基') || doc.id.startsWith('化基') || doc.id.startsWith('生基') || doc.id.startsWith('地基') || doc.id.startsWith('物理') || doc.id.startsWith('化学')))) {
      newSubject = 'high_school_理科';
    } else if (currentSubject === '国語' || (!currentSubject?.startsWith('high_school_') && (doc.id.startsWith('現国') || doc.id.startsWith('言文') || doc.id.startsWith('古探') || doc.id.startsWith('文国') || doc.id.startsWith('論国')))) {
      newSubject = 'high_school_国語';
    } else if (currentSubject === '社会' || (!currentSubject?.startsWith('high_school_') && (doc.id.startsWith('世探') || doc.id.startsWith('日探') || doc.id.startsWith('地探') || doc.id.startsWith('地総') || doc.id.startsWith('公共') || doc.id.startsWith('倫理') || doc.id.startsWith('政経') || doc.id.startsWith('歴総')))) {
      newSubject = 'high_school_社会';
    } else if (currentSubject === '英語' || (!currentSubject?.startsWith('high_school_') && doc.id.startsWith('英'))) {
      newSubject = 'high_school_英語';
    } else if (currentSubject === '情報' || (!currentSubject?.startsWith('high_school_') && doc.id.startsWith('情'))) {
      newSubject = 'high_school_情報';
    }

    if (newSubject && newSubject !== currentSubject) {
      batch.update(doc.ref, { 
        subject: newSubject,
        subjectName: data.subjectName || currentSubject
      });
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`Successfully migrated ${updatedCount} documents.`);
  } else {
    console.log('No documents needed migration.');
  }
})().catch(e => {
  console.error(e);
  process.exit(1);
});
