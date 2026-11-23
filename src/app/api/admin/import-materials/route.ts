import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { requireAdminSession } from '@/lib/session';

function compactOversizedHtml(content: string): string {
  if (Buffer.byteLength(content, 'utf8') <= 800000) return content;

  return content.replace(/data-states="([^"]*)"/g, (fullMatch, raw) => {
    try {
      const decoded = raw
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      const obj = JSON.parse(decoded);
      for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k].svg === 'string') {
          obj[k].svg = obj[k].svg
            .replace(/ data-(?:cop|role|spec|t0|t1)="[^"]*"/g, '')
            .replace(/(\d+\.\d)\d(?=[ ,<"])/g, '$1')
            .replace(/\.0(?=[ ,<"])/g, '');
        }
      }
      const serialized = JSON.stringify(obj)
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;');
      return `data-states='${serialized}'`;
    } catch {
      return fullMatch;
    }
  });
}

export async function POST(req: Request) {
  try {
    const adminSession = await requireAdminSession();
    if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin is not initialized.' }, { status: 500 });
    }

    const formData = await req.formData();
    const subject = formData.get('subject') as string;
    const subjectName = formData.get('subjectName') as string;
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
    }

    const batch = dbAdmin.batch();
    const materialsRef = dbAdmin.collection('learning_materials');
    
    let count = 0;
    
    for (const file of files) {
      const content = compactOversizedHtml(await file.text());
      const contentBytes = Buffer.byteLength(content, 'utf8');
      const title = file.name.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : '';
      
      const docRef = materialsRef.doc(title);
      const docSnap = await docRef.get();
      
      let versions: any[] = [];
      if (docSnap.exists) {
        const existingData = docSnap.data() as any;
        versions = existingData.versions || [];
        
        // Push the current existing data into the versions history
        versions.unshift({
          content: existingData.content,
          importedAt: existingData.importedAt || new Date().toISOString()
        });
        
        // Keep only the 2 most recent old versions (plus the active one, makes 3 total)
        if (versions.length > 2) {
          versions = versions.slice(0, 2);
        }

        // Keep total Firestore document size under 900 KB
        while (versions.length > 0) {
          const totalBytes =
            contentBytes +
            versions.reduce(
              (acc: number, v: any) => acc + Buffer.byteLength(v?.content || '', 'utf8'),
              0
            );
          if (totalBytes <= 900000) break;
          versions.pop();
        }
      }

      batch.set(docRef, {
        title,
        contentTitle,
        content,
        filename: file.name,
        type: 'html',
        subject,           // 科目ID（例: high_school_数学）※一覧のグルーピングキー
        subjectName,       // 表示名（例: 数学）
        importedAt: new Date().toISOString(),
        versions
      }, { merge: true });
      
      count++;
      
      // Batch writes can only contain up to 500 operations, 
      // but assuming they upload reasonably sized chunks for now.
      if (count % 400 === 0) {
        await batch.commit();
        // create new batch if needed in a more complex setup
      }
    }

    await batch.commit();
    const { invalidateServerCache } = await import('@/lib/server-cache');
    invalidateServerCache('materials_list');

    return NextResponse.json({ 
      success: true, 
      importedCount: count 
    });

  } catch (error: any) {
    console.error('Import Error:', error);
    return NextResponse.json({ error: 'Failed to import materials: ' + error.message }, { status: 500 });
  }
}
