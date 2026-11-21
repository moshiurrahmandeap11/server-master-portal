import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import AppError from '../errorHelpers/AppError';
import { CookieUtils } from '../utils/cookie';
import { jwtUtils } from '../utils/jwt';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { UserRole, UserStatus } from '../../generated/prisma';

const timingSafeMatch = (provided: string, expected?: string): boolean => {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const checkAuth = (...requiredRoles: UserRole[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Optional machine-to-machine Admin Secret verification (no weak fallbacks)
      const adminSecret = (req.headers['x-admin-secret'] as string | undefined)?.trim();
      if (adminSecret && timingSafeMatch(adminSecret, env.ADMIN_SECRET_KEY)) {
        if (requiredRoles.length > 0 && !requiredRoles.includes(UserRole.ADMIN)) {
          throw new AppError(status.FORBIDDEN, 'আপনার এই রিসোর্সে প্রবেশের অনুমতি নেই।');
        }
        req.user = {
          candidateId: 'ADMIN-SUPER',
          email: 'admin@chakrisheba.com',
          role: UserRole.ADMIN,
          name: 'Super Admin',
        };
        return next();
      }

      const accessToken =
        CookieUtils.getCookie(req, 'accessToken') ||
        CookieUtils.getCookie(req, 'cs_access_token') ||
        req.headers.authorization?.split(' ')[1];

      if (!accessToken) {
        throw new AppError(status.UNAUTHORIZED, 'অননুমোদিত প্রবেশ! অনুগ্রহ করে লগইন করুন।');
      }

      const verified = jwtUtils.verifyAccessToken(accessToken);
      if (!verified.success || !verified.data) {
        throw new AppError(status.UNAUTHORIZED, 'সেশন মেয়াদোত্তীর্ণ অথবা অবৈধ টোকেন। পুনরায় লগইন করুন।');
      }

      const user = verified.data;

      // Ensure candidate account still exists and is active (for non-system admin accounts)
      if (user.candidateId !== 'ADMIN-SUPER' && !user.candidateId.startsWith('STAFF-')) {
        const account = await prisma.candidate.findUnique({
          where: { id: user.candidateId },
          select: { status: true, role: true },
        });
        if (!account || account.status !== UserStatus.ACTIVE) {
          throw new AppError(status.UNAUTHORIZED, 'আপনার অ্যাকাউন্টটি নিষ্ক্রিয় বা পাওয়া যায়নি।');
        }
      }

      // Role check if specific roles are specified
      if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
        throw new AppError(status.FORBIDDEN, 'আপনার এই রিসোর্সে প্রবেশের অনুমতি নেই।');
      }

      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const accessToken =
      CookieUtils.getCookie(req, 'accessToken') ||
      CookieUtils.getCookie(req, 'cs_access_token') ||
      req.headers.authorization?.split(' ')[1];

    if (accessToken) {
      const verified = jwtUtils.verifyAccessToken(accessToken);
      if (verified.success && verified.data) {
        req.user = verified.data;
      }
    }
  } catch {
    // Ignore invalid optional tokens
  }
  next();
};
