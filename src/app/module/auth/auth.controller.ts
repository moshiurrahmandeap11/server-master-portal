import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { authService } from './auth.service';
import { CookieUtils } from '../../utils/cookie';

export const authController = {
  signUp: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.signUp(req.body);

    sendResponse(res, {
      httpStatusCode: status.CREATED,
      success: true,
      message: 'রেজিস্ট্রেশন সফল হয়েছে! আপনার ইমেইল ঠিকানায় ৬-সংখ্যার ওটিপি কোড পাঠানো হয়েছে।',
      data: result,
    });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.login(req.body);

    if (result.accessToken && result.refreshToken) {
      CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'লগইন সফল হয়েছে!',
      data: result,
    });
  }),

  verifyEmail: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.verifyEmailOtp(req.body);

    if (result.accessToken && result.refreshToken) {
      CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ইমেইল সফলভাবে ভেরিফাই হয়েছে!',
      data: result,
    });
  }),

  resendOtp: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.resendOtp(req.body.email);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'নতুন ওটিপি কোড পাঠানো হয়েছে।',
      data: result,
    });
  }),

  refreshToken: catchAsync(async (req: Request, res: Response) => {
    const token = CookieUtils.getCookie(req, 'refreshToken') || req.body?.refreshToken;
    if (!token) {
      return res.status(status.UNAUTHORIZED).json({ success: false, message: 'রিফ্রেশ টোকেন পাওয়া যায়নি।' });
    }

    const result = await authService.refreshToken(token);
    CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'টোকেন নবায়ন সফল হয়েছে!',
      data: result,
    });
  }),

  logout: catchAsync(async (_req: Request, res: Response) => {
    CookieUtils.clearAuthCookies(res);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'সফলভাবে লগআউট করা হয়েছে।',
    });
  }),

  getMe: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.getMe(req.user!.candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রোফাইল লোড সফল হয়েছে।',
      data: result,
    });
  }),
};
