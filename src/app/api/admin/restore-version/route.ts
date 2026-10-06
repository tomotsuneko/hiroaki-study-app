import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function POST(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const { id, versionIndex } = await req.json();

    const docRef = dbAdmin.collection('learning_materials').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }

    const data = docSnap.data() as any;
    if (!data.versions || !data.versions[versionIndex]) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    const oldVersion = data.versions[versionIndex];
    
    // We want to make the old version the current one, and push the current one into history
    let versions = data.versions || [];
    versions.unshift({
      content: data.content,
      importedAt: data.importedAt || new Date().toISOString()
    });

    // Remove the restored version from its old place in history, 
    // or just keep history as is and prune to max 2.
    // If we just prune to 2, the restored version might be duplicated or lost.
    // Let's filter out the restored version from the old array first:
    versions.splice(versionIndex + 1, 1); // +1 because we unshifted one element just above
    
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
    console.error('Restore Error:', error);
    return NextResponse.json({ error: 'Failed to restore version' }, { status: 500 });
  }
}
