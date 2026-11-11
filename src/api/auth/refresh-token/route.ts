import { NextResponse } from 'next/server';
import { 
  verifyRefreshToken, 
  generateAuthTokens, 
  setAuthCookies, 
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE
} from '@/lib/auth';
import { serverDB } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    
    // Extract refresh token from cookie or body
    let refreshToken = '';
    const match = cookieHeader.match(/(?:^|;\s*)(?:refreshToken|cs_refresh_token)=([^;]+)/);
    if (match) {
      refreshToken = decodeURIComponent(match[1]);
    }

    if (!refreshToken) {
      try {
        const body = await req.json();
        refreshToken = body?.refreshToken || '';
      } catch {}
    }

    if (!refreshToken) {
      const res = NextResponse.json({ error: 'রিফ্রেশ টোকেন পাওয়া যায়নি।' }, { status: 401 });
      clearAuthCookies(res);
      return res;
    }

    // Verify token cryptographic signature and active session in DB
    const verified = verifyRefreshToken(refreshToken);
    if (!verified) {
      const res = NextResponse.json({ error: 'অবৈধ বা মেয়াদোত্তীর্ণ রিফ্রেশ টোকেন। পুনরায় লগইন করুন।' }, { status: 401 });
      clearAuthCookies(res);
      return res;
    }

    // Rotate refresh session (revoke old session ID)
    serverDB.revokeSession(verified.tokenId);

    // If Admin session
    if (verified.role === 'admin') {
      const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens({
        candidateId: 'ADMIN-SUPER',
        role: 'admin'
      });

      const res = NextResponse.json({
        success: true,
        role: 'admin',
        user: { id: 'ADMIN-SUPER', name: 'Super Admin', role: 'admin' }
      });
      setAuthCookies(res, accessToken, newRefreshToken);
      return res;
    }

    // If Candidate session
    const candidate = serverDB.getCandidateById(verified.candidateId);
    if (!candidate) {
      const res = NextResponse.json({ error: 'ব্যবহারকারী খুঁজে পাওয়া যায়নি।' }, { status: 401 });
      clearAuthCookies(res);
      return res;
    }

    const { accessToken, refreshToken: newRefreshToken } = generateAuthTokens({
      candidateId: candidate.id,
      role: 'candidate',
      email: candidate.email
    });

    const { passwordHash: _, ...safeCandidate } = candidate;
    const res = NextResponse.json({
      success: true,
      role: 'candidate',
      user: safeCandidate
    });
    setAuthCookies(res, accessToken, newRefreshToken);
    return res;
  } catch (err: any) {
    const res = NextResponse.json({ error: err.message || 'Token refresh failed' }, { status: 500 });
    clearAuthCookies(res);
    return res;
  }
}
