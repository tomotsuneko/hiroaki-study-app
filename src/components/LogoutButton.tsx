'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface LogoutButtonProps {
  className?: string;
  label?: string;
  style?: React.CSSProperties;
}

export default function LogoutButton({
  className,
  label = 'ログアウト',
  style,
}: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors and proceed to clear local state & redirect
    } finally {
      try {
        localStorage.removeItem('abiko_study_user_id');
        localStorage.removeItem('abiko_study_cache');
      } catch {
        // Ignore storage errors
      }
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={className}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: loading ? 'wait' : 'pointer',
        fontFamily: 'inherit',
        ...style,
      }}
    >
      {loading ? 'ログアウト中...' : label}
    </button>
  );
}
