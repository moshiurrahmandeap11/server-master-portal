import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { storeEmailOtp } from '@/lib/verificationStore';
import { sendOtpEmail } from '@/lib/email';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cleanEmail = (body?.email || '').trim().toLowerCase();

    if (!cleanEmail) {
      return NextResponse.json({ error: 'ইমেইল এড্রেস প্রদান করুন।' }, { status: 400 });
    }

    const candidate = serverDB.getCandidateByEmail(cleanEmail);
    if (!candidate) {
      return NextResponse.json({ error: 'এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
    }

    if (candidate.isEmailVerified) {
      return NextResponse.json({ error: 'এই ইমেইল ইতিমধ্যে ভেরিফাই করা হয়েছে। সরাসরি লগইন করুন।' }, { status: 400 });
    }

    // Generate new OTP & dispatch email
    const otp = storeEmailOtp(cleanEmail, candidate.id);
    const emailResult = await sendOtpEmail(cleanEmail, otp, 'verify');

    return NextResponse.json({
      success: true,
      email: cleanEmail,
      devOtp: emailResult.devOtp,
      message: 'আপনার ইমেইল ঠিকানায় নতুন ৬-সংখ্যার ভেরিফিকেশন কোড পাঠানো হয়েছে।'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Resend failed' }, { status: 500 });
  }
}
