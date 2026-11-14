import { Request, Response } from 'express';
import { env } from '../config/env';

export const CookieUtils = {
  setAuthCookies: (res: Response, accessToken: string, refreshToken: string) => {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  },

  clearAuthCookies: (res: Response) => {
    res.clearCookie('accessToken', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });
  },

  getCookie: (req: Request, name: string): string | undefined => {
    return req.cookies?.[name];
  },
};
