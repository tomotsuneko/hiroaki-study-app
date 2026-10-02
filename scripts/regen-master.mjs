import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';

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
const dbAdmin = getFirestore();

const getBaseSubject = (filename) => {
  if (filename.includes('国語')) return '国語';
  if (filename.includes('数学')) return '数学';
  if (filename.includes('英語')) return '英語';
  if (filename.includes('理科') || filename.includes('物理') || filename.includes('化学') || filename.includes('生物') || filename.includes('地学')) return '理科';
  if (filename.includes('社会') || filename.includes('歴史') || filename.includes('地理') || filename.includes('公民') || filename.includes('日本史') || filename.includes('世界史') || filename.includes('政治・経済')) return '社会';
  if (filename.includes('情報')) return '情報';
  return 'その他';
};

async function run() {
  const dir = path.join(process.cwd(), 'src', 'data', 'master_curriculum');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== '00_一覧.md');
  
  const dbData = {};

  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    
    let level = '';
    if (file.startsWith('中学校_')) level = 'junior_high';
    else if (file.startsWith('高等学校_')) level = 'high_school';
    
    const baseSubj = getBaseSubject(file);
    const docId = `${level}_${baseSubj}`;
    
    if (!dbData[docId]) {
      dbData[docId] = { id: docId, level, subjectName: baseSubj, largeCategories: [] };
    }
    
    const lines = content.split('\n');
    let currentLarge = null;
    let currentMedium = null;
    let inTable = false;
    
    for (const line of lines) {
      if (line.startsWith('## ') && !line.match(/^##\s+[0-9]+\./)) {
        let title = line.replace('## ', '').trim();
        title = title.split('（')[0].trim();
        currentLarge = { name: title, mediumCategories: [] };
        dbData[docId].largeCategories.push(currentLarge);
        currentMedium = null;
        inTable = false;
      } else if (line.startsWith('### ')) {
        let title = line.replace('### ', '').trim();
        title = title.split('（')[0].trim();
        currentMedium = { name: title, smallCategories: [] };
        if (currentLarge) {
          currentLarge.mediumCategories.push(currentMedium);
        }
        inTable = false;
      } else if (line.startsWith('|')) {
        if (line.includes('| ID |') || line.includes('|---|')) {
          inTable = true;
          continue;
        }
        if (inTable && currentMedium) {
          const parts = line.split('|');
          if (parts.length > 3) {
            const idItem = parts[1].trim();
            const smallItem = parts[3].trim();
            if (smallItem && smallItem !== '') {
              currentMedium.smallCategories.push({
                id: idItem,
                title: smallItem
              });
            }
          }
        }
      } else {
        if (line.trim() === '') {
          inTable = false;
        }
      }
    }
  }

  const batch = dbAdmin.batch();
  
  const snapshot = await dbAdmin.collection('curriculum_db').get();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  for (const docId of Object.keys(dbData)) {
    const subjectData = dbData[docId];
    const docRef = dbAdmin.collection('curriculum_db').doc(docId);
    batch.set(docRef, subjectData);
  }

  await batch.commit();
  console.log('Successfully generated syllabus into DB.');
}

run().catch(console.error);
