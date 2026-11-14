import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { hashPassword, generateAuthTokens, setAuthCookies } from '@/lib/auth';
import { sendOtpEmail } from '@/lib/email';
import { mockUserProfile } from '@/data/mockJobs';

// In-Memory store for password reset OTPs (10-minute expiry)
interface ResetRecord {
  identifier: string;
  otp: string;
  candidateId: string;
  expiresAt: number;
}

const otpStore = new Map<string, ResetRecord>();

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, identifier, otp, newPassword } = body;
    const cleanId = (identifier || '').trim().toLowerCase();

    if (!cleanId) {
      return NextResponse.json({ error: 'ইমেইল অথবা মোবাইল নম্বর প্রদান করুন।' }, { status: 400 });
    }

    // 1. REQUEST OTP
    if (action === 'request_otp') {
      let candidate = serverDB.getCandidateByIdentifier(cleanId);
      
      // Allow demo user reset
      if (!candidate) {
        const cleanPhone = cleanId.replace(/[^0-9]/g, '');
        if (cleanPhone === '01712345678' || cleanId === 'tanvir.jobseeker@gmail.com' || cleanId === 'tanvir2026') {
          candidate = serverDB.createCandidate({
            ...mockUserProfile,
            id: 'USR-01712345678',
            phone: '01712-345678',
            email: 'tanvir.jobseeker@gmail.com',
            username: 'tanvir2026',
            name: 'মোঃ তানভীর হাসান',
            nameBn: 'মোঃ তানভীর হাসান',
            passwordHash: hashPassword('123456'),
            role: 'candidate',
            isEmailVerified: true,
            walletBalance: 450,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      if (!candidate) {
        return NextResponse.json({ 
          error: 'এই তথ্য অনুযায়ী কোনো অ্যাকাউন্ট পাওয়া যায়নি। সঠিক ইমেইল বা মোবাইল নম্বর দিন।' 
        }, { status: 404 });
      }

      // Generate 6-digit OTP
      const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      otpStore.set(cleanId, {
        identifier: cleanId,
        otp: generatedOtp,
        candidateId: candidate.id,
        expiresAt
      });

      const isEmail = cleanId.includes('@') || Boolean(candidate.email);
      const targetEmail = candidate.email || (cleanId.includes('@') ? cleanId : '');

      let maskedTarget = '';
      if (targetEmail) {
        const [user, domain] = targetEmail.split('@');
        maskedTarget = `${user.slice(0, 2)}***@${domain}`;
        // Dispatch real email via SMTP
        await sendOtpEmail(targetEmail, generatedOtp, 'forgot');
      } else {
        const p = candidate.phone || cleanId;
        maskedTarget = p.length >= 8 ? `${p.slice(0, 3)}****${p.slice(-3)}` : p;
      }

      return NextResponse.json({
        success: true,
        channel: isEmail ? 'email' : 'phone',
        maskedTarget,
        testOtp: generatedOtp, // Included for development ease
        message: `আপনার ${isEmail ? 'ইমেইলে' : 'মোবাইলে'} (${maskedTarget}) একটি ৬-ডিজিটের পাসওয়ার্ড রিসেট কোড পাঠানো হয়েছে।`
      });
    }

    // 2. VERIFY OTP
    if (action === 'verify_otp') {
      const record = otpStore.get(cleanId);
      if (!record || record.expiresAt < Date.now()) {
        return NextResponse.json({ error: 'ভেরিফিকেশন কোডের মেয়াদ শেষ হয়েছে। পুনরায় কোড চেয়ে পাঠান।' }, { status: 400 });
      }

      if (record.otp !== (otp || '').trim()) {
        return NextResponse.json({ error: 'ভুল ওটিপি কোড! অনুগ্রহ করে সঠিক ৬-ডিজিটের কোড দিন।' }, { status: 400 });
      }

      return NextResponse.json({ success: true, verified: true, message: 'কোড সফলভাবে যাচাই হয়েছে।' });
    }

    // 3. RESET PASSWORD
    if (action === 'reset_password') {
      const record = otpStore.get(cleanId);
      if (!record || record.expiresAt < Date.now()) {
        return NextResponse.json({ error: 'সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার শুরু করুন।' }, { status: 400 });
      }

      if (record.otp !== (otp || '').trim()) {
        return NextResponse.json({ error: 'অবৈধ বা ভুল ওটিপি কোড।' }, { status: 400 });
      }

      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' }, { status: 400 });
      }

      const candidate = serverDB.getCandidateById(record.candidateId);
      if (!candidate) {
        return NextResponse.json({ error: 'প্রার্থী প্রোফাইল খুঁজে পাওয়া যায়নি।' }, { status: 404 });
      }

      // Update password hash
      const newHash = hashPassword(newPassword);
      serverDB.updateCandidate(candidate.id, { passwordHash: newHash });

      // Clean up OTP record
      otpStore.delete(cleanId);

      // Auto login: issue dual httpOnly cookies
      const { accessToken, refreshToken } = generateAuthTokens({
        candidateId: candidate.id,
        role: 'candidate',
        email: candidate.email
      });

      const { passwordHash: _, ...safeCandidate } = candidate;
      const res = NextResponse.json({
        success: true,
        message: 'আপনার পাসওয়ার্ড সফলভাবে পরিবর্তিত হয়েছে! ড্যাশবোর্ডে প্রবেশ করা হচ্ছে...',
        user: safeCandidate,
        redirectUrl: '/dashboard'
      });

      setAuthCookies(res, accessToken, refreshToken);
      return res;
    }

    return NextResponse.json({ error: 'অননুমোদিত রিকোয়েস্ট অ্যাকশন।' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Password reset failed' }, { status: 500 });
  }
}
