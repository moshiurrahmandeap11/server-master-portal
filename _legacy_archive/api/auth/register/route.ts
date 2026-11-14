import { NextResponse } from 'next/server';
import { serverDB } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { emptyCandidateProfile } from '@/lib/candidate-defaults';
import { generateSmartCandidateId, generateSmartUsername } from '@/lib/id-generator';
import { BD_DIVISIONS_MAP } from '@/lib/constants';
import { sendOtpEmail } from '@/lib/email';
import { storeEmailOtp } from '@/lib/verificationStore';
import crypto from 'crypto';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, nameBn, phone, username, district, division } = body;

    const enName = (name || '').trim();
    const bnName = (nameBn || '').trim();

    if (!enName && !bnName) {
      return NextResponse.json({ error: 'প্রার্থীর পূর্ণ নাম প্রদান করুন।' }, { status: 400 });
    }

    // Email is strictly REQUIRED
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return NextResponse.json({ error: 'সঠিক ইমেইল এড্রেস প্রদান করুন।' }, { status: 400 });
    }

    const existingEmail = serverDB.getCandidateByEmail(cleanEmail);
    if (existingEmail) {
      return NextResponse.json({ error: 'এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। সরাসরি লগইন করুন।' }, { status: 409 });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।' }, { status: 400 });
    }

    // Phone is OPTIONAL
    let cleanPhone = '';
    if (phone && String(phone).trim()) {
      cleanPhone = String(phone)
        .replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit)))
        .replace(/\D/g, '')
        .replace(/^880/, '0');

      if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
        return NextResponse.json({ error: 'সঠিক ১১-সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 01XXXXXXXXX)।' }, { status: 400 });
      }

      const existingPhone = serverDB.getCandidateByPhone(cleanPhone);
      if (existingPhone) {
        return NextResponse.json({ error: 'এই মোবাইল নম্বর দিয়ে ইতিমধ্যে অ্যাকাউন্ট রয়েছে।' }, { status: 409 });
      }
    }

    // Auto-detect division if not provided
    const selectedDistrict = (district || 'ঢাকা').trim();
    let detectedDivision = division;
    if (!detectedDivision) {
      for (const [_, divData] of Object.entries(BD_DIVISIONS_MAP)) {
        if (divData.districts.some(d => d.bn === selectedDistrict || d.en.toLowerCase() === selectedDistrict.toLowerCase())) {
          detectedDivision = divData.bn;
          break;
        }
      }
    }

    const candidateId = cleanPhone 
      ? generateSmartCandidateId(cleanPhone) 
      : `USR-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`.toUpperCase();

    const primaryName = enName || bnName;
    const generatedUsername = (username && username.trim()) 
      ? username.trim().toLowerCase() 
      : generateSmartUsername(primaryName, cleanPhone || cleanEmail.split('@')[0], (u) => !!serverDB.getCandidateByIdentifier(u));

    // Zero-balance digital wallet and empty vault profile initialization
    const newCandidate = serverDB.createCandidate({
      ...structuredClone(emptyCandidateProfile),
      id: candidateId,
      email: cleanEmail,
      phone: cleanPhone,
      username: generatedUsername,
      name: enName || bnName,
      nameBn: bnName || enName,
      district: selectedDistrict,
      division: detectedDivision || 'ঢাকা',
      passwordHash: hashPassword(password),
      role: 'candidate',
      isEmailVerified: false, // Requires OTP email confirmation
      walletBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Generate & Dispatch 6-digit OTP to the registered Email
    const otp = storeEmailOtp(cleanEmail, newCandidate.id);
    const emailResult = await sendOtpEmail(cleanEmail, otp, 'verify');

    return NextResponse.json({ 
      success: true, 
      requiresVerification: true,
      email: cleanEmail,
      devOtp: emailResult.devOtp, // Visible in dev console/response if SMTP is unconfigured
      message: 'রেজিস্ট্রেশন সফল হয়েছে! আপনার ইমেইল ঠিকানায় ৬-সংখ্যার ভেরিফিকেশন কোড পাঠানো হয়েছে।'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Registration failed' }, { status: 500 });
  }
}
