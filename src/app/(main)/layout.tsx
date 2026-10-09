'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';
import AIAvatar from '@/components/AIAvatar';
import FloatingTimer from '@/components/FloatingTimer';
import { useState, useEffect } from 'react';

function Sidebar({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'ダッシュボード', path: '/dashboard', icon: '📊' },
    { name: '学習シラバス', path: '/plan', icon: '🗺️' },
    { name: '学習コンテンツ', path: '/lesson', icon: '📖' },
    { name: 'AI チューター', path: '/chat', icon: '💬' },
    { name: 'AI ドリル (テスト)', path: '/drill', icon: '📝' },
    { name: '暗記カード', path: '/flashcard', icon: '📇' },
    { name: '模試分析', path: '/exam-analysis', icon: '📈' },
    { name: '学習ノート', path: '/library', icon: '📚' },
    { name: 'プロフィール設定', path: '/profile', icon: '⚙️' },
  ];

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logoContainer}>
        <div className={styles.logoBrand}>
          <div className={styles.logoIcon}>AI</div>
          <span className={styles.logoText}>AI&SI Tutor</span>
        </div>
        <button 
          className={styles.collapseBtn} 
          onClick={onClose}
          aria-label="メニューを閉じる"
          title="メニューを閉じる"
        >
          ◁
        </button>
      </div>
      
      <nav className={styles.nav}>
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.path);
          return (
            <Link 
              key={item.path} 
              href={item.path}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.sidebarFooter}>
        <Link href="/" className={styles.logoutBtn}>ログアウト</Link>
      </div>
    </aside>
  );
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (mobile) {
        setIsSidebarOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // モバイル表示時はページ遷移で自動的に閉じる
  useEffect(() => {
    if (isMobile) {
      setIsSidebarOpen(false);
    }
  }, [pathname, isMobile]);

  return (
    <div className={styles.appContainer}>
      {/* 閉じている時に表示されるハンバーガーボタン */}
      {!isSidebarOpen && (
        <button 
          className={styles.floatingHamburgerBtn}
          onClick={() => setIsSidebarOpen(true)}
          aria-label="メニューを開く"
          title="メニューを開く"
        >
          ☰
        </button>
      )}

      {/* モバイル時のオーバーレイ */}
      {isMobile && isSidebarOpen && (
        <div className={styles.overlay} onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`${styles.sidebarWrapper} ${isSidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <main className={`${styles.mainContent} ${!isSidebarOpen ? styles.mainContentExpanded : ''}`}>
        {children}
      </main>
      <AIAvatar />
      <FloatingTimer />
    </div>
  );
}
