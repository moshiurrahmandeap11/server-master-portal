import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { serverDB } from '@/lib/db';
import { clearAuthCookies, REFRESH_TOKEN_COOKIE, verifyRefreshToken } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value || cookieStore.get('cs_refresh_token')?.value;
    if (refreshToken) {
      const decoded = verifyRefreshToken(refreshToken);
      if (decoded?.tokenId) {
        serverDB.revokeSession(decoded.tokenId);
      }
    }

    const legacyToken = cookieStore.get('cs_session_token')?.value;
    if (legacyToken) {
      serverDB.revokeSession(legacyToken);
    }

    const res = NextResponse.json({ success: true, message: 'সফলভাবে লগআউট সম্পন্ন হয়েছে।' });
    clearAuthCookies(res);
    return res;
  } catch (err: any) {
    const res = NextResponse.json({ error: err.message }, { status: 500 });
    clearAuthCookies(res);
    return res;
  }
}
