'use client';

import { useUser } from '@/lib/UserContext';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import styles from './library.module.css';

export default function LibraryPage() {
  const { profile, deleteNote } = useUser();
  const notes = profile.savedNotes || [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>学習ノート</h1>
        <p className={styles.subtitle}>過去にAIが生成した重要な学習ポイントや解説を見返せます。</p>
      </header>

      {notes.length === 0 ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p>まだ保存されたノートがありません。</p>
          <p>「学習計画 (シラバス)」から気になるタスクをクリックして、ポイントを保存してみましょう！</p>
        </div>
      ) : (
        <div className={styles.layout}>
          <aside className={`glass-panel ${styles.toc}`}>
            <h2 className={styles.tocTitle}>目次</h2>
            <ul className={styles.tocList}>
              {notes.map(note => (
                <li key={`toc-${note.id}`}>
                  <a href={`#note-${note.id}`} className={styles.tocItem}>
                    {note.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
          
          <div className={styles.mainNotes}>
            {notes.map(note => (
              <div key={note.id} id={`note-${note.id}`} className={styles.notebookPage}>
                <div className={styles.cardHeader}>
                  <h3 className={styles.cardTitle}>{note.title}</h3>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span className={styles.date}>{note.date}</span>
                    <button 
                      className={styles.deleteBtn}
                      onClick={() => {
                        if (confirm('このノートを削除しますか？')) {
                          deleteNote(note.id);
                        }
                      }}
                    >削除</button>
                  </div>
                </div>
                <div className={`${styles.cardContent} markdown-body`}>
                  <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{note.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
