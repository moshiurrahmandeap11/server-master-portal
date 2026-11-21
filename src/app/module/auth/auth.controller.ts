import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { authService } from './auth.service';
import { CookieUtils } from '../../utils/cookie';

export const authController = {
  signUp: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.signUp(req.body);

    res.status(status.CREATED).json({
      statusCode: status.CREATED,
      success: true,
      message: 'রেজিস্ট্রেশন সফল হয়েছে! আপনার ইমেইল ঠিকানায় ৬-সংখ্যার ওটিপি কোড পাঠানো হয়েছে।',
      requiresVerification: result.requiresVerification,
      email: result.email,
      devOtp: result.devOtp,
      candidateId: result.candidateId,
      data: result,
    });
  }),

  login: catchAsync(async (req: Request, res: Response) => {
    const rememberMe = req.body?.rememberMe !== false;
    const result = await authService.login(req.body);

    if (result.accessToken && result.refreshToken) {
      CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken, rememberMe);
    }

    const roleName = (result.user.role || 'CANDIDATE').toLowerCase();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: true,
      message: 'লগইন সফল হয়েছে!',
      role: roleName,
      user: result.user,
      data: result,
    });
  }),

  verifyEmail: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.verifyEmailOtp(req.body);

    if (result.accessToken && result.refreshToken) {
      CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    const roleName = (result.user.role || 'CANDIDATE').toLowerCase();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: true,
      message: 'ইমেইল সফলভাবে ভেরিফাই হয়েছে!',
      role: roleName,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      data: result,
    });
  }),

  resendOtp: catchAsync(async (req: Request, res: Response) => {
    const email = req.body.email || req.body.identifier;
    const result = await authService.resendOtp(email);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'নতুন ওটিপি কোড পাঠানো হয়েছে।',
      devOtp: result.devOtp,
      data: result,
    });
  }),

  refreshToken: catchAsync(async (req: Request, res: Response) => {
    const token =
      CookieUtils.getCookie(req, 'refreshToken') ||
      CookieUtils.getCookie(req, 'cs_refresh_token') ||
      req.body?.refreshToken;
    if (!token) {
      return res.status(status.UNAUTHORIZED).json({
        statusCode: status.UNAUTHORIZED,
        success: false,
        isLoggedIn: false,
        message: 'রিফ্রেশ টোকেন পাওয়া যায়নি।',
      });
    }

    const result = await authService.refreshToken(token);
    CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    const roleName = (result.user.role || 'CANDIDATE').toLowerCase();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: true,
      message: 'টোকেন নবায়ন সফল হয়েছে!',
      role: roleName,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      data: result,
    });
  }),

  logout: catchAsync(async (req: Request, res: Response) => {
    const token =
      CookieUtils.getCookie(req, 'refreshToken') ||
      CookieUtils.getCookie(req, 'cs_refresh_token') ||
      req.body?.refreshToken;
    await authService.logout(token);
    CookieUtils.clearAuthCookies(res);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: false,
      role: null,
      user: null,
      message: 'সফলভাবে লগআউট করা হয়েছে।',
      data: null,
    });
  }),

  getMe: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.getMe(req.user!.candidateId);
    const roleName = (result.role || 'CANDIDATE').toLowerCase();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: true,
      role: roleName,
      user: result,
      message: 'প্রোফাইল লোড সফল হয়েছে।',
      data: result,
    });
  }),

  googleSignIn: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.googleSignIn(req.body.credential);

    if (result.accessToken && result.refreshToken) {
      CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);
    }

    const roleName = (result.user.role || 'CANDIDATE').toLowerCase();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      isLoggedIn: true,
      role: roleName,
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      redirectUrl: '/dashboard',
      message: 'গুগল সাইন-ইন সফল হয়েছে!',
      data: result,
    });
  }),

  changePassword: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.changePassword(req.user!.candidateId, req.body);
    CookieUtils.setAuthCookies(res, result.accessToken, result.refreshToken);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!',
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      data: result,
    });
  }),

  forgotPassword: catchAsync(async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(req.body);
    if ((result as any).accessToken && (result as any).refreshToken) {
      CookieUtils.setAuthCookies(res, (result as any).accessToken, (result as any).refreshToken);
    }

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: (result as any).message || 'পাসওয়ার্ড রিসেট অনুরোধ সফল হয়েছে।',
      ...(typeof result === 'object' ? result : {}),
      data: result,
    });
  }),
};
