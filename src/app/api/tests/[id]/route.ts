import { NextResponse } from 'next/server';
import { dbAdmin } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';

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
    let content = data.content;
    let isVersion = false;
    
    if (v !== null) {
      const vIndex = parseInt(v, 10);
      if (data.versions && data.versions[vIndex]) {
        content = data.versions[vIndex].content;
        isVersion = true;
      } else {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }
    }

    // ユーザーの保存済み回答履歴を取得
    const cookieStore = await cookies();
    const userId = cookieStore.get('study_user_id')?.value;
    let savedRecord = null;

    if (userId) {
      try {
        const recordSnap = await dbAdmin
          .collection('users')
          .doc(userId)
          .collection('test_results')
          .doc(id)
          .get();

        if (recordSnap.exists) {
          savedRecord = recordSnap.data();
        }
      } catch (err) {
        console.warn('Failed to load user test result:', err);
      }
    }

    // ブリッジスクリプトの注入
    const bridgeScript = `
<script id="__abiko_test_bridge__">
(function() {
  var TEST_ID = ${JSON.stringify(id)};
  var META = ${JSON.stringify({
    id: data.id || id,
    title: data.title || id,
    contentTitle: data.contentTitle || '',
    subject: data.subject || 'high_school_数学'
  })};
  var SAVED_RECORD = ${JSON.stringify(savedRecord || null)};

  // 1. サーバー保存データがあれば localStorage に注入（初回復元）
  if (SAVED_RECORD && SAVED_RECORD.key && SAVED_RECORD.payload) {
    try {
      localStorage.setItem(SAVED_RECORD.key, JSON.stringify(SAVED_RECORD.payload));
    } catch(e) {
      console.warn('Initial localStorage set failed', e);
    }
  }

  // 2. localStorage.setItem をフックして親ウィンドウにリアルタイム通知
  try {
    var origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(k, v) {
      origSetItem(k, v);
      try {
        if (k && k.indexOf('qpack') !== -1) {
          var payload = JSON.parse(v);
          window.parent.postMessage({
            type: 'TEST_RECORD_UPDATE',
            testId: TEST_ID,
            key: k,
            payload: payload,
            meta: META
          }, '*');
        }
      } catch(err) {
        console.warn('Bridge postMessage error:', err);
      }
    };
  } catch(e) {
    console.warn('Bridge hook error:', e);
  }
})();
</script>
`;

    if (content && typeof content === 'string') {
      if (content.includes('<head>')) {
        content = content.replace('<head>', '<head>' + bridgeScript);
      } else if (content.includes('<!DOCTYPE html>')) {
        content = content.replace('<!DOCTYPE html>', '<!DOCTYPE html>' + bridgeScript);
      } else {
        content = bridgeScript + content;
      }
    }

    return NextResponse.json({
      success: true,
      material: {
        ...data,
        content,
        importedAt: isVersion ? data.versions[parseInt(v!, 10)].importedAt : data.importedAt,
        isVersion,
        userRecord: savedRecord
      }
    });
  } catch (error: any) {
    console.error('Fetch Test Material Error:', error);
    return NextResponse.json({ error: 'Failed to fetch test material' }, { status: 500 });
  }
}
