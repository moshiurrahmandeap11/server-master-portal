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
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  ADMIN_SECRET_KEY?: string;
  CHAKRI_UPLOAD_DIR: string;
}

const loadEnv = (): EnvConfig => {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: Number(process.env.PORT) || 6969,
    DATABASE_URL: process.env.DATABASE_URL || '',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3050',
    ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET || 'cs_access_token_secret_min_32_characters_key_2026',
    REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'cs_refresh_token_secret_min_32_characters_key_2026',
    COOKIE_SECURE: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: Number(process.env.SMTP_PORT) || 587,
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    SMTP_FROM: process.env.SMTP_FROM || 'চাকরি সেবা <noreply@chakriseba.com>',
    ADMIN_SECRET_KEY: process.env.ADMIN_SECRET_KEY || 'admin_dev_secret_2026',
    CHAKRI_UPLOAD_DIR: process.env.CHAKRI_UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
  };
};

export const env = loadEnv();
