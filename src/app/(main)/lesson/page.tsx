'use client';

import { useState, useEffect, Suspense } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import Link from 'next/link';

function LessonContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const requestedTask = searchParams.get('task');
  
  const [learningContents, setLearningContents] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/db/daily');
        const data = await res.json();
        
        let contents = [];
        if (data.dailyAnalysis?.learningContents) {
          contents = data.dailyAnalysis.learningContents;
        } else if (data.dailyAnalysis?.learningContent) {
          // Fallback to legacy single object
          contents = [data.dailyAnalysis.learningContent];
        }
        
        // If requestedTask exists, try to find it
        if (requestedTask && contents.length > 0) {
          const idx = contents.findIndex((c: any) => c.taskTitle.includes(requestedTask) || requestedTask.includes(c.taskTitle));
          if (idx !== -1) setActiveTab(idx);
        }

        // If requested task exists but wasn't found in current contents, we might simulate fetching it.
        // For the demo, we just add a placeholder if it's completely missing so they can study what they clicked.
        if (requestedTask && contents.findIndex((c: any) => c.taskTitle.includes(requestedTask) || requestedTask.includes(c.taskTitle)) === -1) {
          contents.push({
            taskTitle: requestedTask,
            textMarkdown: `現在AIが「${requestedTask}」の詳細な学習コンテンツを生成中です。基本的な参考書や用語集を確認して学習を進めてみてください。`,
            videoQueries: [requestedTask + " 基礎"],
            checkTest: []
          });
          setActiveTab(contents.length - 1);
        }
        
        setLearningContents(contents);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [requestedTask]);

  useEffect(() => {
    async function fetchVideosForTab() {
      if (learningContents.length > 0 && learningContents[activeTab]) {
        const content = learningContents[activeTab];
        if (content.videoQueries && content.videoQueries.length > 0) {
          try {
            const vRes = await fetch(`/api/youtube?q=${encodeURIComponent(content.videoQueries[0])}`);
            const vData = await vRes.json();
            setVideos(vData.items || []);
          } catch(e) {
            console.error(e);
          }
        } else {
          setVideos([]);
        }
      }
    }
    fetchVideosForTab();
  }, [activeTab, learningContents]);

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>;
  }

  if (learningContents.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>本日の学習コンテンツはまだ生成されていません。</p>
        <p>ダッシュボードから日次バッチを実行してください。</p>
      </div>
    );
  }

  const activeContent = learningContents[activeTab];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <header>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '8px' }}>📖 学習コンテンツ</h1>
        <p style={{ color: 'var(--text-secondary)' }}>目標校合格に向けた、本日の重点学習パッケージです。</p>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid #E2E8F0', paddingBottom: '0' }}>
        {learningContents.map((content, idx) => (
          <button
            key={idx}
            onClick={() => setActiveTab(idx)}
            style={{
              padding: '12px 24px',
              border: 'none',
              background: 'transparent',
              fontSize: '1.05rem',
              fontWeight: activeTab === idx ? 'bold' : 'normal',
              color: activeTab === idx ? 'var(--accent-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === idx ? '3px solid var(--accent-primary)' : '3px solid transparent',
              cursor: 'pointer',
              marginBottom: '-2px',
              transition: 'all 0.2s ease'
            }}
          >
            {content.taskTitle}
          </button>
        ))}
      </div>

      <section className="glass-panel" style={{ padding: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.5rem', color: 'var(--accent-primary)', fontWeight: 'bold' }}>
            テーマ：{activeContent.taskTitle}
          </h2>
          <button onClick={() => window.dispatchEvent(new CustomEvent('startPomodoro', { detail: { task: activeContent.taskTitle } }))} className="btn btn-primary">
            ⏱️ タイマー開始
          </button>
        </div>
        
        <div className="markdown-body" style={{ background: '#F8FAFC', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
            {activeContent.textMarkdown}
          </ReactMarkdown>
        </div>
      </section>

      {videos.length > 0 && (
        <section className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '16px' }}>📺 参考動画</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
            {videos.slice(0, 3).map((video: any) => (
              <div key={video.id.videoId}>
                <iframe 
                  width="100%" 
                  height="180" 
                  src={`https://www.youtube.com/embed/${video.id.videoId}?rel=0`} 
                  title={video.snippet.title}
                  frameBorder="0" 
                  allowFullScreen
                  style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                ></iframe>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeContent.checkTest && activeContent.checkTest.length > 0 && (
        <section className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', marginBottom: '16px' }}>📝 確認テスト</h2>
          {activeContent.checkTest.map((test: any, idx: number) => (
            <div key={idx} style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '16px', fontSize: '1.1rem' }}>Q{idx + 1}. {test.question}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {test.options.map((opt: string, optIdx: number) => (
                  <button 
                    key={optIdx}
                    className="btn btn-secondary"
                    style={{ textAlign: 'left', padding: '12px' }}
                    onClick={() => {
                      if (optIdx === test.correctIndex) {
                        alert('✅ 正解！\n\n' + test.explanation);
                      } else {
                        alert('❌ 不正解...\n\n' + test.explanation);
                      }
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default function LessonPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center' }}>読み込み中...</div>}>
      <LessonContent />
    </Suspense>
  );
}
