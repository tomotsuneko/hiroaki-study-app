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

const db = getFirestore();

async function fixDuplicates() {
  const snapshot = await db.collection('learning_materials').get();
  
  const docs = snapshot.docs;
  const legacyDocs = []; // Docs with ID starting with 'hs_' etc.
  const newDocs = []; // Docs with ID == title
  
  // Categorize
  docs.forEach(doc => {
    const data = doc.data();
    if (doc.id !== data.title && doc.id.startsWith('hs_')) {
      legacyDocs.push({ id: doc.id, ref: doc.ref, data });
    } else {
      newDocs.push({ id: doc.id, ref: doc.ref, data });
    }
  });
  
  let batch = db.batch();
  let count = 0;
  
  for (const legacy of legacyDocs) {
    // Find matching new doc by title
    const match = newDocs.find(n => n.data.title === legacy.data.title);
    
    if (match) {
      console.log(`Merging ${legacy.id} into ${match.id}`);
      const newVersions = match.data.versions || [];
      
      // Check if it's already in the versions array to prevent double merging
      const isAlreadyMerged = newVersions.some((v) => v.importedAt === legacy.data.importedAt);
      
      if (!isAlreadyMerged) {
        newVersions.push({
          content: legacy.data.content,
          importedAt: legacy.data.importedAt
        });
        
        // Sort by importedAt descending
        newVersions.sort((a, b) => new Date(b.importedAt).getTime() - new Date(a.importedAt).getTime());
        
        // Limit to 2 versions
        if (newVersions.length > 2) {
          newVersions.splice(2); // keep only 0 and 1
        }
        
        batch.update(match.ref, { versions: newVersions });
        match.data.versions = newVersions; // Update local state for next iterations if any
      }
      
      // Delete the legacy document
      batch.delete(legacy.ref);
      count++;
    } else {
      // If there is NO new document (they didn't re-upload this one yet)
      // We should probably just rename the document ID so it matches the new convention?
      // Wait, the user said "10/2にインポートしたものと本日インポートしたものをきちんとマッチングし..."
      // So I will rename the ID of the legacy doc to its title!
      console.log(`Renaming ${legacy.id} to ${legacy.data.title}`);
      
      // Firestore cannot rename IDs, we must create a new doc and delete the old one.
      const newRef = db.collection('learning_materials').doc(legacy.data.title);
      batch.set(newRef, legacy.data);
      batch.delete(legacy.ref);
      
      // Add to newDocs so subsequent matches find it if needed
      newDocs.push({ id: legacy.data.title, ref: newRef, data: legacy.data });
      count++;
    }
    
    if (count % 20 === 0) {
        await batch.commit();
        console.log(`Committed ${count} operations so far`);
        batch = db.batch();
    }
  }
  
  if (count % 20 !== 0) {
      await batch.commit();
  }
  
  console.log(`Done. Processed ${count} legacy documents.`);
}

fixDuplicates().catch(console.error);
