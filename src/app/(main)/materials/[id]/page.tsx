'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function MaterialViewer() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const v = searchParams.get('v');
  
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVersion, setIsVersion] = useState(false);

  useEffect(() => {
    if (!id) return;
    
    async function fetchMaterial() {
      try {
        const url = `/api/materials/${encodeURIComponent(id)}${v !== null ? `?v=${v}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && data.material) {
          let content = data.material.content;
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          if (bodyMatch && bodyMatch[1]) {
            content = bodyMatch[1];
          }
          setHtmlContent(content);
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
  }, [id, v]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>{error}</div>;

  return (
    <div style={{ backgroundColor: 'white', minHeight: '100vh', padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <button 
          onClick={() => router.back()} 
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', cursor: 'pointer', backgroundColor: '#F8FAFC' }}
        >
          ← 戻る
        </button>
        {isVersion && (
          <span style={{ padding: '4px 12px', backgroundColor: '#FEF08A', color: '#854D0E', borderRadius: '16px', fontSize: '0.9rem', fontWeight: 'bold' }}>
            ⚠️ 過去のバージョンを表示中
          </span>
        )}
      </div>
      <div 
        dangerouslySetInnerHTML={{ __html: htmlContent || '' }}
        className="material-content"
      />
    </div>
  );
}
