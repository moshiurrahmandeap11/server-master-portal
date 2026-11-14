import nodemailer from 'nodemailer';
import ejs from 'ejs';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from '../config/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: (env.SMTP_USER && env.SMTP_PASS) ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

export const emailUtils = {
  sendOtpEmail: async (to: string, otp: string, type: 'login' | 'verify' = 'verify'): Promise<{ success: boolean; devOtp?: string }> => {
    try {
      const templateName = type === 'login' ? 'login-otp.ejs' : 'verification-email.ejs';
      const templatePath = path.join(__dirname, '../templates', templateName);

      let html = '';
      try {
        html = await ejs.renderFile(templatePath, { otp, email: to, siteName: 'চাকরি সেবা' });
      } catch {
        html = `<h2>আপনার চাকরি সেবা ওটিপি কোড: <b>${otp}</b></h2><p>এই কোডটি আগামী ১০ মিনিট কার্যকর থাকবে।</p>`;
      }

      if (env.SMTP_USER && env.SMTP_PASS) {
        await transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject: type === 'login' ? 'চাকরি সেবা — লগইন ভেরিফিকেশন ওটিপি' : 'চাকরি সেবা — ইমেইল ভেরিফিকেশন ওটিপি',
          html,
        });
      } else {
        console.log(`[DEV EMAIL] Target: ${to} | Type: ${type} | OTP: ${otp}`);
      }

      return { success: true, devOtp: otp };
    } catch (err) {
      console.error('[emailUtils] Failed to send email:', err);
      return { success: false, devOtp: otp };
    }
  },
};
