import { NextFunction, Request, Response } from 'express';
import status from 'http-status';
import AppError from '../errorHelpers/AppError';
import { CookieUtils } from '../utils/cookie';
import { jwtUtils } from '../utils/jwt';
import { UserRole, UserStatus } from '../../generated/prisma';

export const checkAuth = (...requiredRoles: UserRole[]) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const accessToken = CookieUtils.getCookie(req, 'accessToken') || 
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
