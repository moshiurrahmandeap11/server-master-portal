import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

interface EnvConfig {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  FRONTEND_URL: string;
  ACCESS_TOKEN_SECRET: string;
  REFRESH_TOKEN_SECRET: string;
  COOKIE_SECURE: boolean;
  COOKIE_DOMAIN?: string;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  ADMIN_SECRET_KEY?: string;
  CHAKRI_UPLOAD_DIR: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GEMINI_API_KEY?: string;
  GEMINI_API_KEY_1?: string;
  GEMINI_API_KEY_2?: string;
}

const isProd = process.env.NODE_ENV === 'production';

const sanitizeCookieDomain = (raw?: string): string | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === 'localhost' || trimmed === '.localhost') {
    return undefined;
  }
  return trimmed;
};

const loadEnv = (): EnvConfig => {
  const accessSecret = process.env.ACCESS_TOKEN_SECRET;
  const refreshSecret = process.env.REFRESH_TOKEN_SECRET;
  const adminSecret = process.env.ADMIN_SECRET_KEY;

  if (isProd && (!accessSecret || !refreshSecret || !adminSecret)) {
    throw new Error('CRITICAL: ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, and ADMIN_SECRET_KEY must be set in production.');
  }

  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT) || 6969,
    DATABASE_URL: process.env.DATABASE_URL || '',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3050',
    ACCESS_TOKEN_SECRET: accessSecret || 'cs_dev_only_access_token_secret_change_me_2026',
    REFRESH_TOKEN_SECRET: refreshSecret || 'cs_dev_only_refresh_token_secret_change_me_2026',
    COOKIE_SECURE: process.env.COOKIE_SECURE === 'true' || isProd,
    COOKIE_DOMAIN: sanitizeCookieDomain(process.env.COOKIE_DOMAIN),
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM || 'চাকরি সেবা <noreply@chakriseba.com>',
    ADMIN_SECRET_KEY: adminSecret || (!isProd ? 'admin_dev_secret_2026' : undefined),
    CHAKRI_UPLOAD_DIR: process.env.CHAKRI_UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_1: process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
  };
};

export const env = loadEnv();
