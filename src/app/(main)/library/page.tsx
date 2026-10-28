'use client';

import { useState, useMemo } from 'react';
import { useUser, SavedNote } from '@/lib/UserContext';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import styles from './library.module.css';

export default function LibraryPage() {
  const { profile, deleteNote } = useUser();
  const notes = profile.savedNotes || [];

  const [activeFilter, setActiveFilter] = useState<'all' | 'bookmarks' | 'notes'>('all');

  const isBookmarkNote = (note: SavedNote) => {
    return Boolean(note.isBookmark || note.title.startsWith('🔖'));
  };

  const filteredNotes = useMemo(() => {
    if (activeFilter === 'bookmarks') {
      return notes.filter(isBookmarkNote);
    }
    if (activeFilter === 'notes') {
      return notes.filter((n) => !isBookmarkNote(n));
    }
    return notes;
  }, [notes, activeFilter]);

  const bookmarkCount = useMemo(() => notes.filter(isBookmarkNote).length, [notes]);
  const memoCount = notes.length - bookmarkCount;

  const getTargetUnitParam = (note: SavedNote) => {
    if (note.unitCode) return note.unitCode;
    const match = note.title.match(/「([^」]+)」/);
    if (match) return match[1];
    return note.title.replace(/^🔖\s*/, '').trim();
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className={styles.title}>学習ノート &amp; しおり</h1>
            <p className={styles.subtitle}>
              教材に挟んだ「しおり」や、AIが作成した講義ノート・重要解説を見返してスムーズに再開できます。
            </p>
          </div>

          <div className={styles.filterBar}>
            <button
              className={`${styles.filterBtn} ${activeFilter === 'all' ? styles.filterBtnActive : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              📚 すべて ({notes.length})
            </button>
            <button
              className={`${styles.filterBtn} ${activeFilter === 'bookmarks' ? styles.filterBtnActive : ''}`}
              onClick={() => setActiveFilter('bookmarks')}
            >
              🔖 教材しおり ({bookmarkCount})
            </button>
            <button
              className={`${styles.filterBtn} ${activeFilter === 'notes' ? styles.filterBtnActive : ''}`}
              onClick={() => setActiveFilter('notes')}
            >
              📝 学習メモ ({memoCount})
            </button>
          </div>
        </div>
      </header>

      {notes.length === 0 ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>まだ保存されたノートやしおりがありません。</p>
          <p>
            「学習コンテンツ（図書館）」から単元テキストを開き、<strong>「🔖 しおりを挟む」</strong>ボタンを押すと、
            いつでもこのページから教材の続きを再開できます！
          </p>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className={`glass-panel ${styles.emptyState}`}>
          <p>
            {activeFilter === 'bookmarks'
              ? '教材のしおりはまだ保存されていません。「学習コンテンツ」で読んでいる教材にしおりを挟んでみましょう！'
              : '学習メモはまだありません。AI講義や要点解説を保存してみましょう！'}
          </p>
        </div>
      ) : (
        <div className={styles.layout}>
          <aside className={`glass-panel ${styles.toc}`}>
            <h2 className={styles.tocTitle}>目次 ({filteredNotes.length}件)</h2>
            <ul className={styles.tocList}>
              {filteredNotes.map((note) => {
                const isBm = isBookmarkNote(note);
                return (
                  <li key={`toc-${note.id}`}>
                    <a href={`#note-${note.id}`} className={styles.tocItem}>
                      <span style={{ marginRight: '6px' }}>{isBm ? '🔖' : '📝'}</span>
                      {note.title.replace(/^🔖\s*/, '')}
                    </a>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className={styles.mainNotes}>
            {filteredNotes.map((note) => {
              const isBm = isBookmarkNote(note);
              const targetUnit = getTargetUnitParam(note);

              return (
                <div
                  key={note.id}
                  id={`note-${note.id}`}
                  className={`${styles.notebookPage} ${isBm ? styles.bookmarkPage : ''}`}
                >
                  {isBm && (
                    <div className={styles.bookmarkRibbon}>
                      <span>🔖 教材しおり</span>
                    </div>
                  )}

                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>{note.title}</h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span className={styles.date}>{note.date}</span>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => {
                          if (confirm(`「${note.title}」を削除しますか？`)) {
                            deleteNote(note.id);
                          }
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </div>

                  <div className={`${styles.cardContent} markdown-body`}>
                    <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                      {note.content}
                    </ReactMarkdown>
                  </div>

                  {/* Bookmark Navigation Actions */}
                  {isBm && (
                    <div className={styles.resumeBar}>
                      <Link
                        href={`/lesson?unit=${encodeURIComponent(targetUnit)}`}
                        className={styles.resumeBtn}
                      >
                        <span>📖</span> 図書館で教材を開く →
                      </Link>

                      {note.materialId && (
                        <button
                          onClick={() =>
                            window.open(
                              `/materials/${encodeURIComponent(note.materialId!)}`,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                          className={styles.popoutBtn}
                          title="別ウィンドウで教材を開く"
                        >
                          <span>🗗</span> 別ウィンドウ
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
