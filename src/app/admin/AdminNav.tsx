'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

export default function AdminNav() {
  const pathname = usePathname();

  const navItems = [
    { name: '📚 カリキュラム管理', path: '/admin/curriculum' },
    { name: '📋 シラバス管理', path: '/admin/syllabus' },
    { name: '🤖 AIモデル・API管理', path: '/admin/models' },
    { name: '📖 教材コンテンツ管理', path: '/admin/materials' },
  ];

  return (
    <nav className={styles.nav}>
      {navItems.map((item) => {
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
