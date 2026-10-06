import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin is not initialized.' }, { status: 500 });
    }

    const formData = await req.formData();
    const subject = formData.get('subject') as string;
    const subjectName = formData.get('subjectName') as string;
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
    }

    const batch = dbAdmin.batch();
    const materialsRef = dbAdmin.collection('learning_materials');
    
    let count = 0;
    
    for (const file of files) {
      const content = await file.text();
      const title = file.name.replace(/\.html?$/i, '');
      
      const docRef = materialsRef.doc(title);
      const docSnap = await docRef.get();
      
      let versions: any[] = [];
      if (docSnap.exists) {
        const existingData = docSnap.data() as any;
        versions = existingData.versions || [];
        
        // Push the current existing data into the versions history
        versions.unshift({
          content: existingData.content,
          importedAt: existingData.importedAt || new Date().toISOString()
        });
        
        // Keep only the 2 most recent old versions (plus the active one, makes 3 total)
        if (versions.length > 2) {
          versions = versions.slice(0, 2);
        }
      }

      batch.set(docRef, {
        title,
        content,
        filename: file.name,
        type: 'html',
        subject: subjectName,
        importedAt: new Date().toISOString(),
        versions
      }, { merge: true });
      
      count++;
      
      // Batch writes can only contain up to 500 operations, 
      // but assuming they upload reasonably sized chunks for now.
      if (count % 400 === 0) {
        await batch.commit();
        // create new batch if needed in a more complex setup
      }
    }

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      importedCount: count 
    });

  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json({ error: 'Failed to import materials: ' + error.message }, { status: 500 });
  }
}
