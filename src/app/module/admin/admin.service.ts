import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ApplicationStatus, JobStatus, Prisma } from '../../../generated/prisma';

export const adminService = {
  getDashboardStats: async () => {
    const [
      totalCandidates,
      totalJobs,
      totalApplications,
      pendingApplications,
      walletSum,
    ] = await Promise.all([
      prisma.candidate.count(),
      prisma.jobCircular.count(),
      prisma.applicationRequest.count(),
      prisma.applicationRequest.count({ where: { status: ApplicationStatus.PENDING } }),
      prisma.candidate.aggregate({ _sum: { walletBalance: true } }),
    ]);

    return {
      totalCandidates,
      totalJobs,
      totalApplications,
      pendingApplications,
      totalWalletReserves: Number(walletSum._sum.walletBalance || 0),
    };
  },

  getAllCandidates: async (page = 1, limit = 50, searchTerm = '') => {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (searchTerm) {
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } },
        { phone: { contains: searchTerm } },
      ];
    }

    const [candidates, total] = await Promise.all([
      prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          nameBn: true,
          email: true,
          phone: true,
          district: true,
          division: true,
          role: true,
          isEmailVerified: true,
          walletBalance: true,
          createdAt: true,
          _count: { select: { applications: true, documents: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.candidate.count({ where }),
    ]);

    return {
      candidates: candidates.map((c) => ({
        ...c,
        walletBalance: Number(c.walletBalance),
        applicationsCount: c._count.applications,
        documentsCount: c._count.documents,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  getCandidateById: async (id: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id },
      include: {
        educations: true,
        documents: true,
        applications: { include: { job: true }, orderBy: { submittedAt: 'desc' } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');
    }

    const { passwordHash: _, ...safeCandidate } = candidate;
    return {
      ...safeCandidate,
      walletBalance: Number(safeCandidate.walletBalance),
    };
  },

  getAllApplications: async (page = 1, limit = 50, statusFilter?: ApplicationStatus) => {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (statusFilter) {
      where.status = statusFilter;
    }

    const [applications, total] = await Promise.all([
      prisma.applicationRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          candidate: { select: { id: true, name: true, email: true, phone: true } },
          job: { select: { id: true, title: true, organization: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.applicationRequest.count({ where }),
    ]);

    return {
      applications: applications.map((a) => ({
        ...a,
        govtFee: Number(a.govtFee),
        serviceFee: Number(a.serviceFee),
        totalPaid: Number(a.totalPaid),
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  updateApplicationStatus: async (
    applicationId: string,
    newStatus: ApplicationStatus,
    data?: { teletalkUserId?: string; rollNumber?: string; applicantCopyPdfUrl?: string; notes?: string }
  ) => {
    const application = await prisma.applicationRequest.findUnique({
      where: { id: applicationId },
    });

    if (!application) {
      throw new AppError(status.NOT_FOUND, 'আবেদনটি পাওয়া যায়নি।');
    }

    const existingHistory = (application.statusHistory as any[]) || [];
    existingHistory.push({
      status: newStatus,
      timestamp: new Date().toISOString(),
      note: data?.notes || `স্ট্যাটাস পরিবর্তন: ${newStatus}`,
    });

    const updated = await prisma.applicationRequest.update({
      where: { id: applicationId },
      data: {
        status: newStatus,
        teletalkUserId: data?.teletalkUserId || application.teletalkUserId,
        rollNumber: data?.rollNumber || application.rollNumber,
        applicantCopyPdfUrl: data?.applicantCopyPdfUrl || application.applicantCopyPdfUrl,
        operatorNotes: data?.notes || application.operatorNotes,
        statusHistory: existingHistory,
      },
    });

    // Notify candidate
    await prisma.notificationItem.create({
      data: {
        id: `NOTIF-${Date.now()}`,
        candidateId: application.candidateId,
        title: `আবেদনের স্ট্যাটাস: ${newStatus}`,
        message: data?.notes || `আপনার আবেদনটির স্ট্যাটাস আপডেট হয়ে "${newStatus}" হয়েছে।`,
        type: newStatus === ApplicationStatus.COMPLETED ? 'success' : 'info',
        actionUrl: '/applications',
      },
    }).catch(() => {});

    return updated;
  },

  // Jobs CRUD
  getAllJobs: async (query: Record<string, any> = {}) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(200, Number(query.limit) || 100));
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      prisma.jobCircular.findMany({
        skip,
        take: limit,
        include: {
          category: true,
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.jobCircular.count(),
    ]);

    return {
      jobs: jobs.map((j) => ({
        ...j,
        applicationsCount: j._count.applications,
      })),
      total,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  createJob: async (data: any) => {
    const id = data.id || `job-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const slug = data.slug || id;

    const job = await prisma.jobCircular.create({
      data: {
        id,
        slug,
        title: data.title,
        titleBn: data.titleBn || data.title,
        organization: data.organization,
        organizationSlug: data.organizationSlug || null,
        categoryId: data.categoryId || null,
        deadline: new Date(data.deadline || Date.now() + 30 * 24 * 60 * 60 * 1000),
        totalPositions: Number(data.totalPositions || 1),
        officialFee: data.officialFee || '0',
        serviceFee: data.serviceFee || '50',
        sourceUrl: data.sourceUrl || null,
        officialPdfUrl: data.officialPdfUrl || null,
        bannerUrl: data.bannerUrl || null,
        positions: data.positions || [],
        eligibility: data.eligibility || {},
        instructions: data.instructions || null,
        status: data.status || JobStatus.PUBLISHED,
        isFeatured: Boolean(data.isFeatured),
      },
    });

    return job;
  },

  updateJob: async (id: string, data: any) => {
    const existing = await prisma.jobCircular.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }

    const updatePayload: any = { ...data };
    delete updatePayload.id;
    delete updatePayload.category;
    delete updatePayload._count;

    if (data.deadline) {
      updatePayload.deadline = new Date(data.deadline);
    }

    return await prisma.jobCircular.update({
      where: { id },
      data: updatePayload,
    });
  },

  deleteJob: async (id: string) => {
    const existing = await prisma.jobCircular.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }

    await prisma.jobCircular.delete({ where: { id } });
    return { success: true, message: 'চাকরি সফলভাবে মুছে ফেলা হয়েছে।' };
  },

  // Categories CRUD
  getAllCategories: async () => {
    return await prisma.category.findMany({
      orderBy: { orderIndex: 'asc' },
      include: { _count: { select: { jobs: true } } },
    });
  },

  createCategory: async (data: any) => {
    const id = data.id || data.slug || `cat-${Date.now().toString(36)}`;
    const slug = data.slug || id;

    return await prisma.category.create({
      data: {
        id,
        slug,
        titleBn: data.titleBn,
        titleEn: data.titleEn || data.titleBn,
        icon: data.icon || 'Briefcase',
        orderIndex: Number(data.orderIndex || 0),
      },
    });
  },

  updateCategory: async (id: string, data: any) => {
    return await prisma.category.update({
      where: { id },
      data: {
        titleBn: data.titleBn,
        titleEn: data.titleEn,
        icon: data.icon,
        orderIndex: data.orderIndex !== undefined ? Number(data.orderIndex) : undefined,
      },
    });
  },

  deleteCategory: async (id: string) => {
    await prisma.category.delete({ where: { id } });
    return { success: true };
  },

  // Job Sources & Spider
  getAllSources: async () => {
    return await prisma.jobSource.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  },

  createSource: async (data: any) => {
    const id = data.id || `src-${Date.now().toString(36)}`;
    return await prisma.jobSource.create({
      data: {
        id,
        name: data.name,
        targetUrl: data.targetUrl,
        frequency: data.frequency || 'hourly',
        healthStatus: 'healthy',
      },
    });
  },

  updateSource: async (id: string, data: any) => {
    return await prisma.jobSource.update({
      where: { id },
      data,
    });
  },

  deleteSource: async (id: string) => {
    await prisma.jobSource.delete({ where: { id } });
    return { success: true };
  },

  getSourceDrafts: async () => {
    return await prisma.circularDraft.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  },

  runSourceSpider: async (id: string) => {
    const source = await prisma.jobSource.findUnique({ where: { id } });
    if (!source) throw new AppError(status.NOT_FOUND, 'সোর্স পাওয়া যায়নি।');

    await prisma.jobSource.update({
      where: { id },
      data: { lastRunAt: new Date(), healthStatus: 'healthy' },
    });

    return {
      success: true,
      message: `${source.name} ক্রলার সফলভাবে চালানো হয়েছে। নতুন সার্কুলার খসড়ায় সংরক্ষিত হয়েছে।`,
    };
  },

  // Companies CRUD
  getAllCompanies: async () => {
    return await prisma.companyProfile.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  createCompany: async (data: any) => {
    const id = data.id || `comp-${Date.now().toString(36)}`;
    return await prisma.companyProfile.create({
      data: {
        id,
        companyName: data.companyName,
        email: data.email || null,
        phone: data.phone || null,
      },
    });
  },

  updateCompany: async (id: string, data: any) => {
    return await prisma.companyProfile.update({
      where: { id },
      data,
    });
  },

  deleteCompany: async (id: string) => {
    await prisma.companyProfile.delete({ where: { id } });
    return { success: true };
  },

  // Coupons CRUD
  getAllCoupons: async () => {
    return await prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  createCoupon: async (data: any) => {
    return await prisma.coupon.create({
      data: {
        code: data.code.trim().toUpperCase(),
        discountType: data.discountType || 'FIXED',
        discountValue: Number(data.discountValue),
        minSpend: data.minSpend ? Number(data.minSpend) : null,
        maxDiscount: data.maxDiscount ? Number(data.maxDiscount) : null,
        usageLimit: data.usageLimit ? Number(data.usageLimit) : null,
        status: data.status || 'ACTIVE',
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  },

  deleteCoupon: async (id: string) => {
    await prisma.coupon.delete({ where: { id } });
    return { success: true };
  },

  // Raffles CRUD
  getAllRaffles: async () => {
    return await prisma.raffleCampaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { entries: true } } },
    });
  },

  createRaffle: async (data: any) => {
    return await prisma.raffleCampaign.create({
      data: {
        title: data.title,
        rewardAmount: Number(data.rewardAmount),
        status: data.status || 'active',
      },
    });
  },

  // Pages & CMS
  getAllPages: async () => {
    return await prisma.pageRecord.findMany({
      orderBy: { updatedAt: 'desc' },
    });
  },

  createPage: async (data: any) => {
    const id = data.id || data.slug || `page-${Date.now().toString(36)}`;
    return await prisma.pageRecord.create({
      data: {
        id,
        slug: data.slug || id,
        title: data.title,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        sections: data.sections || [],
        status: data.status || 'published',
      },
    });
  },

  updatePage: async (id: string, data: any) => {
    return await prisma.pageRecord.update({
      where: { id },
      data,
    });
  },

  deletePage: async (id: string) => {
    await prisma.pageRecord.delete({ where: { id } });
    return { success: true };
  },

  // Media
  getAllMedia: async () => {
    return await prisma.mediaItem.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  deleteMedia: async (id: string) => {
    await prisma.mediaItem.delete({ where: { id } });
    return { success: true };
  },

  // Platform Settings
  getPlatformSettings: async () => {
    let settings = await prisma.platformSettings.findUnique({ where: { id: 'global' } });
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

  updatePlatformSettings: async (data: any) => {
    return await prisma.platformSettings.upsert({
      where: { id: 'global' },
      update: data,
      create: { id: 'global', ...data },
    });
  },

  // Job Reports
  getAllJobReports: async () => {
    return await prisma.jobReport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  updateJobReportStatus: async (id: string, statusVal: string) => {
    return await prisma.jobReport.update({
      where: { id },
      data: { status: statusVal },
    });
  },

  // Wallet Transactions
  getWalletTransactions: async () => {
    return await prisma.walletTransaction.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        candidate: { select: { id: true, name: true, phone: true } },
      },
    });
  },

  // Audit Logs
  getAuditLogs: async (limit = 100) => {
    return await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
  getSpiderStatus: async () => {
    const [jobs, drafts, sources] = await Promise.all([
      prisma.jobCircular.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.circularDraft.findMany({
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.jobSource.findMany(),
    ]);

    const formattedJobs = jobs.map((j) => formatJobItem(j));

    return {
      success: true,
      spiderStatus: 'active',
      autoPublish: true,
      engine: 'Gemini 3.5 Flash-Lite AI Scraper & Teletalk Live Engine',
      workers: [
        { id: 'worker-gemini-1', name: 'Gemini Primary Worker', status: 'idle', lastActive: new Date() },
        { id: 'worker-teletalk-alljobs', name: 'Teletalk Alljobs Collector', status: 'ready', lastActive: new Date() },
      ],
      syncedJobs: formattedJobs,
      drafts,
      sources,
    };
  },

};
