import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getServerCache, setServerCache } from '@/lib/server-cache';

export async function GET(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === '1';

    if (!force) {
      const cached = getServerCache<any[]>('master_db');
      if (cached) {
        return NextResponse.json({ success: true, masterDb: cached, cached: true });
      }
    }

    const snapshot = await dbAdmin.collection('curriculum_db').get();
    const masterDb: any[] = [];

    snapshot.forEach((doc: any) => {
      masterDb.push({ id: doc.id, ...doc.data() });
    });

    setServerCache('master_db', masterDb);

    return NextResponse.json({ success: true, masterDb });
  } catch (error: any) {
    console.error('Fetch Master DB Error:', error);
    return NextResponse.json({ error: 'Failed to fetch master DB' }, { status: 500 });
  }
}
