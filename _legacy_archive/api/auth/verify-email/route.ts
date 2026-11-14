import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { verifyEmailOtp } from '@/lib/verificationStore';
import { generateAuthTokens, setAuthCookies } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, otp } = body;

    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !otp) {
      return NextResponse.json({ error: 'ইমেইল এবং ৬-ডিজিটের ভেরিফিকেশন কোড প্রদান করুন।' }, { status: 400 });
    }

    const verification = verifyEmailOtp(cleanEmail, otp);
    if (!verification.valid) {
      return NextResponse.json({ error: verification.error || 'ভুল বা মেয়াদোত্তীর্ণ ওটিপি কোড।' }, { status: 400 });
    }

    // Find candidate by email or candidateId
    let candidate = verification.candidateId ? serverDB.getCandidateById(verification.candidateId) : null;
    if (!candidate) {
      candidate = serverDB.getCandidateByEmail(cleanEmail);
    }

    if (!candidate) {
      return NextResponse.json({ error: 'প্রার্থী প্রোফাইল খুঁজে পাওয়া যায়নি।' }, { status: 404 });
    }

    // Mark email as verified
    candidate.isEmailVerified = true;
    serverDB.updateCandidate(candidate.id, { isEmailVerified: true });

    // Auto-login: issue dual httpOnly cookies
    const { accessToken, refreshToken } = generateAuthTokens({
      candidateId: candidate.id,
      role: 'candidate',
      email: candidate.email
    });

    const { passwordHash: _, ...safeCandidate } = candidate;
    const res = NextResponse.json({
      success: true,
      message: 'আপনার ইমেইল সফলভাবে যাচাই হয়েছে! ড্যাশবোর্ডে প্রবেশ করা হচ্ছে...',
      user: safeCandidate,
      redirectUrl: '/dashboard'
    });

    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Verification failed' }, { status: 500 });
  }
}
