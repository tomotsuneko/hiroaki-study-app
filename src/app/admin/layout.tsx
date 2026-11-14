import Link from 'next/link';
import AdminNav from './AdminNav';
import styles from './admin.module.css';
import LogoutButton from '@/components/LogoutButton';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#F8FAFC' }}>
      <aside className={styles.sidebar}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '20px', fontWeight: 700, color: '#F1F5F9' }}>⚙️ 管理者メニュー</h2>
        <AdminNav />
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '14px', borderTop: '1px solid #334155' }}>
          <Link
            href="/dashboard"
            style={{
              padding: '10px 12px',
              color: '#E2E8F0',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 600,
              borderRadius: '8px',
              display: 'block',
            }}
          >
            🎓 ユーザー画面へ
          </Link>
          <LogoutButton
            label="← ログアウト"
            style={{
              padding: '10px 12px',
              color: '#94A3B8',
              textAlign: 'left',
              fontSize: '0.9rem',
              borderRadius: '8px',
            }}
          />
        </div>
      </aside>
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
