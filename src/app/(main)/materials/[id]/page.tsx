'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function MaterialViewer() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    
    async function fetchMaterial() {
      try {
        const res = await fetch(`/api/materials/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (data.success && data.material) {
          // Extract the body content from the HTML if it has <body> tags, 
          // or just use the whole content if not.
          let content = data.material.content;
          const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
          if (bodyMatch && bodyMatch[1]) {
            content = bodyMatch[1];
          }
          setHtmlContent(content);
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
  }, [id]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>{error}</div>;

  return (
    <div style={{ backgroundColor: 'white', minHeight: '100vh', padding: '20px' }}>
      <button 
        onClick={() => router.back()} 
        style={{ marginBottom: '20px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', cursor: 'pointer', backgroundColor: '#F8FAFC' }}
      >
        ← 戻る
      </button>
      <div 
        dangerouslySetInnerHTML={{ __html: htmlContent || '' }}
        className="material-content"
      />
    </div>
  );
}
