import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST() {
  try {
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin is not initialized.' }, { status: 500 });
    }

    const materialsDir = path.join(process.cwd(), 'src/data/materials');
    
    if (!fs.existsSync(materialsDir)) {
      fs.mkdirSync(materialsDir, { recursive: true });
    }

    const files = fs.readdirSync(materialsDir);
    const htmlFiles = files.filter(f => f.endsWith('.html') || f.endsWith('.htm'));

    if (htmlFiles.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No HTML files found in src/data/materials',
        importedCount: 0 
      });
    }

    const batch = dbAdmin.batch();
    const materialsRef = dbAdmin.collection('learning_materials');
    
    let count = 0;
    
    for (const file of htmlFiles) {
      const filePath = path.join(materialsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      const title = file.replace(/\.html?$/, '');
      
      const docRef = materialsRef.doc(title);
      batch.set(docRef, {
        title,
        content,
        filename: file,
        type: 'html',
        importedAt: new Date().toISOString()
      }, { merge: true });
      
      count++;
      
      // Firestore batch size limit is 500
      if (count % 400 === 0) {
        await batch.commit();
      }
    }
    
    if (count % 400 !== 0) {
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${count} HTML files to Firestore.`,
      importedCount: count
    });
    
  } catch (error: any) {
    console.error('Error importing materials:', error);
    return NextResponse.json(
      { error: 'Failed to import materials: ' + error.message },
      { status: 500 }
    );
  }
}
