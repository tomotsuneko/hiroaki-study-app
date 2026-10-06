import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
config({ path: '.env.local' });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) });
const db = getFirestore();

async function fixSubj() {
  const snapshot = await db.collection('learning_materials').get();
  const batch = db.batch();
  let count = 0;
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.subject === '数学') { batch.update(doc.ref, { subject: 'high_school_数学' }); count++; }
    if (data.subject === '国語') { batch.update(doc.ref, { subject: 'high_school_国語' }); count++; }
    if (data.subject === '英語') { batch.update(doc.ref, { subject: 'high_school_英語' }); count++; }
    if (data.subject === '理科') { batch.update(doc.ref, { subject: 'high_school_理科' }); count++; }
    if (data.subject === '社会') { batch.update(doc.ref, { subject: 'high_school_社会' }); count++; }
    if (data.subject === '情報') { batch.update(doc.ref, { subject: 'high_school_情報' }); count++; }
  });
  if (count > 0) {
    await batch.commit();
    console.log(`Updated ${count} documents.`);
  }
}
fixSubj().catch(console.error);
