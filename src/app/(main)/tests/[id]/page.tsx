'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

export default function TestPlayerPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const v = searchParams.get('v');

  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // 回答実績サマリー
  const [stats, setStats] = useState<{
    answered: number;
    correct: number;
    firstCorrect: number;
    total: number;
  }>({ answered: 0, correct: 0, firstCorrect: 0, total: 30 });

  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // テストコンテンツ取得
  useEffect(() => {
    if (!id) return;

    async function fetchTest() {
      try {
        setLoading(true);
        const url = `/api/tests/${encodeURIComponent(id)}${v !== null ? `?v=${v}` : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.success && data.material) {
          setHtmlContent(data.material.content);
          setMeta(data.material);

          // 過去レコードがある場合はstatsを初期化
          if (data.material.userRecord) {
            const r = data.material.userRecord;
            setStats({
              answered: r.answeredCount || 0,
              correct: r.correctCount || 0,
              firstCorrect: r.firstCorrectCount || 0,
              total: r.totalQuestions || 30
            });
            setSaveStatus('saved');
            setLastSavedTime(new Date(r.updatedAt).toLocaleTimeString('ja-JP'));
          }
        } else {
          setError(data.error || 'テストコンテンツが見つかりません');
        }
      } catch (err) {
        setError('テストの読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    }

    fetchTest();
  }, [id, v]);

  // iframeからの postMessage を受信して同期
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      const data = e.data;
      if (!data || data.type !== 'TEST_RECORD_UPDATE') return;

      // statsを即時更新
      const answers = data.payload?.answers || {};
      let a = 0, c = 0, fc = 0;
      Object.values(answers).forEach((ans: any) => {
        if (ans && ans.attempts > 0) {
          a++;
          if (ans.correct) c++;
          if (ans.firstCorrect) fc++;
        }
      });
      setStats({ answered: a, correct: c, firstCorrect: fc, total: 30 });
      setSaveStatus('saving');

      // Debounce して API 保存
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
                title: meta?.title || id,
                contentTitle: meta?.contentTitle || '',
                subject: meta?.subject || 'high_school_数学',
                totalQuestions: 30
              }
            })
          });

          if (res.ok) {
            setSaveStatus('saved');
            setLastSavedTime(new Date().toLocaleTimeString('ja-JP'));
          } else {
            setSaveStatus('error');
          }
        } catch (err) {
          console.error('Failed to sync test record:', err);
          setSaveStatus('error');
        }
      }, 600);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [id, meta]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', backgroundColor: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📖</div>
          <div style={{ fontSize: '1rem', color: '#475569', fontWeight: 'bold' }}>テストを読み込み中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div style={{ color: '#EF4444', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '16px' }}>{error}</div>
        <button
          onClick={() => router.back()}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', cursor: 'pointer', backgroundColor: 'white' }}
        >
          ← 戻る
        </button>
      </div>
    );
  }

  const levelColor = id.includes('L3') || id.includes('応用')
    ? '#EA580C'
    : id.includes('L2') || id.includes('標準')
    ? '#2563EB'
    : '#10B981';

  const levelLabel = id.includes('L3') || id.includes('応用')
    ? 'L3 応用'
    : id.includes('L2') || id.includes('標準')
    ? 'L2 標準'
    : 'L1 基礎';

  return (
    <div style={{ backgroundColor: 'white', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'sans-serif' }}>
      {/* 受験バー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 20px',
        borderBottom: '1px solid #E2E8F0',
        backgroundColor: '#FFFFFF',
        flexWrap: 'wrap',
        gap: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            onClick={() => router.back()}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid #CBD5E1',
              cursor: 'pointer',
              backgroundColor: '#F8FAFC',
              fontSize: '0.88rem',
              fontWeight: 'bold',
              color: '#334155'
            }}
          >
            ← 戻る
          </button>
          <span style={{
            fontSize: '0.78rem',
            padding: '3px 8px',
            backgroundColor: levelColor + '15',
            color: levelColor,
            borderRadius: '4px',
            fontWeight: 'bold',
            border: `1px solid ${levelColor}30`
          }}>
            {levelLabel}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#0F172A' }}>
              {meta?.contentTitle || decodeURIComponent(id)}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748B', fontFamily: 'monospace' }}>
              {decodeURIComponent(id)}
            </span>
          </div>
        </div>

        {/* 成績・進捗 & 関連コンテンツ連携 & クラウド同期ステータス */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {(() => {
            const decodedId = decodeURIComponent(id);
            const codeMatch = decodedId.match(/^([A-Z0-9]+_[A-Z0-9]+)/i);
            const unitCode = codeMatch ? codeMatch[1].toUpperCase() : '';
            const cleanTopic = (meta?.contentTitle || decodedId)
              .replace(/^L[123]\s*(基礎|標準|応用)?\s*[｜|]\s*/i, '')
              .replace(/\s*\(L[123].*?\)\s*$/i, '')
              .trim();
            const cleanSubj = (meta?.subject || '').replace(/^high_school_/, '');
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <a
                  href={`/lesson?task=${encodeURIComponent(cleanTopic)}&unit=${encodeURIComponent(unitCode)}&subject=${encodeURIComponent(cleanSubj)}`}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#EFF6FF',
                    color: '#1D4ED8',
                    border: '1px solid #BFDBFE',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                  }}
                  title="この単元の公式学習テキストを開く"
                >
                  📘 公式テキスト
                </a>
                <a
                  href={`/drill?subject=${encodeURIComponent(cleanSubj)}&topic=${encodeURIComponent(cleanTopic)}&unit=${encodeURIComponent(unitCode)}&mode=unit`}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#EEF2FF',
                    color: '#4338CA',
                    border: '1px solid #C7D2FE',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                  }}
                  title="この単元のAI記述ドリルで演習する"
                >
                  ⚡ AIドリル
                </a>
                <a
                  href={`/flashcard?subject=${encodeURIComponent(cleanSubj)}&topic=${encodeURIComponent(cleanTopic)}&unit=${encodeURIComponent(unitCode)}`}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    backgroundColor: '#FFF7ED',
                    color: '#C2410C',
                    border: '1px solid #FED7AA',
                    fontSize: '0.78rem',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                  }}
                  title="この単元の暗記カードを開く"
                >
                  📇 暗記カード
                </a>
              </div>
            );
          })()}

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: '#F1F5F9',
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '0.85rem'
          }}>
            <span>回答: <strong style={{ color: '#0F172A' }}>{stats.answered}</strong> / {stats.total}問</span>
            <span>正解: <strong style={{ color: '#16A34A' }}>{stats.correct}</strong>問</span>
            <span>初回正解: <strong style={{ color: '#2563EB' }}>{stats.firstCorrect}</strong>問</span>
          </div>

          <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {saveStatus === 'saving' && (
              <span style={{ color: '#D97706', fontWeight: 'bold' }}>🔄 クラウド保存中...</span>
            )}
            {saveStatus === 'saved' && (
              <span style={{ color: '#16A34A', fontWeight: 'bold' }}>
                ☁️ クラウド同期済 {lastSavedTime ? `(${lastSavedTime})` : ''}
              </span>
            )}
            {saveStatus === 'error' && (
              <span style={{ color: '#DC2626', fontWeight: 'bold' }}>⚠️ 保存失敗 (再試行中)</span>
            )}
            {saveStatus === 'idle' && (
              <span style={{ color: '#94A3B8' }}>☁️ 自動同期待機中</span>
            )}
          </div>
        </div>
      </div>

      {/* テスト問題集（HTML） iframe */}
      <iframe
        srcDoc={htmlContent || ''}
        style={{ flex: 1, width: '100%', border: 'none', backgroundColor: '#F8FAFC' }}
        title="Test Material Content"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}
