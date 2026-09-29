import AdminNav from './AdminNav';
import styles from './admin.module.css';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#F8FAFC' }}>
      <aside className={styles.sidebar}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>⚙️ 管理者メニュー</h2>
        <AdminNav />
        <a href="/" style={{ padding: '10px', color: '#94A3B8', textDecoration: 'none', marginTop: 'auto' }}>
          ← ログイン画面に戻る
        </a>
      </aside>
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}
