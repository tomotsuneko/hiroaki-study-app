import crypto from 'crypto';

/**
 * パスワードの安全なハッシュ化（PBKDF2 with SHA-512 & Salt）
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

/**
 * パスワードの検証（新形式 pbkdf2$salt$hash および 移行用旧平文パスワードに対応）
 */
export function verifyPassword(password: string, storedPasswordHash: string): boolean {
  if (!storedPasswordHash) return false;

  // 新形式: pbkdf2$salt$hash
  if (storedPasswordHash.startsWith('pbkdf2$')) {
    const parts = storedPasswordHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHash] = parts;
    const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
  }

  // 移行用の旧平文パスワード検証
  return password === storedPasswordHash;
}

/**
 * 暗号学的に安全なランダムパスワード生成（10文字：英大文字・小文字・数字・特殊記号）
 */
export function generateRandomPassword(length: number = 10): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!#$%=@';
  const all = upper + lower + digits + symbols;

  let pwd = '';
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += symbols[crypto.randomInt(0, symbols.length)];

  for (let i = 4; i < length; i++) {
    pwd += all[crypto.randomInt(0, all.length)];
  }

  // シャッフル
  return pwd.split('').sort(() => 0.5 - Math.random()).join('');
}

/**
 * 6桁の二要素認証ワンタイム数字コード生成
 */
export function generateTwoFactorOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * 一時2FAトークン生成（ランダムhex）
 */
export function generateTemp2FaToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * 利用可能期間（validFrom 〜 validUntil）の判定
 */
export function checkAccountPeriod(validFrom?: string, validUntil?: string): {
  isValid: boolean;
  reason?: 'not_started' | 'expired';
} {
  const now = new Date();

  if (validFrom) {
    const from = new Date(validFrom);
    if (now < from) {
      return { isValid: false, reason: 'not_started' };
    }
  }

  if (validUntil) {
    // 終了日の23:59:59まで有効とする
    const until = new Date(validUntil);
    until.setHours(23, 59, 59, 999);
    if (now > until) {
      return { isValid: false, reason: 'expired' };
    }
  }

  return { isValid: true };
}
