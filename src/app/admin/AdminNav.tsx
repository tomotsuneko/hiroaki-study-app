'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export default function AdminNav() {
  const pathname = usePathname();

  const topNavItems = [
    { name: '📚 カリキュラム管理', path: '/admin/curriculum' },
    { name: '📖 学習コンテンツ管理', path: '/admin/materials' },
    { name: '📝 テストコンテンツ管理', path: '/admin/tests' },
  ];

  const bottomNavItems = [
    { name: '📋 個別シラバス管理', path: '/admin/syllabus' },
    { name: '🤖 AIモデル・API管理', path: '/admin/models' },
  ];

  return (
    <nav className={styles.nav}>
      {topNavItems.map((item) => {
        const isActive = pathname.startsWith(item.path);
        return (
          <Link 
            key={item.path} 
            href={item.path} 
            className={`${styles.navLink} ${isActive ? styles.activeLink : ''}`}
          >
            {item.name}
          </Link>
        );
      })}

      <div className={styles.divider} />

      {bottomNavItems.map((item) => {
        const isActive = pathname.startsWith(item.path);
        return (
          <Link 
            key={item.path} 
            href={item.path} 
            className={`${styles.navLink} ${isActive ? styles.activeLink : ''}`}
          >
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
