import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET() {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    // We only fetch metadata to save bandwidth, not the actual content.
    const snapshot = await dbAdmin.collection('test_materials').select('title', 'contentTitle', 'subject', 'importedAt', 'versions').get();
    
    const tests = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title,
        contentTitle: data.contentTitle || '',
        subject: data.subject || '未分類',
        importedAt: data.importedAt,
        versions: (data.versions || []).map((v: any) => ({ importedAt: v.importedAt }))
      };
    });

    return NextResponse.json({ success: true, tests });
  } catch (error: any) {
    console.error('Fetch Tests Error:', error);
    return NextResponse.json({ error: 'Failed to fetch tests' }, { status: 500 });
  }
}
