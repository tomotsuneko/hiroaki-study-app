'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';
import styles from './flashcard.module.css';

type Flashcard = {
  id: string;
  subject: string;
  front: string;
  back: string;
};

function FlashcardContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const contextSubject = searchParams.get('subject');
  
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCards() {
      try {
        const subjects = contextSubject 
          ? [contextSubject] 
          : (profile.weakSubjects.length > 0 ? profile.weakSubjects : ["数学", "英語", "物理"]);
          
        const res = await fetch('/api/flashcard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            subjects,
            targetSchools: profile.targetSchools 
          }),
        });
        const data = await res.json();
        setCards(data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadCards();
  }, [profile.weakSubjects, profile.targetSchools, contextSubject]);

  const handleNext = (correct: boolean) => {
    fetch('/api/flashcard/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cards[currentIndex].id, correct })
    });

    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % cards.length);
    }, 150);
  };

  const handleFlip = () => setIsFlipped(!isFlipped);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>AI 暗記カード (スキマ時間)</h1>
        <p className={styles.subtitle}>{contextSubject ? `「${contextSubject}」の暗記カードを作成しました。` : 'あなたの苦手分野から、AIが最適な暗記カードを自動生成しました。'}</p>
      </header>

      {loading ? (
        <div className={styles.loadingState}>
          <div className={styles.spinner}></div>
          <p>AIが暗記カードを作成中...</p>
        </div>
      ) : cards.length > 0 ? (
        <div className={styles.cardContainer}>
          <div className={`${styles.flashcard} ${isFlipped ? styles.flipped : ''}`} onClick={handleFlip}>
            <div className={styles.cardFront}>
              <span className={styles.subjectBadge}>{cards[currentIndex].subject}</span>
              <h2>{cards[currentIndex].front}</h2>
              <p className={styles.hintText}>タップして答えを見る</p>
            </div>
            <div className={styles.cardBack}>
              <span className={styles.subjectBadge}>{cards[currentIndex].subject}</span>
              <p>{cards[currentIndex].back}</p>
            </div>
          </div>
          
          <div className={styles.controls}>
            <button className="btn btn-secondary" onClick={() => handleNext(false)}>もう一度</button>
            <button className="btn btn-primary" onClick={() => handleNext(true)}>覚えた！次へ</button>
          </div>
          <p className={styles.progressText}>{currentIndex + 1} / {cards.length}</p>
        </div>
      ) : (
        <p>カードを生成できませんでした。</p>
      )}
    </div>
  );
}

import { Suspense } from 'react';
export default function FlashcardPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FlashcardContent />
    </Suspense>
  );
}
