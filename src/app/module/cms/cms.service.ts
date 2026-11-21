import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { JobStatus } from '../../../generated/prisma';

// Lightweight 60s in-memory cache for public aggregate stats to avoid repeated COUNT queries
let publicStatsCache: { expiresAt: number; data: any } | null = null;

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
          supportPhone: '',
        },
      });
    }

    const rawGeneral = typeof settings.general === 'object' && settings.general !== null
      ? (settings.general as Record<string, any>)
      : {};
    const rawWorkflow = typeof settings.workflow === 'object' && settings.workflow !== null
      ? (settings.workflow as Record<string, any>)
      : {};
    const rawOperational = typeof settings.operational === 'object' && settings.operational !== null
      ? (settings.operational as Record<string, any>)
      : {};

    const cleanPlaceholderPhone = (val?: string | null) => {
      const s = String(val || '').trim();
      if (!s || s === '+8801700000000' || s === '01700-000000' || s === '01700000000') return '';
      return s;
    };

    const general = {
      siteName: settings.siteName || 'চাকরি সেবা',
      tagline: settings.tagline || 'বাংলাদেশের বিশ্বস্ত সরকারি ও ব্যাংক চাকরি আবেদন প্ল্যাটফর্ম',
      contactEmail: settings.contactEmail || 'support@chakrisheba.com',
      supportPhone: cleanPlaceholderPhone(rawGeneral.supportPhone || settings.supportPhone),
      whatsappNumber: cleanPlaceholderPhone(rawGeneral.whatsappNumber),
      heroHeadline: 'সঠিক তথ্যে নির্ভুল সরকারি ও ব্যাংক চাকরি আবেদন',
      footerCopyright: `© ${new Date().getFullYear()} চাকরি সেবা (Chakri Sheba)। সর্বস্বত্ব সংরক্ষিত।`,
      ...rawGeneral,
      supportPhoneNormalized: cleanPlaceholderPhone(rawGeneral.supportPhone || settings.supportPhone),
    };
    general.supportPhone = cleanPlaceholderPhone(general.supportPhone);
    general.whatsappNumber = cleanPlaceholderPhone(general.whatsappNumber);

    const workflow = {
      defaultServiceFee: 50,
      autoVerifyEmails: false,
      allowWalletSplit: true,
      enableAiResumeImport: true,
      ...rawWorkflow,
    };

    const operational = {
      maintenanceMode: false,
      allowRegistration: true,
      bkashNumber: '',
      nagadNumber: '',
      ...rawOperational,
    };
    operational.bkashNumber = cleanPlaceholderPhone(operational.bkashNumber);
    operational.nagadNumber = cleanPlaceholderPhone(operational.nagadNumber);

    return {
      ...settings,
      supportPhone: general.supportPhone,
      general,
      workflow,
      operational,
      headerLinks: Array.isArray(settings.headerMenu) ? settings.headerMenu : [],
      footerLinks: settings.footerMenu || { columns: [] },
      seo: settings.seoDefaults || {},
    };
  },

  getPublicStats: async () => {
    const now = Date.now();
    if (publicStatsCache && publicStatsCache.expiresAt > now) {
      return publicStatsCache.data;
    }

    const [
      publishedJobs,
      totalCandidates,
      totalApplications,
      completedApplications,
      totalSubscribers,
      totalOrganizations,
    ] = await Promise.all([
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED } }),
      prisma.candidate.count(),
      prisma.applicationRequest.count(),
      prisma.applicationRequest.count({ where: { status: 'COMPLETED' } }),
      prisma.jobAlertSubscription.count(),
      prisma.organization.count({ where: { isActive: true } }),
    ]);

    const data = {
      publishedJobs,
      totalCandidates,
      totalApplications,
      completedApplications,
      totalSubscribers,
      totalOrganizations,
      updatedAt: new Date().toISOString(),
    };

    publicStatsCache = { expiresAt: now + 60_000, data };
    return data;
  },

  getPublicReviews: async () => {
    return await prisma.candidateReview.findMany({
      where: { isApproved: true },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'desc' }],
    });
  },

  getContentPosts: async (kind?: string) => {
    return await prisma.blogPost.findMany({
      where: {
        status: 'published',
        ...(kind ? { kind } : {}),
      },
      orderBy: { publishedAt: 'desc' },
    });
  },

  getContentPostBySlug: async (slug: string) => {
    const post = await prisma.blogPost.findUnique({ where: { slug } });
    if (!post || post.status !== 'published') {
      throw new AppError(status.NOT_FOUND, 'কনটেন্টটি খুঁজে পাওয়া যায়নি।');
    }
    return post;
  },

  getMediaItems: async () => {
    return await prisma.mediaItem.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  },
};
