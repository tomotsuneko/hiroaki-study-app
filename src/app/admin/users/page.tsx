'use client';

import { useState, useEffect, useMemo } from 'react';

type UserItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: 'student' | 'admin';
  status: 'active' | 'suspended' | 'expired' | 'pending';
  validFrom: string;
  validUntil: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string;
  taskCount: number;
  hasSyllabus: boolean;
};

export default function UsersAdminPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 検索・フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'suspended'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'student'>('all');

  // モーダル管理
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [showReissueModal, setShowReissueModal] = useState(false);
  const [reissueTarget, setReissueTarget] = useState<UserItem | null>(null);
  const [reissuedResult, setReissuedResult] = useState<{ tempPassword: string; emailSent: boolean; email: string | null } | null>(null);

  // 新規発行フォームState
  const [newUserId, setNewUserId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'student' | 'admin'>('student');
  const [newValidFrom, setNewValidFrom] = useState(new Date().toISOString().split('T')[0]);
  const [newValidUntil, setNewValidUntil] = useState('');
  const [newTwoFactor, setNewTwoFactor] = useState(false);
  const [newSendEmail, setNewSendEmail] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // データ取得
  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ユーザー一覧の取得に失敗しました');
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // パスワード自動生成ヘルパー
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!#$%=@';
    let pwd = '';
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return pwd;
  };

  // 有効期間クイック設定（ヶ月単位）
  const setQuickPeriod = (months: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    setNewValidUntil(d.toISOString().split('T')[0]);
  };

  // 新規アカウント発行送信
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newUserId,
          name: newName || newUserId,
          email: newEmail,
          password: newPassword || generateRandomPassword(),
          role: newRole,
          validFrom: newValidFrom,
          validUntil: newValidUntil,
          twoFactorEnabled: newTwoFactor,
          sendNotificationEmail: newSendEmail && Boolean(newEmail),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'アカウント発行に失敗しました');

      setSuccessMsg(`アカウント「${newUserId}」を正常に発行しました${data.emailSent ? '（案内メール送信完了）' : ''}`);
      setShowCreateModal(false);
      resetCreateForm();
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setNewUserId('');
    setNewName('');
    setNewEmail('');
    setNewPassword('');
    setNewRole('student');
    setNewValidFrom(new Date().toISOString().split('T')[0]);
    setNewValidUntil('');
    setNewTwoFactor(false);
    setNewSendEmail(true);
  };

  // ユーザー編集送信
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.userId,
          name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
          status: editingUser.status,
          validFrom: editingUser.validFrom,
          validUntil: editingUser.validUntil,
          twoFactorEnabled: editingUser.twoFactorEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新に失敗しました');

      setSuccessMsg(`ユーザー「${editingUser.userId}」の情報を更新しました`);
      setShowEditModal(false);
      setEditingUser(null);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // パスワード再発行実行
  const handleReissuePassword = async () => {
    if (!reissueTarget) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/users/reissue-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: reissueTarget.userId,
          sendEmail: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'パスワード再発行に失敗しました');

      setReissuedResult({
        tempPassword: data.tempPassword,
        emailSent: data.emailSent,
        email: data.recipientEmail,
      });
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // アカウント停止 / 再開トグル
  const handleToggleStatus = async (user: UserItem) => {
    const nextStatus = user.status === 'suspended' ? 'active' : 'suspended';
    const actionLabel = nextStatus === 'suspended' ? '一時停止' : '利用再開';
    if (!confirm(`ユーザー「${user.userId}」を${actionLabel}しますか？`)) return;

    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.userId,
          status: nextStatus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(`「${user.userId}」を${actionLabel}しました`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ユーザー削除
  const handleDeleteUser = async (userId: string) => {
    if (!confirm(`⚠️ ユーザー「${userId}」および関連するすべての学習データを完全に削除しますか？\nこの操作は元に戻せません。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '削除に失敗しました');
      setSuccessMsg(`ユーザー「${userId}」を削除しました`);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // フィルタリング
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // 検索ワード
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          u.userId.toLowerCase().includes(q) ||
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      // ステータス
      if (statusFilter !== 'all') {
        if (statusFilter === 'active' && u.status !== 'active') return false;
        if (statusFilter === 'expired' && u.status !== 'expired') return false;
        if (statusFilter === 'suspended' && u.status !== 'suspended') return false;
      }
      // ロール
      if (roleFilter !== 'all') {
        if (u.role !== roleFilter) return false;
      }
      return true;
    });
  }, [users, searchQuery, statusFilter, roleFilter]);

  // 統計カウント
  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active').length;
    const expired = users.filter((u) => u.status === 'expired').length;
    const twoFa = users.filter((u) => u.twoFactorEnabled).length;
    return { total, active, expired, twoFa };
  }, [users]);

  // 有効期限の残り日数判定
  const getRemainingDaysBadge = (validUntil?: string) => {
    if (!validUntil) return <span style={{ color: '#64748B', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>無期限</span>;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const until = new Date(validUntil);
    until.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((until.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span style={{ display: 'inline-block', background: '#FEE2E2', color: '#B91C1C', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          期限切れ ({Math.abs(diffDays)}日前)
        </span>
      );
    }
    if (diffDays <= 7) {
      return (
        <span style={{ display: 'inline-block', background: '#FEF3C7', color: '#B45309', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
          残り {diffDays}日
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-block', background: '#DCFCE7', color: '#15803D', padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
        残り {diffDays}日
      </span>
    );
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '60px' }}>
      {/* 1. ヘッダーカード（濃紺・スタイリッシュ） */}
      <header
        style={{
          background:
            'radial-gradient(circle at 90% 12%, rgba(59, 130, 246, 0.22) 0%, transparent 60%), linear-gradient(135deg, #07152B 0%, #0E244B 45%, #18386B 100%)',
          borderRadius: '22px',
          padding: '28px 32px',
          color: '#FFFFFF',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
          boxShadow: '0 16px 36px rgba(7, 21, 43, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          border: '1px solid rgba(147, 197, 253, 0.28)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#FEF08A',
              background: 'rgba(251, 191, 36, 0.18)',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              padding: '4px 12px',
              borderRadius: '999px',
              width: 'fit-content',
            }}
          >
            🛡️ SECURITY & ACCESS MANAGEMENT
          </div>
          <h1 style={{ fontSize: '1.9rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            👥 利用者・認証アクセス管理
          </h1>
          <p style={{ color: '#CBD5E1', fontSize: '0.94rem', margin: 0, lineHeight: 1.5 }}>
            不特定多数の利用を前提としたアカウント発行、パスワード再発行、メール二要素認証（2FA）、利用有効期間設定を一括管理します。
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              resetCreateForm();
              setNewPassword(generateRandomPassword());
              setShowCreateModal(true);
            }}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 22px',
              fontWeight: 700,
              fontSize: '0.96rem',
              background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
            }}
          >
            ➕ 新規アカウント発行
          </button>
          <button
            onClick={fetchUsers}
            className="btn btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 18px',
              fontSize: '0.92rem',
              background: 'rgba(255, 255, 255, 0.12)',
              color: '#FFFFFF',
              borderColor: 'rgba(255, 255, 255, 0.25)',
            }}
          >
            🔄 一覧更新
          </button>
        </div>
      </header>

      {/* 通知メッセージ */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '14px 20px', borderRadius: '12px', fontSize: '0.94rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '14px 20px', borderRadius: '12px', fontSize: '0.94rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>✅ {successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} style={{ background: 'none', border: 'none', color: '#065F46', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* 2. メトリクスカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.82rem', color: '#64748B', fontWeight: 700 }}>👥 総登録ユーザー</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{stats.total} 名</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.82rem', color: '#16A34A', fontWeight: 700 }}>🟢 有効アカウント (Active)</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#16A34A', marginTop: '4px' }}>{stats.active} 名</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.82rem', color: '#EA580C', fontWeight: 700 }}>⏰ 期限切れ/終了</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#EA580C', marginTop: '4px' }}>{stats.expired} 名</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
          <div style={{ fontSize: '0.82rem', color: '#2563EB', fontWeight: 700 }}>🛡️ 二要素認証 (2FA) 有効</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>{stats.twoFa} 名</div>
        </div>
      </div>

      {/* 3. 検索 & フィルターバー */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px 20px', display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
        <div style={{ flex: '1 1 300px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.1rem' }}>🔍</span>
          <input
            type="text"
            placeholder="ユーザーID、氏名、メールアドレスで絞り込み..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.94rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.9rem', fontWeight: 600 }}
          >
            <option value="all">全ステータス</option>
            <option value="active">🟢 有効のみ</option>
            <option value="expired">⏰ 期限切れのみ</option>
            <option value="suspended">🔴 一時停止中のみ</option>
          </select>

          <select
            value={roleFilter}
            onChange={(e: any) => setRoleFilter(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.9rem', fontWeight: 600 }}
          >
            <option value="all">全権限ロール</option>
            <option value="student">一般生徒 (student)</option>
            <option value="admin">管理者 (admin)</option>
          </select>
        </div>
      </div>

      {/* 4. 利用者一覧テーブル */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.04)' }}>
        {isLoading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔄</div>
            利用者データを照会中...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#64748B' }}>
            該当する利用者は見つかりませんでした。
          </div>
        ) : (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', minWidth: '1080px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.92rem' }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 700, fontSize: '0.84rem' }}>
                  <th style={{ padding: '14px 20px', whiteSpace: 'nowrap', minWidth: '180px' }}>ユーザーID / 氏名</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '220px' }}>連絡先メール</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '110px' }}>ロール</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '140px' }}>利用有効期間</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '130px' }}>二要素認証 (2FA)</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '110px' }}>ステータス</th>
                  <th style={{ padding: '14px 16px', whiteSpace: 'nowrap', minWidth: '130px' }}>最終ログイン</th>
                  <th style={{ padding: '14px 20px', whiteSpace: 'nowrap', minWidth: '220px', textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.userId} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.15s ease' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FAFC')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                    {/* ID / 名前 */}
                    <td style={{ padding: '14px 20px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <div style={{ fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                        <span>👤 {u.userId}</span>
                        {u.role === 'admin' && (
                          <span style={{ display: 'inline-block', background: '#EDE9FE', color: '#6D28D9', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                            管理者
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '2px', whiteSpace: 'nowrap' }}>
                        {u.name !== u.userId ? u.name : '（表示名未設定）'}
                      </div>
                    </td>

                    {/* メール */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {u.email ? (
                        <span style={{ color: '#334155', whiteSpace: 'nowrap' }}>📧 {u.email}</span>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>未登録</span>
                      )}
                    </td>

                    {/* ロール */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <span style={{ fontWeight: 600, color: u.role === 'admin' ? '#7C3AED' : '#475569', whiteSpace: 'nowrap' }}>
                        {u.role === 'admin' ? '管理者' : '一般受講生'}
                      </span>
                    </td>

                    {/* 利用期間 */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      <div style={{ whiteSpace: 'nowrap' }}>{getRemainingDaysBadge(u.validUntil)}</div>
                      {u.validUntil && (
                        <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '3px', whiteSpace: 'nowrap' }}>
                          〜 {u.validUntil.split('T')[0]}
                        </div>
                      )}
                    </td>

                    {/* 2FA */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {u.twoFactorEnabled ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#EFF6FF', color: '#1D4ED8', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          🛡️ メール2FA
                        </span>
                      ) : (
                        <span style={{ color: '#94A3B8', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>OFF</span>
                      )}
                    </td>

                    {/* ステータス */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                      {u.status === 'active' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ● 有効
                        </span>
                      )}
                      {u.status === 'suspended' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEE2E2', color: '#B91C1C', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ■ 一時停止
                        </span>
                      )}
                      {u.status === 'expired' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#FEF3C7', color: '#B45309', padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          ▲ 期限切れ
                        </span>
                      )}
                    </td>

                    {/* 最終ログイン */}
                    <td style={{ padding: '14px 16px', whiteSpace: 'nowrap', fontSize: '0.82rem', color: '#64748B', verticalAlign: 'middle' }}>
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' }) : '未ログイン'}
                    </td>

                    {/* 操作アクション */}
                    <td style={{ padding: '14px 20px', whiteSpace: 'nowrap', textAlign: 'right', verticalAlign: 'middle' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => {
                            setReissueTarget(u);
                            setReissuedResult(null);
                            setShowReissueModal(true);
                          }}
                          title="パスワード再発行"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#334155', whiteSpace: 'nowrap' }}
                        >
                          🔑 再発行
                        </button>
                        <button
                          onClick={() => {
                            setEditingUser({ ...u });
                            setShowEditModal(true);
                          }}
                          title="ユーザー編集"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#2563EB', whiteSpace: 'nowrap' }}
                        >
                          ✏️ 編集
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          title={u.status === 'suspended' ? '利用再開' : '一時停止'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 12px', background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: u.status === 'suspended' ? '#16A34A' : '#EA580C', whiteSpace: 'nowrap' }}
                        >
                          {u.status === 'suspended' ? '▶ 再開' : '⏸ 停止'}
                        </button>
                        {u.userId !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(u.userId)}
                            title="ユーザー削除"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600, color: '#DC2626', whiteSpace: 'nowrap' }}
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 5. 新規アカウント発行モーダル */}
      {/* ========================================================= */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#0F172A' }}>
                ➕ 新規アカウント発行
              </h2>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
            </div>

            <form onSubmit={handleCreateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                  ログインID（必須・英数字記号）
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: student_2026_01"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                    氏名 / 表示名
                  </label>
                  <input
                    type="text"
                    placeholder="例: 山田 太郎"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                    権限ロール
                  </label>
                  <select
                    value={newRole}
                    onChange={(e: any) => setNewRole(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem', background: '#FFFFFF' }}
                  >
                    <option value="student">一般生徒 (student)</option>
                    <option value="admin">管理者 (admin)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                  メールアドレス（二要素認証・パスワード再発行先）
                </label>
                <input
                  type="email"
                  placeholder="student@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                    初期パスワード（必須）
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPassword())}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    🎲 安全なパスワードを自動生成
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem', fontFamily: 'monospace' }}
                />
              </div>

              {/* 利用期間設定 */}
              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#1E293B', marginBottom: '8px' }}>
                  📅 ご利用有効期間の設定
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>開始日</span>
                    <input
                      type="date"
                      value={newValidFrom}
                      onChange={(e) => setNewValidFrom(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.9rem' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>終了日（空欄で無期限）</span>
                    <input
                      type="date"
                      value={newValidUntil}
                      onChange={(e) => setNewValidUntil(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748B', alignSelf: 'center' }}>クイック設定:</span>
                  {[
                    { label: '1ヶ月', m: 1 },
                    { label: '3ヶ月', m: 3 },
                    { label: '6ヶ月', m: 6 },
                    { label: '1年', m: 12 },
                  ].map((btn) => (
                    <button
                      key={btn.m}
                      type="button"
                      onClick={() => setQuickPeriod(btn.m)}
                      style={{ padding: '3px 8px', fontSize: '0.76rem', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      {btn.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setNewValidUntil('')}
                    style={{ padding: '3px 8px', fontSize: '0.76rem', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }}
                  >
                    無期限
                  </button>
                </div>
              </div>

              {/* 二要素認証 (2FA) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="new2fa"
                  checked={newTwoFactor}
                  onChange={(e) => setNewTwoFactor(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="new2fa" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  🛡️ メール二要素認証（2FA）を必須化する
                </label>
              </div>

              {/* 発行メール送信チェック */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="sendEmailCheck"
                  checked={newSendEmail}
                  disabled={!newEmail}
                  onChange={(e) => setNewSendEmail(e.target.checked)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="sendEmailCheck" style={{ fontSize: '0.9rem', color: newEmail ? '#334155' : '#94A3B8', cursor: newEmail ? 'pointer' : 'default' }}>
                  📧 アカウント発行通知メールを対象アドレスに自動送信する
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                >
                  {isSubmitting ? '発行中...' : 'アカウントを発行する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. ユーザー情報編集モーダル */}
      {/* ========================================================= */}
      {showEditModal && editingUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '540px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
                ✏️ ユーザー設定編集（{editingUser.userId}）
              </h2>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94A3B8' }}>✕</button>
            </div>

            <form onSubmit={handleUpdateUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                  氏名 / 表示名
                </label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                    ロール
                  </label>
                  <select
                    value={editingUser.role}
                    onChange={(e: any) => setEditingUser({ ...editingUser, role: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                  >
                    <option value="student">一般生徒 (student)</option>
                    <option value="admin">管理者 (admin)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#334155', marginBottom: '6px' }}>
                    アカウント状態
                  </label>
                  <select
                    value={editingUser.status}
                    onChange={(e: any) => setEditingUser({ ...editingUser, status: e.target.value })}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #CBD5E1', background: '#FFFFFF' }}
                  >
                    <option value="active">🟢 有効 (active)</option>
                    <option value="suspended">🔴 一時停止 (suspended)</option>
                  </select>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <label style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem', color: '#1E293B', marginBottom: '8px' }}>
                  📅 利用期間設定
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>開始日</span>
                    <input
                      type="date"
                      value={editingUser.validFrom}
                      onChange={(e) => setEditingUser({ ...editingUser, validFrom: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                    />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>終了日</span>
                    <input
                      type="date"
                      value={editingUser.validUntil}
                      onChange={(e) => setEditingUser({ ...editingUser, validUntil: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1' }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="edit2fa"
                  checked={editingUser.twoFactorEnabled}
                  onChange={(e) => setEditingUser({ ...editingUser, twoFactorEnabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="edit2fa" style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
                  🛡️ メール二要素認証（2FA）を必須化する
                </label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-secondary"
                  style={{ flex: 1, padding: '12px' }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn btn-primary"
                  style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                >
                  {isSubmitting ? '保存中...' : '変更を保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. パスワード再発行モーダル */}
      {/* ========================================================= */}
      {showReissueModal && reissueTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
              🔑 パスワードの再発行
            </h2>

            {!reissuedResult ? (
              <div>
                <p style={{ color: '#475569', fontSize: '0.92rem', lineHeight: 1.6 }}>
                  ユーザー「<strong>{reissueTarget.userId}</strong>」の一時パスワードを新しく自動生成します。
                  {reissueTarget.email ? (
                    <>
                      <br />
                      登録メールアドレス（<strong>{reissueTarget.email}</strong>）宛に再発行案内メールを自動送信します。
                    </>
                  ) : (
                    <>
                      <br />
                      <span style={{ color: '#EA580C', fontWeight: 700 }}>
                        ※メールアドレスが未登録のため、画面に表示される一時パスワードを利用者へ直接伝達してください。
                      </span>
                    </>
                  )}
                </p>

                <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                  <button
                    type="button"
                    onClick={() => setShowReissueModal(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '12px' }}
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleReissuePassword}
                    disabled={isSubmitting}
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '12px', fontWeight: 700, background: '#D97706' }}
                  >
                    {isSubmitting ? '再発行中...' : '再発行を実行'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '14px', borderRadius: '12px', fontSize: '0.92rem', marginBottom: '16px' }}>
                  ✅ パスワードを正常に再発行しました。
                  {reissuedResult.emailSent && ' 案内メールも送信完了しました。'}
                </div>

                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 700 }}>発行された一時パスワード</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', letterSpacing: '0.05em', marginTop: '4px' }}>
                    {reissuedResult.tempPassword}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(reissuedResult.tempPassword);
                      alert('一時パスワードをクリップボードにコピーしました');
                    }}
                    style={{ marginTop: '8px', padding: '4px 10px', fontSize: '0.78rem', background: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '6px', cursor: 'pointer' }}
                  >
                    📋 パスワードをコピー
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowReissueModal(false);
                    setReissuedResult(null);
                  }}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontWeight: 700 }}
                >
                  閉じる
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
