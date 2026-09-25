'use client';

import { useState } from 'react';
import { useUser } from '@/lib/UserContext';
import styles from './exam.module.css';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function ExamAnalysisPage() {
  const { profile, setProfile } = useUser();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ analyzedSubjects: string[], analysisText: string } | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeImage = async () => {
    if (!image) return;
    setLoading(true);
    try {
      const res = await fetch('/api/exam-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: image }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      alert('画像の解析に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const applyToProfile = () => {
    if (result) {
      setProfile({
        ...profile,
        weakSubjects: [...new Set([...profile.weakSubjects, ...result.analyzedSubjects])]
      });
      alert('プロフィール（苦手科目）を更新し、シラバスを再構築しました！');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>模試結果の画像解析</h1>
        <p className={styles.subtitle}>模試の成績表をアップロードすると、AIが弱点を分析して学習計画を自動アップデートします。</p>
      </header>

      <div className={`glass-panel ${styles.uploadCard}`}>
        {!image ? (
          <div className={styles.uploadArea}>
            <input type="file" accept="image/*" onChange={handleImageUpload} id="file-upload" className={styles.fileInput} />
            <label htmlFor="file-upload" className="btn btn-secondary">成績表の画像を選択</label>
            <p className={styles.hintText}>JPG, PNG形式の成績表画像</p>
          </div>
        ) : (
          <div className={styles.previewArea}>
            <img src={image} alt="成績表プレビュー" className={styles.previewImage} />
            <div className={styles.controls}>
              <button className="btn btn-secondary" onClick={() => {setImage(null); setResult(null);}}>別の画像を選択</button>
              <button className="btn btn-primary" onClick={analyzeImage} disabled={loading}>
                {loading ? 'AIが分析中...' : 'AIに弱点を分析させる'}
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className={styles.loadingState}>
            <div className={styles.spinner}></div>
            <p>成績表を読み取り、学習戦略を策定しています...</p>
          </div>
        )}

        {result && (
          <div className={styles.resultArea}>
            <h2 className={styles.resultTitle}>🎯 分析完了</h2>
            <div className={styles.analyzedSubjects}>
              <strong>検出された弱点:</strong>
              <div className={styles.badges}>
                {result.analyzedSubjects.map(sub => (
                  <span key={sub} className={styles.badge}>{sub}</span>
                ))}
              </div>
            </div>
            <div className="markdown-body" style={{backgroundColor: '#F8FAFC', padding: '16px', borderRadius: '8px', marginBottom: '16px'}}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.analysisText}</ReactMarkdown>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button className="btn btn-primary" style={{width: '100%'}} onClick={applyToProfile}>
                この結果をプロフィール（シラバス）に反映する
              </button>
              <button className="btn btn-secondary" style={{width: '100%'}} onClick={() => {
                window.location.href = `/chat?initialMessage=${encodeURIComponent('直前の模試分析で以下の弱点が見つかりました。\n' + result.analyzedSubjects.join('、') + '\n\n明日からどのように勉強方針を変えればいいか、具体的なアドバイスをください。')}`;
              }}>
                🤖 弱点克服の学習方針をAIチューターに相談する
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
