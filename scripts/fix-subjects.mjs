import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
import fs from 'fs';

config({ path: '.env.local' });

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

const getBaseSubject = (id) => {
  if (id.includes('kokugo') || id.includes('bunkoku') || id.includes('koten') || id.includes('ronkoku')) return '国語';
  if (id.includes('math')) return '数学';
  if (id.includes('eigo') || id.includes('ronhyo')) return '英語';
  if (id.includes('butsuri') || id.includes('chigaku') || id.includes('kagaku') || id.includes('seibutsu')) return '理科';
  if (id.includes('chiri') || id.includes('kokyo') || id.includes('nihonshi') || id.includes('rekishisogo') || id.includes('seikei') || id.includes('sekaishi')) return '社会';
  if (id.includes('info')) return '情報';
  return 'その他';
};

async function fix() {
  const snapshot = await db.collection('learning_materials').get();
  const batch = db.batch();
  let count = 0;
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.subject && data.subject.startsWith('hs_')) {
      const newSubj = getBaseSubject(data.subject);
      batch.update(doc.ref, { subject: newSubj });
      count++;
    }
  });
  
  if (count > 0) {
    await batch.commit();
    console.log(`Updated ${count} documents.`);
  } else {
    console.log('No documents needed update.');
  }
}

fix().catch(console.error);
