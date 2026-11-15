import { UserRole } from '../../../generated/prisma';

export interface ISignUpPayload {
  email: string;
  password: string;
  name: string;
  nameBn?: string;
  phone?: string;
  username?: string;
  district?: string;
  division?: string;
}

export interface ILoginPayload {
  loginId?: string; // email, phone, or username
  email?: string;
  identifier?: string;
  phone?: string;
  password?: string;
  role?: string;
  adminPin?: string;
}

export interface IVerifyOtpPayload {
  email: string;
  otp: string;
}

export interface IAuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    phone?: string | null;
    username: string;
    isEmailVerified: boolean;
    walletBalance: number;
    district?: string | null;
    division?: string | null;
  };
  accessToken?: string;
  refreshToken?: string;
}
