import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const v = url.searchParams.get('v');

    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    const docRef = dbAdmin.collection('test_materials').doc(id);
    const docSnap = await docRef.get();
    
    if (!docSnap.exists) {
      return NextResponse.json({ error: 'Test material not found' }, { status: 404 });
    }
    
    const data = docSnap.data() as any;
    
    if (v !== null) {
      const vIndex = parseInt(v, 10);
      if (data.versions && data.versions[vIndex]) {
        return NextResponse.json({ 
          success: true, 
          material: { 
            ...data, 
            content: data.versions[vIndex].content, 
            importedAt: data.versions[vIndex].importedAt, 
            isVersion: true 
          } 
        });
      } else {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ success: true, material: data });
  } catch (error: any) {
    console.error('Fetch Test Material Error:', error);
    return NextResponse.json({ error: 'Failed to fetch test material' }, { status: 500 });
  }
}
