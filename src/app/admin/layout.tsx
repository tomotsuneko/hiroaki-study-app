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
        <LogoutButton
          label="← ログアウト"
          style={{
            padding: '10px 12px',
            color: '#94A3B8',
            textAlign: 'left',
            marginTop: 'auto',
            fontSize: '0.9rem',
            borderRadius: '8px',
          }}
        />
      </aside>
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
