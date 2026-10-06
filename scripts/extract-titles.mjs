import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { config } from 'dotenv';
config({ path: '.env.local' });
if (!getApps().length) initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') }) });
const db = getFirestore();

async function extractTitles() {
  const snapshot = await db.collection('learning_materials').get();
  const batch = db.batch();
  let count = 0;
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (data.content) {
      const match = data.content.match(/<title>(.*?)<\/title>/i);
      if (match) {
        let contentTitle = match[1].split('｜')[0].trim();
        batch.update(doc.ref, { contentTitle });
        count++;
      }
    }
  });
  if (count > 0) {
    await batch.commit();
    console.log(`Updated ${count} documents with contentTitle.`);
  }
}
extractTitles().catch(console.error);
