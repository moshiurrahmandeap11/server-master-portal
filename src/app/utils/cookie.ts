import { Request, Response } from 'express';
import { env } from '../config/env';

export const CookieUtils = {
  setAuthCookies: (
    res: Response,
    accessToken: string,
    refreshToken: string,
    rememberMe = true
  ) => {
    const isSecure = env.COOKIE_SECURE;
    const cookieDomain = env.COOKIE_DOMAIN;

    const cookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: (isSecure ? 'none' : 'lax') as 'none' | 'lax',
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
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

    const refreshMaxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: refreshMaxAge,
    });

    res.cookie('cs_refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: refreshMaxAge,
    });
  },

  clearAuthCookies: (res: Response) => {
    const cookieDomain = env.COOKIE_DOMAIN;
    const baseOptions = { path: '/' };
    const domainOptions = cookieDomain ? { path: '/', domain: cookieDomain } : undefined;

    for (const name of ['accessToken', 'cs_access_token', 'refreshToken', 'cs_refresh_token']) {
      res.clearCookie(name, baseOptions);
      if (domainOptions) {
        res.clearCookie(name, domainOptions);
      }
    }
  },

  getCookie: (req: Request, name: string): string | undefined => {
    return req.cookies?.[name];
  },
};
