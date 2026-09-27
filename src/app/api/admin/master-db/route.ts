import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';

export async function GET() {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    
    const snapshot = await dbAdmin.collection('curriculum_db').get();
    const masterDb: any[] = [];
    
    snapshot.forEach((doc: any) => {
      masterDb.push({ id: doc.id, ...doc.data() });
    });

    return NextResponse.json({ success: true, masterDb });
  } catch (error: any) {
    console.error('Fetch Master DB Error:', error);
    return NextResponse.json({ error: 'Failed to fetch master DB' }, { status: 500 });
  }
}
