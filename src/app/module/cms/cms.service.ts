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
          contactEmail: 'support@chakrisheba.com',
          supportPhone: '+8801700000000',
        },
      });
    }

    const general = {
      siteName: settings.siteName || 'চাকরি সেবা',
      tagline: settings.tagline || 'বাংলাদেশের বিশ্বস্ত সরকারি ও ব্যাংক চাকরি আবেদন প্ল্যাটফর্ম',
      contactEmail: settings.contactEmail || 'support@chakrisheba.com',
      supportPhone: settings.supportPhone || '+8801700000000',
      whatsappNumber: '+8801700000000',
      heroHeadline: 'সঠিক তথ্যে নির্ভুল সরকারি ও ব্যাংক চাকরি আবেদন',
      footerCopyright: `© ${new Date().getFullYear()} চাকরি সেবা (Chakri Sheba)। সর্বস্বত্ব সংরক্ষিত।`,
      ...(typeof settings.general === 'object' && settings.general !== null ? (settings.general as Record<string, any>) : {}),
    };

    const workflow = {
      defaultServiceFee: 50,
      autoVerifyEmails: false,
      allowWalletSplit: true,
      enableAiResumeImport: true,
      ...(typeof settings.workflow === 'object' && settings.workflow !== null ? (settings.workflow as Record<string, any>) : {}),
    };

    const operational = {
      maintenanceMode: false,
      allowRegistration: true,
      bkashNumber: '01700-000000',
      nagadNumber: '01700-000000',
      ...(typeof settings.operational === 'object' && settings.operational !== null ? (settings.operational as Record<string, any>) : {}),
    };

    return {
      ...settings,
      general,
      workflow,
      operational,
      headerLinks: Array.isArray(settings.headerMenu) ? settings.headerMenu : [],
      footerLinks: settings.footerMenu || { columns: [] },
      seo: settings.seoDefaults || {},
    };
  },

  getMediaItems: async () => {
    return await prisma.mediaItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
};
