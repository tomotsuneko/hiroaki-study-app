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

async function check() {
  const snapshot = await db.collection('learning_materials').select('subject').get();
  const s = new Set();
  snapshot.docs.forEach(d => {
    s.add(d.data().subject);
  });
  console.log('Subjects in DB:', Array.from(s));
}

check().catch(console.error);
