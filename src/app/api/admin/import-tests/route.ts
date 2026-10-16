import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import JSZip from 'jszip';

export async function POST(req: Request) {
  try {
    if (!dbAdmin) {
      return NextResponse.json({ error: 'Firebase Admin is not initialized.' }, { status: 500 });
    }

    const formData = await req.formData();
    const subject = (formData.get('subject') as string) || 'high_school_数学';
    const subjectName = (formData.get('subjectName') as string) || '数学';
    const rawFiles = formData.getAll('files') as File[];

    if (!rawFiles || rawFiles.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
    }

    // 展開対象ファイルリスト（ファイル名とHTML文字列のペア）
    const htmlEntries: { filename: string; content: string }[] = [];

    for (const file of rawFiles) {
      if (file.name.endsWith('.zip') || file.type.includes('zip')) {
        // ZIPファイルの場合：サーバー側でも展開をサポート
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
          if (!zipEntry.dir && (relativePath.endsWith('.html') || relativePath.endsWith('.htm'))) {
            const baseName = relativePath.split('/').pop() || '';
            // 重複コピー（例: '...(1).html'）は除外
            if (/\(\d+\)\.html?$/i.test(baseName)) continue;
            const text = await zipEntry.async('text');
            htmlEntries.push({ filename: baseName, content: text });
          }
        }
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        // 重複コピー（例: '...(1).html'）は除外
        if (!/\(\d+\)\.html?$/i.test(file.name)) {
          const text = await file.text();
          htmlEntries.push({ filename: file.name, content: text });
        }
      }
    }

    if (htmlEntries.length === 0) {
      return NextResponse.json({ error: '有効なHTMLテストファイルが含まれていません。' }, { status: 400 });
    }

    const batch = dbAdmin.batch();
    const testsRef = dbAdmin.collection('test_materials');
    let count = 0;

    for (const entry of htmlEntries) {
      const content = entry.content;
      const title = entry.filename.replace(/\.html?$/i, '');
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const contentTitle = titleMatch ? titleMatch[1].split('｜')[0].trim() : '';

      const docRef = testsRef.doc(title);
      const docSnap = await docRef.get();

      let versions: any[] = [];
      if (docSnap.exists) {
        const existingData = docSnap.data() as any;
        versions = existingData.versions || [];

        versions.unshift({
          content: existingData.content,
          importedAt: existingData.importedAt || new Date().toISOString()
        });

        if (versions.length > 2) {
          versions = versions.slice(0, 2);
        }
      }

      batch.set(docRef, {
        title,
        contentTitle,
        content,
        filename: entry.filename,
        type: 'html',
        subject,
        subjectName,
        importedAt: new Date().toISOString(),
        versions
      }, { merge: true });

      count++;

      if (count % 400 === 0) {
        await batch.commit();
      }
    }

    await batch.commit();
    const { invalidateServerCache } = await import('@/lib/server-cache');
    invalidateServerCache('tests_list');

    return NextResponse.json({
      success: true,
      importedCount: count
    });

  } catch (error: any) {
    console.error('Import Tests Error:', error);
    return NextResponse.json({ error: 'Failed to import tests: ' + error.message }, { status: 500 });
  }
}
