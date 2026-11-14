import nodemailer from 'nodemailer';

/**
 * Enterprise Email Dispatcher for Chakri Sheba
 * Automatically sends OTP via real SMTP when .env credentials are provided,
 * or gracefully logs to console for local development.
 */
export async function sendOtpEmail(
  toEmail: string, 
  otp: string, 
  purpose: 'verify' | 'forgot' = 'verify'
): Promise<{ sent: boolean; simulated?: boolean; error?: string; devOtp?: string }> {
  const host = process.env.SMTP_HOST?.trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = process.env.SMTP_FROM?.trim() || `"চাকরি সেবা" <noreply@chakriseba.com>`;

  const isConfigured = Boolean(host && user && pass);

  const isVerify = purpose === 'verify';
  const title = isVerify ? 'ইমেইল ভেরিফিকেশন কোড' : 'পাসওয়ার্ড রিসেট কোড';
  const subtitle = isVerify 
    ? 'চাকরি সেবা প্ল্যাটফর্মে আপনার অ্যাকাউন্ট সক্রিয় করার জন্য নিচের ৬-সংখ্যার কোডটি প্রদান করুন:'
    : 'চাকরি সেবা প্ল্যাটফর্মে আপনার পাসওয়ার্ড রিসেট করার জন্য নিচের ৬-সংখ্যার কোডটি ব্যবহার করুন:';

  const html = `
    <!DOCTYPE html>
    <html lang="bn">
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; }
        .card { max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .logo-box { text-align: center; margin-bottom: 24px; }
        .logo { font-size: 24px; font-weight: 900; color: #047857; letter-spacing: -0.5px; }
        .title { font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 8px; text-align: center; }
        .subtitle { font-size: 14px; color: #475569; line-height: 1.5; text-align: center; margin-bottom: 24px; }
        .otp-container { background: #f0fdf4; border: 2px dashed #059669; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px; }
        .otp-code { font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #047857; font-family: monospace; }
        .warning { font-size: 12px; color: #64748b; line-height: 1.5; text-align: center; }
        .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo-box">
          <div class="logo">চাকরি সেবা</div>
        </div>
        <div class="title">${title}</div>
        <div class="subtitle">${subtitle}</div>
        <div class="otp-container">
          <div class="otp-code">${otp}</div>
        </div>
        <div class="warning">
          এই কোডটির মেয়াদ ১০ মিনিট। অনুগ্রহ করে আপনার ওটিপি কোডটি কারো সাথে শেয়ার করবেন না।
        </div>
        <div class="footer">
          © ${new Date().getFullYear()} চাকরি সেবা • ChakriSheba Enterprise System
        </div>
      </div>
    </body>
    </html>
  `;

  if (isConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE === 'true' || port === 465,
        auth: { user, pass }
      });

      await transporter.sendMail({
        from,
        to: toEmail,
        subject: `[চাকরি সেবা] ${title}: ${otp}`,
        html
      });

      console.log(`[SMTP] Successfully sent ${purpose} OTP to ${toEmail}`);
      return { sent: true };
    } catch (err: any) {
      console.error(`[SMTP ERROR] Failed to send email to ${toEmail}:`, err.message);
      return { sent: false, error: err.message, devOtp: otp };
    }
  } else {
    // Development / unconfigured SMTP fallback:
    console.log(`\n======================================================`);
    console.log(`[DEV EMAIL SIMULATION] To: ${toEmail}`);
    console.log(`[DEV EMAIL SIMULATION] Subject: [চাকরি সেবা] ${title}: ${otp}`);
    console.log(`[DEV EMAIL SIMULATION] OTP Code: ${otp}`);
    console.log(`[DEV EMAIL SIMULATION] (Configure SMTP_HOST, SMTP_USER, SMTP_PASS in .env for live email)`);
    console.log(`======================================================\n`);
    return { sent: true, simulated: true, devOtp: otp };
  }
}
