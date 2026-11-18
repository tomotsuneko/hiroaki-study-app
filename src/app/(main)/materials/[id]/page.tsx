'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function MaterialViewer() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = decodeURIComponent(params.id as string);
  const v = searchParams.get('v');

  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [materialMeta, setMaterialMeta] = useState<{
    title?: string;
    contentTitle?: string;
    subject?: string;
  } | null>(null);
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
          setHtmlContent(data.material.content);
          setMaterialMeta({
            title: data.material.title,
            contentTitle: data.material.contentTitle,
            subject: data.material.subject,
          });
          setIsVersion(data.material.isVersion || false);
        } else {
          setError(data.error || 'コンテンツが見つかりません');
        }
      } catch {
        setError('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    }

    fetchMaterial();
  }, [id, v]);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>;
  if (error) return <div style={{ padding: '40px', textAlign: 'center', color: 'red' }}>{error}</div>;

  const displayTitle = materialMeta?.contentTitle || materialMeta?.title || '';

  return (
    <div style={{ backgroundColor: 'white', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '12px 20px',
          borderBottom: '1px solid #E2E8F0',
          backgroundColor: '#F8FAFC',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              cursor: 'pointer',
              backgroundColor: '#FFFFFF',
              color: '#1E3A5F',
              fontWeight: 700,
              fontSize: '0.86rem',
            }}
          >
            ← 戻る
          </button>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: '#EEF2F6',
              border: '1px solid #CBD5E1',
              color: '#1E3A5F',
              fontFamily: 'monospace',
              fontWeight: 800,
              fontSize: '0.84rem',
            }}
          >
            📘 {id}
          </span>
          {displayTitle && displayTitle !== id && (
            <strong style={{ fontSize: '0.96rem', color: '#0F172A' }}>{displayTitle}</strong>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {isVersion && (
            <span
              style={{
                padding: '4px 12px',
                backgroundColor: '#FEF08A',
                color: '#854D0E',
                borderRadius: '16px',
                fontSize: '0.84rem',
                fontWeight: 'bold',
              }}
            >
              ⚠️ 過去のバージョンを表示中
            </span>
          )}
          <Link
            href={`/drill?unit=${encodeURIComponent(id)}&autostart=1`}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              backgroundColor: '#1E3A5F',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: '0.84rem',
              textDecoration: 'none',
            }}
          >
            ⚡ この単元のAIドリル
          </Link>
          <Link
            href={`/flashcard?unit=${encodeURIComponent(id)}`}
            style={{
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              color: '#1E3A5F',
              fontWeight: 700,
              fontSize: '0.84rem',
              textDecoration: 'none',
            }}
          >
            📇 暗記カード
          </Link>
        </div>
      </div>
      <iframe
        srcDoc={htmlContent || ''}
        style={{ flex: 1, width: '100%', border: 'none' }}
        title={displayTitle || 'Material Content'}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
