import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const v = url.searchParams.get('v'); // Version index (0 is oldest, etc. or index in versions array)

    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    const docRef = dbAdmin.collection('learning_materials').doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    
    const data = docSnap.data() as any;
    
    if (v !== null) {
      const vIndex = parseInt(v, 10);
      if (data.versions && data.versions[vIndex]) {
        // Return the specific version
        return NextResponse.json({ success: true, material: { ...data, content: data.versions[vIndex].content, importedAt: data.versions[vIndex].importedAt, isVersion: true } });
      } else {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true, material: data });
  } catch (error: any) {
    console.error('Fetch Material Error:', error);
    return NextResponse.json({ error: 'Failed to fetch material' }, { status: 500 });
  }
}
