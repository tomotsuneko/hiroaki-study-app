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
  const snapshot = await db.collection('learning_materials').limit(1).get();
  if (!snapshot.empty) {
    const data = snapshot.docs[0].data();
    console.log("Title:", data.title);
    const content = data.content;
    
    // Print the first 1000 characters
    console.log(content.substring(0, 1000));
    
    fs.writeFileSync('sample_material.html', content);
  } else {
    console.log("No materials found");
  }
}

check().catch(console.error);
