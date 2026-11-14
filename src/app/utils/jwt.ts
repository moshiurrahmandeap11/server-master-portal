import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { IRequestUser } from '../interfaces/requestUser.interface';

export const jwtUtils = {
  createAccessToken: (payload: IRequestUser): string => {
    return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
  },

  createRefreshToken: (payload: { candidateId: string }): string => {
    return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
  },

  verifyAccessToken: (token: string): { success: boolean; data?: IRequestUser; error?: string } => {
    try {
      const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as IRequestUser;
      return { success: true, data: decoded };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  verifyRefreshToken: (token: string): { success: boolean; data?: { candidateId: string }; error?: string } => {
    try {
      const decoded = jwt.verify(token, env.REFRESH_TOKEN_SECRET) as { candidateId: string };
      return { success: true, data: decoded };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },
};
