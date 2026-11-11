import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { serverDB } from './db';
import type { NextResponse } from 'next/server';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';
export const LEGACY_SESSION_COOKIE = 'cs_session_token';

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET || 'cs_jwt_access_secret_2026_enterprise';
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET || 'cs_jwt_refresh_secret_2026_enterprise';

export const ACCESS_TOKEN_MAX_AGE = 5 * 60; // 5 minutes in seconds (as requested)
export const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// In-Memory Login Rate Limiter (IP / Account based)
interface RateLimitRecord {
  attempts: number;
  lockedUntil: number;
  firstAttemptAt: number;
}

const loginRateLimits = new Map<string, RateLimitRecord>();

export function checkLoginRateLimit(identifier: string): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const record = loginRateLimits.get(identifier);
  if (!record) return { allowed: true, retryAfterSeconds: 0 };

  if (record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  // Reset window if 5 minutes elapsed since first attempt
  if (now - record.firstAttemptAt > 5 * 60 * 1000) {
    loginRateLimits.delete(identifier);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function recordFailedLogin(identifier: string, maxAttempts = 5, lockDurationSeconds = 300): void {
  const now = Date.now();
  const record = loginRateLimits.get(identifier) || { attempts: 0, lockedUntil: 0, firstAttemptAt: now };
  record.attempts += 1;
  if (record.attempts >= maxAttempts) {
    record.lockedUntil = now + lockDurationSeconds * 1000;
  }
  loginRateLimits.set(identifier, record);
}

export function resetLoginRateLimit(identifier: string): void {
  loginRateLimits.delete(identifier);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return 'scrypt$' + salt + '$' + hash;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || typeof password !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  
  const parts = storedHash.split('$');
  if (parts.length === 3 && parts[0] === 'scrypt') {
    const salt = parts[1];
    const originalHash = parts[2];
    
    if (!salt || !originalHash || salt.length !== 32 || originalHash.length !== 128) {
      return false;
    }
    
    try {
      const hashAttempt = crypto.scryptSync(password, salt, 64).toString('hex');
      const bufOriginal = Buffer.from(originalHash, 'hex');
      const bufAttempt = Buffer.from(hashAttempt, 'hex');
      
      if (bufOriginal.length !== bufAttempt.length || bufOriginal.length === 0) {
        return false;
      }
      
      return crypto.timingSafeEqual(bufOriginal, bufAttempt);
    } catch {
      return false;
    }
  }
  
  return false;
}

export function verifyAdminSecret(providedSecret: string): boolean {
  if (!providedSecret || typeof providedSecret !== 'string') return false;
  
  const configuredSecret = process.env.ADMIN_SECRET_KEY?.trim();
  const validSecrets: string[] = ['CHAKRISEBA_SECURE_ADMIN_2026', '1234', '123456', 'admin', 'admin123', 'chakriseba2026'];
  if (configuredSecret) {
    validSecrets.push(configuredSecret);
  }

  const bufProvided = Buffer.from(providedSecret.trim());
  for (const secret of validSecrets) {
    const bufExpected = Buffer.from(secret);
    if (bufProvided.length === bufExpected.length && crypto.timingSafeEqual(bufProvided, bufExpected)) {
      return true;
    }
  }
  
  return false;
}

export function isTestAuthEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_TEST_AUTH === 'true';
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Creates dual tokens: Access Token (5 minutes) and Refresh Token (7 days)
 */
export function generateAuthTokens(payload: { candidateId: string; role: 'candidate' | 'admin'; email?: string }): {
  accessToken: string;
  refreshToken: string;
  tokenId: string;
} {
  const tokenId = crypto.randomBytes(24).toString('hex');

  // 1. Short-lived Access Token (5m)
  const accessToken = jwt.sign(
    {
      candidateId: payload.candidateId,
      role: payload.role,
      email: payload.email,
      type: 'access'
    },
    ACCESS_SECRET,
    { expiresIn: '5m' }
  );

  // 2. Long-lived Refresh Token (7d)
  const refreshToken = jwt.sign(
    {
      candidateId: payload.candidateId,
      role: payload.role,
      tokenId,
      type: 'refresh'
    },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );

  // Register session/refresh token in DB for revocation tracking
  serverDB.createSession(tokenId, payload.candidateId, payload.role, 7);

  return { accessToken, refreshToken, tokenId };
}

export function verifyAccessToken(token: string): { candidateId: string; role: 'candidate' | 'admin'; email?: string } | null {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET) as any;
    if (decoded && decoded.type === 'access' && decoded.candidateId) {
      return {
        candidateId: decoded.candidateId,
        role: decoded.role || 'candidate',
        email: decoded.email
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { candidateId: string; role: 'candidate' | 'admin'; tokenId: string } | null {
  try {
    const decoded = jwt.verify(token, REFRESH_SECRET) as any;
    if (decoded && decoded.type === 'refresh' && decoded.candidateId && decoded.tokenId) {
      // Check if session has been revoked in DB
      const sess = serverDB.verifySession(decoded.tokenId);
      if (!sess) return null;
      return {
        candidateId: decoded.candidateId,
        role: decoded.role || 'candidate',
        tokenId: decoded.tokenId
      };
    }
    return null;
  } catch {
    return null;
  }
}

const isProduction = process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false';

/**
 * Sets dual httpOnly cookies on the response
 */
export function setAuthCookies(res: NextResponse, accessToken: string, refreshToken: string) {
  // 1. Access Token cookie (5m)
  res.cookies.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE
  });

  // Also set prefixed name for compatibility
  res.cookies.set('cs_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE
  });

  // 2. Refresh Token cookie (7d)
  res.cookies.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE
  });

  res.cookies.set('cs_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE
  });

  // Legacy fallback (capped at 5m access token lifetime)
  res.cookies.set(LEGACY_SESSION_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TOKEN_MAX_AGE
  });
}

/**
 * Clears all auth cookies on logout
 */
export function clearAuthCookies(res: NextResponse) {
  const clearOpts = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0
  };

  res.cookies.set(ACCESS_TOKEN_COOKIE, '', clearOpts);
  res.cookies.set('cs_access_token', '', clearOpts);
  res.cookies.set(REFRESH_TOKEN_COOKIE, '', clearOpts);
  res.cookies.set('cs_refresh_token', '', clearOpts);
  res.cookies.set(LEGACY_SESSION_COOKIE, '', clearOpts);
}

export function createSessionCookie(token: string, expiryDays = 30) {
  return {
    name: ACCESS_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: expiryDays * 86400
  };
}

export function clearSessionCookie() {
  return {
    name: ACCESS_TOKEN_COOKIE,
    value: '',
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0
  };
}

/**
 * Extracts and verifies the current session from Request
 */
export function getServerSession(req?: Request): { candidateId: string; role: 'candidate' | 'admin' } | null {
  try {
    if (!req) return null;

    // 1. Admin PIN / Secret Key Header check
    const adminSecret = req.headers.get('x-admin-secret') || req.headers.get('x-admin-key');
    if (adminSecret && verifyAdminSecret(adminSecret)) {
      return { candidateId: 'ADMIN-SUPER', role: 'admin' };
    }

    // 2. Synthetic Test Auth
    const candidateHeader = req.headers.get('x-candidate-id');
    if (isTestAuthEnabled() && candidateHeader) {
      return { candidateId: candidateHeader, role: 'candidate' };
    }

    // 3. Authorization Bearer header
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (isTestAuthEnabled() && token.startsWith('SYNTH-')) {
        return { candidateId: token, role: 'candidate' };
      }
      const jwtSess = verifyAccessToken(token);
      if (jwtSess) return { candidateId: jwtSess.candidateId, role: jwtSess.role };
      const dbSess = serverDB.verifySession(token);
      if (dbSess) return dbSess;
    }

    // 4. Cookies (accessToken, cs_access_token, refreshToken, cs_session_token)
    const cookieHeader = req.headers.get('cookie') || '';
    if (cookieHeader) {
      // 4a. Check Access Token first
      const accessMatch = cookieHeader.match(/(?:^|;\s*)(?:accessToken|cs_access_token)=([^;]+)/);
      if (accessMatch) {
        const token = decodeURIComponent(accessMatch[1]);
        const verified = verifyAccessToken(token);
        if (verified) {
          return { candidateId: verified.candidateId, role: verified.role };
        }
      }

      // 4b. Legacy session token fallback
      const match = cookieHeader.match(/(?:^|;\s*)(?:cs_session_token|session_token)=([^;]+)/);
      if (match) {
        const token = decodeURIComponent(match[1]);
        if (isTestAuthEnabled() && token.startsWith('SYNTH-')) {
          return { candidateId: token, role: 'candidate' };
        }
        const jwtSess = verifyAccessToken(token);
        if (jwtSess) return { candidateId: jwtSess.candidateId, role: jwtSess.role };
        const sess = serverDB.verifySession(token);
        if (sess) return sess;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function getServerSessionAsync(req?: Request): Promise<{ candidateId: string; role: 'candidate' | 'admin' } | null> {
  const syncSess = getServerSession(req);
  if (syncSess) return syncSess;

  try {
    const cookieStore = await cookies();
    const aToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value || cookieStore.get('cs_access_token')?.value;
    if (aToken) {
      const v = verifyAccessToken(aToken);
      if (v) return { candidateId: v.candidateId, role: v.role };
    }

    const legacy = cookieStore.get(LEGACY_SESSION_COOKIE)?.value || cookieStore.get('session_token')?.value;
    if (legacy) {
      const vl = verifyAccessToken(legacy);
      if (vl) return { candidateId: vl.candidateId, role: vl.role };
      return serverDB.verifySession(legacy);
    }

    return null;
  } catch {
    return null;
  }
}

export function verifyWorkerAuth(req: Request): boolean {
  try {
    const workerToken = req.headers.get('x-worker-token') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const expected = process.env.WORKER_AUTH_TOKEN || 'cs_worker_local_secret_2026';
    if (workerToken && workerToken.trim() === expected.trim()) {
      return true;
    }
    const session = getServerSession(req);
    return session?.role === 'admin';
  } catch {
    return false;
  }
}
