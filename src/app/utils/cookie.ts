import { Request, Response } from 'express';
import { env } from '../config/env';

export const CookieUtils = {
  setAuthCookies: (res: Response, accessToken: string, refreshToken: string) => {
    const isSecure = env.COOKIE_SECURE;
    const cookieDomain = env.COOKIE_DOMAIN || '.moshiur.pro';

    const cookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: (isSecure ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      domain: cookieDomain,
    };

    // Standard cookies
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('cs_access_token', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('cs_refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  },

  clearAuthCookies: (res: Response) => {
    const cookieDomain = env.COOKIE_DOMAIN || '.moshiur.pro';
    const clearOptions = {
      path: '/',
      domain: cookieDomain,
    };

    res.clearCookie('accessToken', clearOptions);
    res.clearCookie('cs_access_token', clearOptions);
    res.clearCookie('refreshToken', clearOptions);
    res.clearCookie('cs_refresh_token', clearOptions);
  },

  getCookie: (req: Request, name: string): string | undefined => {
    return req.cookies?.[name];
  },
};
