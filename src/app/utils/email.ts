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
  connectionTimeout: 4000,
  greetingTimeout: 4000,
  socketTimeout: 4000,
  auth: (env.SMTP_USER && env.SMTP_PASS) ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || 'চাকরি সেবা <noreply@moshiur.pro>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Resend HTTP ${res.status}: ${errBody}`);
  }
  return true;
}

export const emailUtils = {
  sendOtpEmail: async (to: string, otp: string, type: 'login' | 'verify' | 'reset' = 'verify'): Promise<{ success: boolean; devOtp?: string }> => {
    try {
      const templateName = type === 'login' ? 'login-otp.ejs' : 'verification-email.ejs';
      const templatePath = path.join(__dirname, '../templates', templateName);

      let html = '';
      try {
        html = await ejs.renderFile(templatePath, { otp, email: to, siteName: 'চাকরি সেবা' });
      } catch {
        html = `<h2>আপনার চাকরি সেবা ওটিপি কোড: <b>${otp}</b></h2><p>এই কোডটি আগামী ১০ মিনিট কার্যকর থাকবে।</p>`;
      }

      let subject = 'চাকরি সেবা — ইমেইল ভেরিফিকেশন ওটিপি';
      if (type === 'login') subject = 'চাকরি সেবা — লগইন ভেরিফিকেশন ওটিপি';
      if (type === 'reset') subject = 'চাকরি সেবা — পাসওয়ার্ড রিসেট ওটিপি';

      if (env.RESEND_API_KEY) {
        sendViaResend(to, subject, html).catch((err) => {
          console.error('[emailUtils] Failed to send email via Resend:', err.message);
        });
      } else if (env.SMTP_USER && env.SMTP_PASS) {
        // Send email asynchronously with error catching so request is never blocked by SMTP timeouts
        transporter.sendMail({
          from: env.SMTP_FROM,
          to,
          subject,
          html,
        }).catch((err) => {
          console.error('[emailUtils] Failed to send email via SMTP:', err.message);
        });
      } else {
        console.log(`[DEV EMAIL] Target: ${to} | Type: ${type} | OTP: ${otp}`);
      }

      if (env.NODE_ENV !== 'production') {
        return { success: true, devOtp: otp };
      }
      return { success: true };
    } catch (err) {
      console.error('[emailUtils] Failed to send email:', err);
      return { success: false, ...(env.NODE_ENV !== 'production' ? { devOtp: otp } : {}) };
    }
  },
};
