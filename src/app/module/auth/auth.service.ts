import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { bcryptUtils } from '../../utils/bcrypt';
import { jwtUtils } from '../../utils/jwt';
import { emailUtils } from '../../utils/email';
import { ISignUpPayload, ILoginPayload, IVerifyOtpPayload, IAuthResponse } from './auth.interface';
import { OtpType, UserRole } from '../../../generated/prisma';

export const authService = {
  signUp: async (payload: ISignUpPayload) => {
    const cleanEmail = payload.email.trim().toLowerCase();
    const existing = await prisma.candidate.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      throw new AppError(status.CONFLICT, 'এই ইমেইল দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে। সরাসরি লগইন করুন।');
    }

    const passwordHash = await bcryptUtils.hashPassword(payload.password);
    const cleanUsername = payload.username?.trim().toLowerCase() || `usr_${cleanEmail.split('@')[0]}_${Math.floor(1000 + Math.random() * 9000)}`;

    const candidate = await prisma.candidate.create({
      data: {
        email: cleanEmail,
        name: payload.name.trim(),
        nameBn: payload.nameBn?.trim(),
        phone: payload.phone?.trim() || null,
        username: cleanUsername,
        passwordHash,
        district: payload.district || 'ঢাকা',
        division: payload.division || 'ঢাকা',
        role: UserRole.CANDIDATE,
        isEmailVerified: false,
      },
    });

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.verificationOtp.create({
      data: {
        email: cleanEmail,
        otp,
        type: OtpType.VERIFY_EMAIL,
        candidateId: candidate.id,
        expiresAt,
      },
    });

    const emailRes = await emailUtils.sendOtpEmail(cleanEmail, otp, 'verify');

    return {
      candidateId: candidate.id,
      email: cleanEmail,
      requiresVerification: true,
      devOtp: emailRes.devOtp,
    };
  },

  login: async (payload: ILoginPayload): Promise<IAuthResponse> => {
    const id = payload.loginId.trim().toLowerCase();
    const candidate = await prisma.candidate.findFirst({
      where: {
        OR: [
          { email: id },
          { username: id },
          { phone: id },
        ],
      },
    });

    if (!candidate) {
      throw new AppError(status.UNAUTHORIZED, 'ভুল ইউজারনেম/ইমেইল অথবা পাসওয়ার্ড।');
    }

    const isValid = await bcryptUtils.comparePassword(payload.password, candidate.passwordHash);
    if (!isValid) {
      throw new AppError(status.UNAUTHORIZED, 'ভুল ইউজারনেম/ইমেইল অথবা পাসওয়ার্ড।');
    }

    const tokenPayload = {
      candidateId: candidate.id,
      email: candidate.email,
      role: candidate.role,
      phone: candidate.phone,
      name: candidate.name,
    };

    const accessToken = jwtUtils.createAccessToken(tokenPayload);
    const refreshToken = jwtUtils.createRefreshToken({ candidateId: candidate.id });

    // Save refresh session in DB
    await prisma.session.create({
      data: {
        candidateId: candidate.id,
        refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: candidate.id,
        email: candidate.email,
        name: candidate.name,
        role: candidate.role,
        phone: candidate.phone,
        username: candidate.username,
        isEmailVerified: candidate.isEmailVerified,
        walletBalance: Number(candidate.walletBalance),
        district: candidate.district,
        division: candidate.division,
      },
      accessToken,
      refreshToken,
    };
  },

  verifyEmailOtp: async (payload: IVerifyOtpPayload): Promise<IAuthResponse> => {
    const cleanEmail = payload.email.trim().toLowerCase();
    const otpRecord = await prisma.verificationOtp.findFirst({
      where: {
        email: cleanEmail,
        otp: payload.otp.trim(),
        isUsed: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new AppError(status.BAD_REQUEST, 'ভুল বা মেয়াদোত্তীর্ণ ওটিপি কোড। পুনরায় ওটিপি পাঠান।');
    }

    await prisma.verificationOtp.update({
      where: { id: otpRecord.id },
      data: { isUsed: true },
    });

    const candidate = await prisma.candidate.update({
      where: { email: cleanEmail },
      data: { isEmailVerified: true },
    });

    const tokenPayload = {
      candidateId: candidate.id,
      email: candidate.email,
      role: candidate.role,
      phone: candidate.phone,
      name: candidate.name,
    };

    const accessToken = jwtUtils.createAccessToken(tokenPayload);
    const refreshToken = jwtUtils.createRefreshToken({ candidateId: candidate.id });

    return {
      user: {
        id: candidate.id,
        email: candidate.email,
        name: candidate.name,
        role: candidate.role,
        phone: candidate.phone,
        username: candidate.username,
        isEmailVerified: true,
        walletBalance: Number(candidate.walletBalance),
        district: candidate.district,
        division: candidate.division,
      },
      accessToken,
      refreshToken,
    };
  },

  resendOtp: async (email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const candidate = await prisma.candidate.findUnique({ where: { email: cleanEmail } });
    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'এই ইমেইলে কোনো অ্যাকাউন্ট পাওয়া যায়নি।');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verificationOtp.create({
      data: {
        email: cleanEmail,
        otp,
        type: OtpType.VERIFY_EMAIL,
        candidateId: candidate.id,
        expiresAt,
      },
    });

    const emailRes = await emailUtils.sendOtpEmail(cleanEmail, otp, 'verify');
    return { success: true, devOtp: emailRes.devOtp };
  },

  refreshToken: async (token: string) => {
    const verified = jwtUtils.verifyRefreshToken(token);
    if (!verified.success || !verified.data) {
      throw new AppError(status.UNAUTHORIZED, 'অবৈধ রিফ্রেশ টোকেন। পুনরায় লগইন করুন।');
    }

    const session = await prisma.session.findUnique({
      where: { refreshToken: token },
      include: { candidate: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new AppError(status.UNAUTHORIZED, 'সেশন বাতিল করা হয়েছে। দয়া করে লগইন করুন।');
    }

    const candidate = session.candidate;
    const tokenPayload = {
      candidateId: candidate.id,
      email: candidate.email,
      role: candidate.role,
      phone: candidate.phone,
      name: candidate.name,
    };

    const newAccessToken = jwtUtils.createAccessToken(tokenPayload);
    const newRefreshToken = jwtUtils.createRefreshToken({ candidateId: candidate.id });

    // Rotate refresh token
    await prisma.session.update({
      where: { id: session.id },
      data: {
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: candidate.id,
        email: candidate.email,
        name: candidate.name,
        role: candidate.role,
      },
    };
  },

  getMe: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        educations: true,
        documents: true,
        _count: {
          select: { applications: true, savedJobs: true },
        },
      },
    });

    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
    }

    const { passwordHash: _, ...safeCandidate } = candidate;
    return safeCandidate;
  },
};
