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
      loginId: z.string().min(1, 'ইমেইল, ফোন নম্বর বা ইউজারনেম প্রদান করুন।'),
      password: z.string().min(1, 'পাসওয়ার্ড প্রদান করুন।'),
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
