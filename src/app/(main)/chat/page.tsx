'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import styles from './chat.module.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import Link from 'next/link';
import { useUser } from '@/lib/UserContext';
import { useSearchParams } from 'next/navigation';

type Message = {
  role: 'user' | 'model';
  content: string;
};

function ChatTutorContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const initialMessage = searchParams.get('initialMessage');
  
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'model',
      content: 'こんにちは！今日はどの科目を勉強しますか？基礎からゆっくりやっていきましょう。分からないところがあれば、いつでも聞いてくださいね！🔥',
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // To prevent double sending in dev mode strict mode
  const initialSent = useRef(false);

  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      handleSend(initialMessage);
    }
  }, [initialMessage]);

  // Auto-scroll to bottom when new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (msgTextOrEvent?: any) => {
    const textToSend = typeof msgTextOrEvent === 'string' ? msgTextOrEvent : input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = textToSend.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      // 履歴をGemini APIの形式に合わせる
      // Use the *current* messages for history. If initialMessage is sent, messages might not have updated yet in this closure, 
      // but it's fine for the first message since history is just the first model message.
      const history = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, message: userMsg, profile }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'API error');
      }

      setMessages(prev => [...prev, { role: 'model', content: data.text }]);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'model', content: `エラーが発生しました: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/dashboard" className={styles.backBtn}>← 戻る</Link>
          <h1 className={styles.title}>AI チューター</h1>
        </div>
      </header>

      <div className={`glass-panel ${styles.chatWrapper}`}>
        <div className={styles.chatHistory}>
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`${styles.message} ${msg.role === 'model' ? styles.aiMessage : styles.userMessage}`}
            >
              {msg.role === 'model' && <div className={styles.avatar}>AI</div>}
              
              <div className={styles.messageContent + " markdown-body"}>
                <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                
                {msg.role === 'model' && idx === messages.length - 1 && !isLoading && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '16px', flexWrap: 'wrap' }}>
                    <Link href={`/drill?subject=${encodeURIComponent(initialMessage ? initialMessage.replace(' について詳しく教えてください', '') : '直前の学習内容')}`} className="btn btn-primary" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>✏️ この内容でドリルを解く</Link>
                    <Link href={`/flashcard?subject=${encodeURIComponent(initialMessage ? initialMessage.replace(' について詳しく教えてください', '') : '直前の学習内容')}`} className="btn btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }}>🗂️ 暗記カードを作る</Link>
                  </div>
                )}
              </div>
              
              {msg.role === 'user' && <div className={styles.avatar}>You</div>}
            </div>
          ))}
          {isLoading && (
            <div className={`${styles.message} ${styles.aiMessage}`}>
              <div className={styles.avatar}>AI</div>
              <div className={styles.messageContent}>考え中...</div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className={styles.inputArea}>
          <textarea 
            className={styles.textarea} 
            placeholder="メッセージを入力... (Enterで送信、Shift+Enterで改行)"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          ></textarea>
          <button 
            className={`btn btn-primary ${styles.sendBtn}`}
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatTutor() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ChatTutorContent />
    </Suspense>
  );
}
