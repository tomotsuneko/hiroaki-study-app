'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { name: 'ダッシュボード', path: '/dashboard', icon: '📊' },
    { name: '学習計画 (シラバス)', path: '/plan', icon: '🗺️' },
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
        <div className={styles.logoIcon}>AI</div>
        <span className={styles.logoText}>AI Tutor</span>
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

import AIAvatar from '@/components/AIAvatar';
import FloatingTimer from '@/components/FloatingTimer';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.appContainer}>
      <Sidebar />
      <main className={styles.mainContent}>
        {children}
      </main>
      <AIAvatar />
      <FloatingTimer />
    </div>
  );
}
