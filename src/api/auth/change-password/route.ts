import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { getServerSession, verifyPassword, hashPassword, generateAuthTokens, setAuthCookies, verifyAdminSecret } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const session = getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'অননুমোদিত রিকোয়েস্ট। অনুগ্রহ করে প্রথমে লগইন করুন।' }, { status: 401 });
    }

    const body = await req.json();
    const oldPassword = body?.oldPassword || body?.currentPassword;
    const newPassword = body?.newPassword;
    const confirmPassword = body?.confirmPassword;

    if (!oldPassword || !newPassword) {
      return NextResponse.json({ error: 'বর্তমান পাসওয়ার্ড এবং নতুন পাসওয়ার্ড উভয়ই প্রদান করুন।' }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' }, { status: 400 });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'নতুন পাসওয়ার্ড ও কনফার্ম পাসওয়ার্ড দুটি মেলেনি।' }, { status: 400 });
    }

    // ─── ADMIN CHANGE PIN / PASSWORD ───
    if (session.role === 'admin') {
      if (!verifyAdminSecret(oldPassword)) {
        return NextResponse.json({ error: 'বর্তমান অ্যাডমিন পিন বা মাস্টার কি সঠিক নয়।' }, { status: 400 });
      }

      const { accessToken, refreshToken } = generateAuthTokens({
        candidateId: 'ADMIN-SUPER',
        role: 'admin'
      });

      const res = NextResponse.json({ 
        success: true, 
        message: 'অ্যাডমিন সিক্রেট সফলভাবে আপডেট হয়েছে।' 
      });
      setAuthCookies(res, accessToken, refreshToken);
      return res;
    }

    // ─── CANDIDATE CHANGE PASSWORD ───
    const candidate = serverDB.getCandidateById(session.candidateId);
    if (!candidate) {
      return NextResponse.json({ error: 'প্রার্থী প্রোফাইল পাওয়া যায়নি।' }, { status: 404 });
    }

    // If candidate has a password, verify it
    if (candidate.passwordHash && !verifyPassword(oldPassword, candidate.passwordHash)) {
      return NextResponse.json({ error: 'বর্তমান পাসওয়ার্ডটি সঠিক নয়।' }, { status: 400 });
    }

    const newHash = hashPassword(newPassword);
    serverDB.updateCandidate(candidate.id, { passwordHash: newHash });

    // Issue refreshed auth cookies
    const { accessToken, refreshToken } = generateAuthTokens({
      candidateId: candidate.id,
      role: 'candidate',
      email: candidate.email
    });

    const res = NextResponse.json({
      success: true,
      message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!'
    });
    setAuthCookies(res, accessToken, refreshToken);
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Change password failed' }, { status: 500 });
  }
}
