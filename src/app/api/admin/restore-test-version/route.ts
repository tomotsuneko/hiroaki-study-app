import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const { id, versionIndex } = await req.json();

    const docRef = dbAdmin.collection('test_materials').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Test material not found' }, { status: 404 });
    }

    const data = docSnap.data() as any;
    if (!data.versions || !data.versions[versionIndex]) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const oldVersion = data.versions[versionIndex];
    
    // Push the current one into history and make the old version active
    let versions = data.versions || [];
    versions.unshift({
      content: data.content,
      importedAt: data.importedAt || new Date().toISOString()
    });

    // Remove the restored version from its old index
    versions.splice(versionIndex + 1, 1);
    
    if (versions.length > 2) {
      versions = versions.slice(0, 2);
    }

    await docRef.update({
      content: oldVersion.content,
      importedAt: oldVersion.importedAt || new Date().toISOString(),
      versions
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Restore Test Error:', error);
    return NextResponse.json({ error: 'Failed to restore test version' }, { status: 500 });
  }
}
