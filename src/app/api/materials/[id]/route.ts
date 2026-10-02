import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    // We search for a doc where title == id
    const snapshot = await dbAdmin.collection('learning_materials').where('title', '==', id).limit(1).get();
    
    if (snapshot.empty) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, material: snapshot.docs[0].data() });
  } catch (error: any) {
    console.error('Fetch Material Error:', error);
    return NextResponse.json({ error: 'Failed to fetch material' }, { status: 500 });
  }
}
