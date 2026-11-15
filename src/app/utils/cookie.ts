import { Request, Response } from 'express';
import { env } from '../config/env';

export const CookieUtils = {
  setAuthCookies: (res: Response, accessToken: string, refreshToken: string) => {
    const isSecure = env.COOKIE_SECURE;

    // Standard cookies
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('cs_access_token', accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('cs_refresh_token', refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  },

  clearAuthCookies: (res: Response) => {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('cs_access_token', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
    res.clearCookie('cs_refresh_token', { path: '/' });
  },

  getCookie: (req: Request, name: string): string | undefined => {
    return req.cookies?.[name];
  },
};
