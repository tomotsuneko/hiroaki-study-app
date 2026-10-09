'use client';

import { useState, useRef, useEffect, Suspense, useMemo } from 'react';
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
  timestamp?: string;
};

type SessionMeta = {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

function getTodayJST(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()).replace(/\//g, '-');
}

function formatTime(timestamp?: string): string {
  if (!timestamp) return '';
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

const DEFAULT_GREETING: Message = {
  role: 'model',
  content: 'こんにちは！今日はどの科目を勉強しますか？基礎からゆっくりやっていきましょう。分からないところがあれば、いつでも聞いてくださいね！🔥',
};

function ChatTutorContent() {
  const { profile } = useUser();
  const searchParams = useSearchParams();
  const initialMessage = searchParams.get('initialMessage');

  // Sessions state
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string>('新しいチャット');
  const [todayDate, setTodayDate] = useState<string>(getTodayJST());
  
  // Chat state
  const [messages, setMessages] = useState<Message[]>([DEFAULT_GREETING]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showDateNotice, setShowDateNotice] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSent = useRef(false);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load chat sessions on mount
  useEffect(() => {
    async function loadSessions() {
      try {
        const res = await fetch('/api/chat/sessions');
        if (!res.ok) return;
        const data = await res.json();
        const serverToday = data.today || getTodayJST();
        setTodayDate(serverToday);
        const list: SessionMeta[] = data.sessions || [];
        setSessions(list);

        // Find today's latest session
        const todaySession = list.find((s) => s.date === serverToday);

        if (todaySession) {
          // Resume today's session
          await selectSession(todaySession.id);
          setShowDateNotice(false);
        } else {
          // No session today
          if (list.length > 0) {
            // There were sessions on previous days -> Show modest day change attention
            setShowDateNotice(true);
          }
          startNewChat(false);
        }
      } catch (e) {
        console.error('Failed to load chat sessions:', e);
      }
    }

    loadSessions();
  }, []);

  // Handle initialMessage parameter if provided
  useEffect(() => {
    if (initialMessage && !initialSent.current) {
      initialSent.current = true;
      handleSend(initialMessage);
    }
  }, [initialMessage]);

  // Group sessions by date relative to todayDate
  const groupedSessions = useMemo(() => {
    const groups: {
      today: SessionMeta[];
      yesterday: SessionMeta[];
      last7Days: SessionMeta[];
      older: SessionMeta[];
    } = {
      today: [],
      yesterday: [],
      last7Days: [],
      older: [],
    };

    const todayDateObj = new Date(todayDate);
    const yesterdayDate = new Date(todayDateObj);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

    const sevenDaysAgo = new Date(todayDateObj);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    for (const s of sessions) {
      if (s.date === todayDate) {
        groups.today.push(s);
      } else if (s.date === yesterdayStr) {
        groups.yesterday.push(s);
      } else if (s.date >= sevenDaysAgoStr) {
        groups.last7Days.push(s);
      } else {
        groups.older.push(s);
      }
    }

    return groups;
  }, [sessions, todayDate]);

  // Select and load an existing session
  const selectSession = async (sessionId: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/chat/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to load session');
      const data = await res.json();
      if (data.session) {
        setCurrentSessionId(data.session.id);
        setCurrentSessionTitle(data.session.title || 'チャット');
        setMessages(
          data.session.messages?.length > 0
            ? data.session.messages
            : [DEFAULT_GREETING]
        );
      }
    } catch (e) {
      console.error('Error selecting session:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // Start a fresh new chat
  const startNewChat = (dismissNotice = true) => {
    setCurrentSessionId(null);
    setCurrentSessionTitle('新しいチャット');
    setMessages([
      {
        ...DEFAULT_GREETING,
        timestamp: new Date().toISOString(),
      },
    ]);
    if (dismissNotice) {
      setShowDateNotice(false);
    }
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!window.confirm('このチャット履歴を削除しますか？')) return;

    try {
      const res = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          startNewChat();
        }
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  // Send message
  const handleSend = async (msgTextOrEvent?: any) => {
    const textToSend = typeof msgTextOrEvent === 'string' ? msgTextOrEvent : input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = textToSend.trim();
    setInput('');
    const nowIso = new Date().toISOString();

    const newMessages: Message[] = [
      ...messages,
      { role: 'user', content: userMsg, timestamp: nowIso },
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const history = messages.map((msg) => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history,
          message: userMsg,
          profile,
          sessionId: currentSessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'API error');
      }

      const modelTimestamp = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { role: 'model', content: data.text, timestamp: modelTimestamp },
      ]);

      // If a session was created or updated, update state
      if (data.session) {
        setCurrentSessionId(data.session.id);
        setCurrentSessionTitle(data.session.title);

        setSessions((prev) => {
          const exists = prev.some((s) => s.id === data.session.id);
          const meta: SessionMeta = {
            id: data.session.id,
            title: data.session.title,
            date: data.session.date,
            createdAt: data.session.createdAt,
            updatedAt: data.session.updatedAt,
            messageCount: data.session.messages.length,
          };
          if (exists) {
            return [meta, ...prev.filter((s) => s.id !== data.session.id)];
          } else {
            return [meta, ...prev];
          }
        });
      }

      // Hide day change notice once user starts chatting
      setShowDateNotice(false);
    } catch (error: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          content: `エラーが発生しました: ${error.message}`,
          timestamp: new Date().toISOString(),
        },
      ]);
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

  // Render a list of session items
  const renderSessionList = (items: SessionMeta[]) => {
    return items.map((item) => (
      <div
        key={item.id}
        className={`${styles.sessionItem} ${
          currentSessionId === item.id ? styles.activeSession : ''
        }`}
        onClick={() => selectSession(item.id)}
        title={item.title}
      >
        <div className={styles.sessionMain}>
          <span className={styles.sessionIcon}>💬</span>
          <span className={styles.sessionTitle}>{item.title}</span>
        </div>
        <button
          className={styles.deleteBtn}
          onClick={(e) => handleDeleteSession(e, item.id)}
          title="履歴を削除"
        >
          🗑️
        </button>
      </div>
    ));
  };

  return (
    <div className={styles.container}>
      {/* Top Bar */}
      <header className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Link href="/dashboard" className={styles.backBtn}>
            ← ダッシュボードへ
          </Link>
          <h1 className={styles.pageTitle}>AI チューター</h1>
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.personaBadge}>
            🌸 {profile?.tutorPersona || '優しいお姉さん'}
          </div>
          <div className={styles.dateBadge}>本日: {todayDate}</div>
        </div>
      </header>

      {/* Main 2-Column Chat Layout */}
      <div className={styles.chatLayout}>
        {/* Mobile Backdrop for sidebar drawer */}
        {isSidebarOpen && (
          <div
            className={styles.sidebarOverlay}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Chat History (Gemini Web Style) */}
        <aside
          className={`${styles.historySidebar} ${
            !isSidebarOpen ? styles.sidebarClosed : ''
          }`}
        >
          <div className={styles.sidebarHeader}>
            <button className={styles.newChatBtn} onClick={() => startNewChat()}>
              <span>＋</span> 新しいチャット
            </button>
            <div className={styles.sidebarTitle}>チャット履歴</div>
          </div>

          <div className={styles.sessionList}>
            {sessions.length === 0 ? (
              <div className={styles.emptyHistory}>
                チャット履歴はまだありません。
                <br />
                質問をすると自動で保存されます。
              </div>
            ) : (
              <>
                {groupedSessions.today.length > 0 && (
                  <div className={styles.dateGroup}>
                    <div className={styles.groupLabel}>今日</div>
                    {renderSessionList(groupedSessions.today)}
                  </div>
                )}

                {groupedSessions.yesterday.length > 0 && (
                  <div className={styles.dateGroup}>
                    <div className={styles.groupLabel}>昨日</div>
                    {renderSessionList(groupedSessions.yesterday)}
                  </div>
                )}

                {groupedSessions.last7Days.length > 0 && (
                  <div className={styles.dateGroup}>
                    <div className={styles.groupLabel}>過去 7 日間</div>
                    {renderSessionList(groupedSessions.last7Days)}
                  </div>
                )}

                {groupedSessions.older.length > 0 && (
                  <div className={styles.dateGroup}>
                    <div className={styles.groupLabel}>それ以前</div>
                    {renderSessionList(groupedSessions.older)}
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Right Area - Current Chat */}
        <section className={styles.chatMain}>
          {/* Main Chat Header */}
          <div className={styles.mainHeader}>
            <div className={styles.mainHeaderLeft}>
              <button
                className={styles.toggleSidebarBtn}
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                title={isSidebarOpen ? '履歴メニューを閉じる' : '履歴メニューを開く'}
              >
                {isSidebarOpen ? '◀ 履歴' : '▶ 履歴'}
              </button>
              <h2 className={styles.currentTitle}>{currentSessionTitle}</h2>
            </div>
          </div>

          {/* Modest Attention Banner for Day Change */}
          {showDateNotice && (
            <div className={styles.dateNoticeBanner}>
              <div className={styles.dateNoticeContent}>
                <span className={styles.dateNoticeIcon}>🗓️</span>
                <span>
                  日付が変わったため、本日の新しいチャットを開始しました。過去のチャットは左メニューからいつでも見返すことができます。
                </span>
              </div>
              <button
                className={styles.closeBannerBtn}
                onClick={() => setShowDateNotice(false)}
                title="閉じる"
              >
                ✕
              </button>
            </div>
          )}

          {/* Messages Scroll Area */}
          <div className={styles.chatHistory}>
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`${styles.message} ${
                  msg.role === 'model' ? styles.aiMessage : styles.userMessage
                }`}
              >
                {msg.role === 'model' && (
                  <div className={styles.avatar}>AI</div>
                )}

                <div className={styles.messageBody}>
                  <div className={`${styles.messageContent} markdown-body`}>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath, remarkGfm]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {msg.content}
                    </ReactMarkdown>

                    {msg.role === 'model' &&
                      idx === messages.length - 1 &&
                      !isLoading && (
                        <div className={styles.actionBtns}>
                          <Link
                            href={`/drill?subject=${encodeURIComponent(
                              initialMessage
                                ? initialMessage.replace(
                                    ' について詳しく教えてください',
                                    ''
                                  )
                                : '直前の学習内容'
                            )}`}
                            className={`btn btn-primary ${styles.actionBtn}`}
                          >
                            ✏️ この内容でドリルを解く
                          </Link>
                          <Link
                            href={`/flashcard?subject=${encodeURIComponent(
                              initialMessage
                                ? initialMessage.replace(
                                    ' について詳しく教えてください',
                                    ''
                                  )
                                : '直前の学習内容'
                            )}`}
                            className={`btn btn-secondary ${styles.actionBtn}`}
                          >
                            🗂️ 暗記カードを作る
                          </Link>
                        </div>
                      )}
                  </div>
                  {msg.timestamp && (
                    <div className={styles.messageTime}>
                      {formatTime(msg.timestamp)}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className={styles.avatar}>You</div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className={`${styles.message} ${styles.aiMessage}`}>
                <div className={styles.avatar}>AI</div>
                <div className={styles.typingIndicator}>
                  <span className={styles.typingDot}></span>
                  <span className={styles.typingDot}></span>
                  <span className={styles.typingDot}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className={styles.inputArea}>
            <textarea
              className={styles.textarea}
              placeholder="質問や学習の疑問を入力... (Enterで送信、Shift+Enterで改行)"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              className={`btn btn-primary ${styles.sendBtn}`}
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
            >
              送信
            </button>
          </div>
        </section>
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
