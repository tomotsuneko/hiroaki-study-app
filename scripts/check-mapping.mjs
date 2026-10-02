import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

async function check() {
  const masterSnap = await dbAdmin.collection('curriculum_db').doc('high_school_数学').get();
  const data = masterSnap.data();
  
  const materialsSnap = await dbAdmin.collection('learning_materials').select('title').get();
  const materialIds = materialsSnap.docs.map(d => d.data().title);
  
  console.log('Total materials in DB:', materialIds.length);
  
  const sCat = data.largeCategories[0].mediumCategories[0].smallCategories[0];
  console.log('Sample category item from Master DB:', sCat);
  console.log('Does it match any material?', materialIds.includes(sCat.id));
}

check().catch(console.error);
