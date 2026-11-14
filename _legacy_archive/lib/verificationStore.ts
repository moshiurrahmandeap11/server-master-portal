import crypto from 'crypto';

interface EmailOtpRecord {
  email: string;
  otp: string;
  candidateId: string;
  expiresAt: number;
}

// Global in-memory verification store (with 10-minute expiry window)
const verificationStore = new Map<string, EmailOtpRecord>();

export function storeEmailOtp(email: string, candidateId: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  verificationStore.set(cleanEmail, {
    email: cleanEmail,
    otp,
    candidateId,
    expiresAt
  });

  return otp;
}

export function verifyEmailOtp(email: string, otp: string): { valid: boolean; candidateId?: string; error?: string } {
  const cleanEmail = email.trim().toLowerCase();
  const record = verificationStore.get(cleanEmail);

  if (!record) {
    return { valid: false, error: 'কোনো ভেরিফিকেশন ওটিপি পাওয়া যায়নি বা মেয়াদ শেষ হয়েছে। পুনরায় কোড চেয়ে পাঠান।' };
  }

  if (record.expiresAt < Date.now()) {
    verificationStore.delete(cleanEmail);
    return { valid: false, error: 'ওটিপি কোডের মেয়াদ শেষ হয়েছে (১০ মিনিট)। পুনরায় কোড চেয়ে পাঠান।' };
  }

  if (record.otp !== (otp || '').trim()) {
    return { valid: false, error: 'ভুল ওটিপি কোড! অনুগ্রহ করে সঠিক ৬-সংখ্যার কোডটি দিন।' };
  }

  // Clear OTP on successful validation
  verificationStore.delete(cleanEmail);
  return { valid: true, candidateId: record.candidateId };
}

export function getStoredOtp(email: string): string | undefined {
  const record = verificationStore.get(email.trim().toLowerCase());
  return record && record.expiresAt > Date.now() ? record.otp : undefined;
}
