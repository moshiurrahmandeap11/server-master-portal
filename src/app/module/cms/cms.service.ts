import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

export const cmsService = {
  getPageBySlug: async (slug: string) => {
    const cleanSlug = slug.startsWith('/') ? slug : `/${slug}`;
    const page = await prisma.pageRecord.findFirst({
      where: {
        OR: [
          { slug: cleanSlug },
          { id: slug },
        ],
      },
    });

    if (!page) {
      throw new AppError(status.NOT_FOUND, 'পেজটি খুঁজে পাওয়া যায়নি।');
    }

    return page;
  },

  getAllPages: async () => {
    return await prisma.pageRecord.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  },

  getPlatformSettings: async () => {
    let settings = await prisma.platformSettings.findUnique({
      where: { id: 'global' },
    });

    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          id: 'global',
          siteName: 'চাকরি সেবা',
          tagline: 'বাংলাদেশের বিশ্বস্ত সরকারি ও ব্যাংক চাকরি আবেদন প্ল্যাটফর্ম',
        },
      });
    }

    return settings;
  },

  getMediaItems: async () => {
    return await prisma.mediaItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
};
