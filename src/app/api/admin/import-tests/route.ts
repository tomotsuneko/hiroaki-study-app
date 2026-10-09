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
    const testsRef = dbAdmin.collection('test_materials');
    
    let count = 0;
    
    for (const file of files) {
      const content = await file.text();
      const title = file.name.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : '';
      
      const docRef = testsRef.doc(title);
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
        contentTitle,
        content,
        filename: file.name,
        type: 'html',
        subject: subjectName,
        importedAt: new Date().toISOString(),
        versions
      }, { merge: true });
      
      count++;
      
      if (count % 400 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();

    return NextResponse.json({ 
      success: true, 
      importedCount: count 
    });

  } catch (error: any) {
    console.error('Import Tests Error:', error);
    return NextResponse.json({ error: 'Failed to import tests: ' + error.message }, { status: 500 });
  }
}
