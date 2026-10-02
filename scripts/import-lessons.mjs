import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!getApps().length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  } else {
    throw new Error('Missing Firebase credentials in .env.local');
  }
}

const db = getFirestore();

async function importLessons() {
  const baseDir = path.join(process.cwd(), 'Study_Lesson', 'lessons');
  const subjects = fs.readdirSync(baseDir).filter(f => fs.statSync(path.join(baseDir, f)).isDirectory() && f !== 'assets');
  
  let totalCount = 0;
  
  for (const subject of subjects) {
    const subjectDir = path.join(baseDir, subject);
    const files = fs.readdirSync(subjectDir).filter(f => f.endsWith('.html'));
    
    if (files.length === 0) continue;
    
    console.log(`Processing subject: ${subject} (${files.length} files)`);
    
    const batch = db.batch();
    let count = 0;
    
    for (const file of files) {
      const filePath = path.join(subjectDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const title = file.replace(/\.html?$/, '');
      
      const docRef = db.collection('learning_materials').doc(`${subject}_${title}`);
      batch.set(docRef, {
        title,
        subject,
        content,
        filename: file,
        type: 'html',
        importedAt: new Date().toISOString()
      }, { merge: true });
      
      count++;
      totalCount++;
      
      if (count % 400 === 0) {
        await batch.commit();
        console.log(`  Committed ${count} files for ${subject}`);
      }
    }
    
    if (count % 400 !== 0) {
      await batch.commit();
      console.log(`  Committed ${count} files for ${subject}`);
    }
  }
  
  console.log(`Finished! Total imported: ${totalCount}`);
}

importLessons().catch(console.error);
