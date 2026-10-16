'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function MaterialPreview() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const v = searchParams.get('v');
  const type = searchParams.get('type');
  
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVersion, setIsVersion] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!id) return;
    
    async function fetchMaterial() {
      try {
        const baseEndpoint = type === 'test' ? '/api/tests' : '/api/materials';
        const url = `${baseEndpoint}/${encodeURIComponent(id)}${v !== null ? `?v=${v}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && data.material) {
          setHtmlContent(data.material.content); // Use full HTML content to preserve styles
          setIsVersion(data.material.isVersion || false);
        } else {
          setError(data.error || 'コンテンツが見つかりません');
        }
      } catch (err) {
        setError('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    }
    
    fetchMaterial();
  }, [id, v, type]);

  // テストプレビュー時のリアルタイム採点・回答同期
  useEffect(() => {
    if (type !== 'test') return;

    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== 'TEST_RECORD_UPDATE') return;

      const answers = data.payload?.answers || {};
      const answered = Object.values(answers).filter((a: any) => a?.attempts > 0).length;
      const correct = Object.values(answers).filter((a: any) => a?.correct).length;

      setSyncNotice(`採点同期中... (回答: ${answered}問 / 正解: ${correct}問)`);

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const res = await fetch('/api/tests/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              testId: id,
              key: data.key,
              payload: data.payload,
              meta: {
                title: id,
                subject: 'high_school_数学'
              }
            })
          });
          if (res.ok) {
            setSyncNotice(`✅ 採点・実績をユーザーデータに保存しました (${answered}問回答済)`);
            setTimeout(() => setSyncNotice(null), 4000);
          }
        } catch (err) {
          console.warn('Sync failed in preview:', err);
          setSyncNotice('⚠️ 同期エラー');
        }
      }, 500);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [id, type]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red', fontFamily: 'sans-serif' }}>{error}</div>;

  return (
    <div style={{ backgroundColor: 'white', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => router.back()} 
            style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', cursor: 'pointer', backgroundColor: 'white', fontWeight: 'bold' }}
          >
            ← 管理画面に戻る
          </button>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#1E293B' }}>{decodeURIComponent(id)}</span>
          {type === 'test' && (
            <span style={{ fontSize: '0.78rem', padding: '2px 8px', backgroundColor: '#EFF6FF', color: '#2563EB', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #BFDBFE' }}>
              📝 テストプレビュー (自動採点連動)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {syncNotice && (
            <span style={{ padding: '4px 12px', backgroundColor: '#DCFCE7', color: '#15803D', borderRadius: '16px', fontSize: '0.85rem', fontWeight: 'bold' }}>
              {syncNotice}
            </span>
          )}
          {isVersion && (
            <span style={{ padding: '6px 16px', backgroundColor: '#FEF08A', color: '#854D0E', borderRadius: '20px', fontSize: '0.9rem', fontWeight: 'bold' }}>
              ⚠️ 過去のバージョンをプレビュー中
            </span>
          )}
        </div>
      </div>
      
      {/* 
        iframeのsrcDocにHTMLをそのまま流し込むことで、
        Next.js側のCSSの影響を一切受けず、元のHTMLのデザイン・数式スクリプトが100%再現されます。
      */}
      <iframe
        srcDoc={htmlContent || ''}
        style={{ flex: 1, width: '100%', border: 'none', backgroundColor: 'white' }}
        title="Material Content"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
