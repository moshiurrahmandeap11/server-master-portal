import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { generateAuthTokens, setAuthCookies } from '@/lib/auth';
import { emptyCandidateProfile } from '@/lib/candidate-defaults';
import { generateSmartCandidateId, generateSmartUsername } from '@/lib/id-generator';
import crypto from 'crypto';

/**
 * Enterprise Google OAuth 2.0 Token Verification
 * Uses Google's official public tokeninfo endpoint.
 * Works seamlessly with GOOGLE_CLIENT_ID from .env.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const token = body?.credential || body?.id_token || body?.token;

    if (!token) {
      return NextResponse.json({ error: 'গুগল ক্রেডেনশিয়াল টোকেন পাওয়া যায়নি।' }, { status: 400 });
    }

    // 1. Verify token with Google's public endpoint
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`);
    if (!googleRes.ok) {
      return NextResponse.json({ error: 'গুগল সাইন-ইন টোকেন ভ্যালিডেশন ব্যর্থ হয়েছে।' }, { status: 401 });
    }

    const payload = await googleRes.json();
    const { email, name, picture, sub, aud, email_verified } = payload;

    if (!email) {
      return NextResponse.json({ error: 'গুগল অ্যাকাউন্ট থেকে কোনো ইমেইল পাওয়া যায়নি।' }, { status: 400 });
    }

    // 2. Validate Audience against configured GOOGLE_CLIENT_ID if present in .env
    const configuredClientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (configuredClientId && aud !== configuredClientId) {
      console.warn(`[Google OAuth Warning] Token audience mismatch: ${aud} vs ${configuredClientId}`);
      return NextResponse.json({ error: 'গুগল ক্লায়েন্ট আইডি অমিল (Client ID mismatch)।' }, { status: 401 });
    }

    const cleanEmail = email.trim().toLowerCase();

    // 3. Find or Create Candidate
    let candidate = serverDB.getCandidateByEmail(cleanEmail);

    if (!candidate) {
      const fallbackPhone = '017' + Math.floor(10000000 + Math.random() * 90000000).toString();
      const candidateId = `USR-GGL-${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
      const displayName = (name || 'গুগল ইউজার').trim();
      const generatedUsername = generateSmartUsername(displayName, cleanEmail.split('@')[0], (u) => !!serverDB.getCandidateByIdentifier(u));

      candidate = serverDB.createCandidate({
        ...structuredClone(emptyCandidateProfile),
        id: candidateId,
        email: cleanEmail,
        phone: '',
        username: generatedUsername,
        name: displayName,
        nameBn: displayName,
        district: 'ঢাকা',
        division: 'ঢাকা',
        passwordHash: '',
        photoUrl: picture || '',
        role: 'candidate',
        isEmailVerified: true, // Google accounts are pre-verified
        googleId: sub,
        walletBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    } else {
      // If user exists, mark email verified and update Google ID / Photo if missing
      const updates: any = { isEmailVerified: true };
      if (!candidate.photoUrl && picture) updates.photoUrl = picture;
      if (!candidate.googleId && sub) updates.googleId = sub;
      candidate = serverDB.updateCandidate(candidate.id, updates);
    }

    // 4. Issue dual httpOnly cookies
    const { accessToken, refreshToken } = generateAuthTokens({
      candidateId: candidate.id,
      role: 'candidate',
      email: candidate.email
    });

    const { passwordHash: _, ...safeCandidate } = candidate;
    const res = NextResponse.json({
      success: true,
      message: 'গুগল সাইন-ইন সফল হয়েছে!',
      role: 'candidate',
      user: safeCandidate,
      redirectUrl: '/dashboard'
    });

    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Google authentication failed' }, { status: 500 });
  }
}
