import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { getServerCache, setServerCache } from '@/lib/server-cache';

export async function GET(req: Request) {
  try {
    if (!dbAdmin) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });

    const url = new URL(req.url);
    const force = url.searchParams.get('refresh') === '1';

    if (!force) {
      const cached = getServerCache<any[]>('materials_list');
      if (cached) {
        return NextResponse.json({ success: true, materials: cached, cached: true });
      }
    }

    // We only fetch metadata to save bandwidth, not the actual content.
    const snapshot = await dbAdmin.collection('learning_materials').select('title', 'contentTitle', 'subject', 'importedAt', 'versions').get();

    const materials = snapshot.docs.map(doc => {
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

    setServerCache('materials_list', materials);

    return NextResponse.json({ success: true, materials });
  } catch (error: any) {
    console.error('Fetch Materials Error:', error);
    return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
  }
}
