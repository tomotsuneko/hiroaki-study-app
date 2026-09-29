export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#F8FAFC' }}>
      <aside style={{ width: '250px', backgroundColor: '#1E293B', color: 'white', padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px' }}>⚙️ 管理者メニュー</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <a href="/admin/curriculum" style={{ padding: '10px', backgroundColor: '#334155', borderRadius: '8px', color: 'white', textDecoration: 'none' }}>
            📚 カリキュラム管理
          </a>
          <a href="/admin/syllabus" style={{ padding: '10px', backgroundColor: '#334155', borderRadius: '8px', color: 'white', textDecoration: 'none' }}>
            📋 シラバス管理
          </a>
          <a href="/admin/models" style={{ padding: '10px', color: '#94A3B8', textDecoration: 'none' }}>
            🤖 AIモデル・API管理
          </a>
        </nav>
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
