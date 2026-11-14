import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'study_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  userId: string;
  role: 'admin' | 'student';
  exp: number; // Unix timestamp in seconds
}

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.FIREBASE_PRIVATE_KEY ||
    'abiko-study-session-fallback-key'
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

async function getHmacKey(usage: 'sign' | 'verify'): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(getSessionSecret());
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage]
  );
}

export async function signSessionToken(
  userId: string,
  role: string,
  maxAgeSeconds = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const normalizedRole: 'admin' | 'student' =
    role === 'admin' || userId === 'admin' ? 'admin' : 'student';
  const payload: SessionPayload = {
    userId,
    role: normalizedRole,
    exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
  };
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(JSON.stringify(payload));
  const payloadB64 = base64UrlEncode(payloadBytes);

  const key = await getHmacKey('sign');
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = base64UrlEncode(new Uint8Array(sigBuffer));
  return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, sigB64] = parts;
  if (!payloadB64 || !sigB64) return null;

  const sigBytes = base64UrlDecode(sigB64);
  if (!sigBytes) return null;

  try {
    const encoder = new TextEncoder();
    const key = await getHmacKey('verify');
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer as ArrayBuffer,
      encoder.encode(payloadB64)
    );
    if (!valid) return null;

    const payloadBytes = base64UrlDecode(payloadB64);
    if (!payloadBytes) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;

    if (
      !payload ||
      typeof payload.userId !== 'string' ||
      !payload.userId ||
      typeof payload.exp !== 'number' ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return {
      userId: payload.userId,
      role: payload.role === 'admin' || payload.userId === 'admin' ? 'admin' : 'student',
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token);
}

export async function requireAdminSession(): Promise<SessionPayload | null> {
  const session = await getSessionFromCookies();
  if (!session || session.role !== 'admin') {
    return null;
  }
  return session;
}
