import { z } from 'zod';
import { DocumentType } from '../../../generated/prisma';

export const candidateValidation = {
  updateProfile: z.object({
    body: z.object({
      name: z.string().optional(),
      nameBn: z.string().optional(),
      phone: z.string().optional(),
      district: z.string().optional(),
      division: z.string().optional(),
      avatarUrl: z.string().optional(),
    }),
  }),

  addEducation: z.object({
    body: z.object({
      level: z.string().min(1, 'শিক্ষাগত লেভেল প্রদান করুন (যেমন: SSC/HSC/Graduation)'),
      examTitle: z.string().min(1, 'পরীক্ষার নাম দিন'),
      groupMajor: z.string().optional(),
      boardUniversity: z.string().optional(),
      institute: z.string().optional(),
      rollNumber: z.string().optional(),
      regNumber: z.string().optional(),
      passingYear: z.number().int().min(1970).max(2030),
      resultType: z.string().optional(),
      gpaCgpa: z.number().optional(),
      scale: z.number().optional(),
    }),
  }),

  addDocument: z.object({
    body: z.object({
      type: z.nativeEnum(DocumentType),
      title: z.string().min(1, 'ডকুমেন্টের শিরোনাম দিন'),
      fileUrl: z.string().min(1, 'ফাইল ইউআরএল দিন'),
      fileSize: z.number().optional(),
      mimeType: z.string().optional(),
    }),
  }),
};
