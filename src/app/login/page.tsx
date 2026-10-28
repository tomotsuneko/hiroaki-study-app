'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginFormContent() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'login' | '2fa'>('login');
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState(searchParams.get('error') || '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) setError(err);
  }, [searchParams]);

  // パスワード忘れモーダル
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotInput, setForgotInput] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const router = useRouter();

  // 1. 通常ログインハンドラー
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'ログインに失敗しました');
        return;
      }

      // 二要素認証（2FA）が要求された場合
      if (data.require2FA) {
        setTempToken(data.tempToken);
        setMaskedEmail(data.maskedEmail || 'ご登録メールアドレス');
        setStep('2fa');
        setOtpCode('');
        return;
      }

      // ログイン成功
      window.location.href = data.role === 'admin' ? '/admin/curriculum' : '/dashboard';
    } catch (e) {
      setError('サーバー通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. 二要素認証（2FA）コード送信ハンドラー
  const handleVerify2Fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          tempToken,
          code: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '認証コードの検証に失敗しました');
        return;
      }

      // 2FA認証完了
      window.location.href = data.role === 'admin' ? '/admin/curriculum' : '/dashboard';
    } catch (e) {
      setError('サーバー通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. パスワード忘れ申請ハンドラー
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMsg('');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: forgotInput }),
      });
      const data = await res.json();
      setForgotMsg(data.message || '送信しました');
    } catch (e) {
      setForgotMsg('通信エラーが発生しました');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'radial-gradient(circle at 50% 20%, #1E293B 0%, #0F172A 100%)',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          padding: '40px',
          borderRadius: '24px',
          boxShadow: '0 20px 48px rgba(0,0,0,0.3)',
          width: '100%',
          maxWidth: '420px',
          position: 'relative',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '56px',
              height: '56px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #07152B 0%, #1E3A8A 100%)',
              color: '#FFFFFF',
              fontSize: '1.8rem',
              marginBottom: '12px',
              boxShadow: '0 8px 20px rgba(30, 58, 138, 0.3)',
            }}
          >
            {step === 'login' ? '🎓' : '🛡️'}
          </div>
          <h1 style={{ fontSize: '1.7rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
            StudyAI
          </h1>
          <p style={{ color: '#64748B', fontSize: '0.9rem', marginTop: '6px' }}>
            {step === 'login' ? '合格逆算型 AI学習支援システム' : '二要素認証（2FA）確認'}
          </p>
        </div>

        {error && (
          <div
            style={{
              background: '#FEE2E2',
              color: '#991B1B',
              padding: '12px 16px',
              borderRadius: '10px',
              marginBottom: '18px',
              fontSize: '0.88rem',
              border: '1px solid #FCA5A5',
              lineHeight: 1.5,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* ========================================================= */}
        {/* STEP 1: 通常ID/PWログイン */}
        {/* ========================================================= */}
        {step === 'login' ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                ログインID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="例: student01 または hiroaki"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  fontSize: '1rem',
                  outline: 'none',
                }}
                required
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                  パスワード
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotInput(userId);
                    setForgotMsg('');
                    setShowForgotModal(true);
                  }}
                  style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  パスワードをお忘れですか？
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: '1px solid #CBD5E1',
                  fontSize: '1rem',
                  outline: 'none',
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
              style={{
                marginTop: '10px',
                padding: '14px',
                fontSize: '1.05rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #07152B 0%, #1E3A8A 100%)',
                boxShadow: '0 6px 18px rgba(15, 23, 42, 0.25)',
              }}
            >
              {isLoading ? 'ログイン確認中...' : 'ログイン'}
            </button>
          </form>
        ) : (
          /* ========================================================= */
          /* STEP 2: 二要素認証（2FA）OTPコード入力 */
          /* ========================================================= */
          <form onSubmit={handleVerify2Fa} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '14px', borderRadius: '12px', fontSize: '0.86rem', color: '#1E40AF', lineHeight: 1.6 }}>
              📩 <strong>{maskedEmail}</strong> 宛に送信された<strong>6桁の認証コード</strong>を入力してください。
              <div style={{ fontSize: '0.78rem', color: '#60A5FA', marginTop: '4px' }}>
                ※有効期限: 10分間
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                認証コード（6桁の半角数字）
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                autoFocus
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '12px',
                  border: '2px solid #2563EB',
                  fontSize: '1.6rem',
                  letterSpacing: '0.35em',
                  textAlign: 'center',
                  fontWeight: 800,
                  outline: 'none',
                  fontFamily: 'monospace',
                }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCode.length < 6}
              className="btn btn-primary"
              style={{
                marginTop: '6px',
                padding: '14px',
                fontSize: '1.05rem',
                fontWeight: 700,
                background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
              }}
            >
              {isLoading ? '認証中...' : '認証してログインを完了'}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep('login');
                setError('');
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                fontSize: '0.85rem',
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              ← ログイン画面に戻る
            </button>
          </form>
        )}

        <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #F1F5F9', textAlign: 'center', fontSize: '0.82rem', color: '#94A3B8' }}>
          安全なゼロトラスト認証 & 利用期間管理適用中
        </div>
      </div>

      {/* ========================================================= */}
      {/* パスワード忘れモーダル */}
      {/* ========================================================= */}
      {showForgotModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <h2 style={{ margin: '0 0 10px 0', fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>
              🔑 パスワードの再設定
            </h2>
            <p style={{ color: '#64748B', fontSize: '0.88rem', lineHeight: 1.5, marginBottom: '20px' }}>
              登録されているログインID、またはメールアドレスを入力してください。ご案内メールを送信します。
            </p>

            {forgotMsg ? (
              <div>
                <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#065F46', padding: '14px', borderRadius: '12px', fontSize: '0.9rem', marginBottom: '20px', lineHeight: 1.5 }}>
                  ✅ {forgotMsg}
                </div>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontWeight: 700 }}
                >
                  閉じる
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>
                    ログインID または メールアドレス
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotInput}
                    onChange={(e) => setForgotInput(e.target.value)}
                    placeholder="例: student01 または name@example.com"
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontSize: '0.96rem' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="btn btn-secondary"
                    style={{ flex: 1, padding: '12px' }}
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="btn btn-primary"
                    style={{ flex: 1, padding: '12px', fontWeight: 700 }}
                  >
                    {forgotLoading ? '送信中...' : '再発行メール送信'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0F172A' }} />}>
      <LoginFormContent />
    </Suspense>
  );
}
