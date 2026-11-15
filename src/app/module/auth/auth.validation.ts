import { z } from 'zod';

export const authValidation = {
  signUp: z.object({
    body: z.object({
      email: z.string().email('সঠিক ইমেইল এড্রেস প্রদান করুন।'),
      password: z.string().min(6, 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'),
      name: z.string().min(2, 'প্রার্থীর পূর্ণ নাম প্রদান করুন।'),
      nameBn: z.string().optional(),
      phone: z.string().optional(),
      username: z.string().optional(),
      district: z.string().optional(),
      division: z.string().optional(),
    }),
  }),

  login: z.object({
    body: z.object({
      loginId: z.string().optional(),
      email: z.string().optional(),
      identifier: z.string().optional(),
      phone: z.string().optional(),
      password: z.string().optional(),
      role: z.string().optional(),
      adminPin: z.string().optional(),
    }).refine((body) => {
      // 1. Admin Login via adminPin or password
      if (body.role === 'admin' || body.adminPin) {
        return Boolean(body.adminPin || body.password);
      }
      // 2. Candidate Login via identifier + password
      const hasId = Boolean(body.loginId || body.email || body.identifier || body.phone);
      const hasPass = Boolean(body.password);
      return hasId && hasPass;
    }, {
      message: 'ইমেইল/ইউজারনেম এবং পাসওয়ার্ড প্রদান করুন (অথবা অ্যাডমিন পিন দিন)।',
    }),
  }),

  googleSignIn: z.object({
    body: z.object({
      credential: z.string().min(1, 'গুগল ক্রেডেনশিয়াল টোকেন প্রয়োজন।'),
    }),
  }),

  verifyOtp: z.object({
    body: z.object({
      email: z.string().email('সঠিক ইমেইল এড্রেস দিন।'),
      otp: z.string().min(4, 'সঠিক ওটিপি কোড দিন।'),
    }),
  }),

  resendOtp: z.object({
    body: z.object({
      email: z.string().email('সঠিক ইমেইল এড্রেস দিন।'),
    }),
  }),

  changePassword: z.object({
    body: z.object({
      oldPassword: z.string().min(1, 'বর্তমান পাসওয়ার্ড প্রদান করুন।'),
      newPassword: z.string().min(6, 'নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।'),
    }),
  }),
};
