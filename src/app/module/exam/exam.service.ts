import { prisma } from '../../lib/prisma';

export const examService = {
  getAdmitCards: async () => {
    return await prisma.admitCard.findMany({
      include: {
        job: { select: { title: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getExamNotices: async () => {
    return await prisma.examNotice.findMany({
      include: {
        job: { select: { title: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getExamResults: async () => {
    return await prisma.examResult.findMany({
      include: {
        job: { select: { title: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getQuestions: async (category?: string) => {
    const where = category ? { category } : {};
    return await prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },

  getModelTests: async () => {
    return await prisma.modelTest.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },
};
