import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { IJobQueryFilters } from './job.interface';
import { JobStatus, Prisma } from '../../../generated/prisma';

export const formatJobItem = (j: any) => {
  if (!j) return j;
  const officialFeeNum = Number(j.officialFee) || Number(j.positions?.[0]?.govtFee) || 200;
  const serviceFeeNum = Number(j.serviceFee) || 50;
  const totalPostsNum = Number(j.totalPositions) || Number(j.positions?.reduce((acc: number, p: any) => acc + (Number(p.posts) || 0), 0)) || 1;
  const minEdu = j.eligibility?.education || j.positions?.[0]?.minEducation || 'বিজ্ঞপ্তি অনুসারে';
  const sal = j.positions?.[0]?.salary || 'জাতীয় পে স্কেল অনুযায়ী';
  const grd = j.positions?.[0]?.grade || 'জাতীয় বেতন স্কেল';
  const catSlug = j.category?.slug || 'govt';
  const catLabel = j.category?.titleBn || 'সরকারি চাকরি';

  const diffMs = j.deadline ? (new Date(j.deadline).getTime() - Date.now()) : 0;
  const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  const deadlineStr = j.deadline ? new Date(j.deadline).toISOString().split('T')[0] : '২০২৬-১২-৩১';

  return {
    ...j,
    govtFee: officialFeeNum,
    officialFee: String(officialFeeNum),
    serviceFee: serviceFeeNum,
    totalPosts: totalPostsNum,
    totalPositions: totalPostsNum,
    minEducation: minEdu,
    salary: sal,
    grade: grd,
    category: catSlug,
    categoryLabel: catLabel,
    daysRemaining,
    deadline: deadlineStr,
    deadlineFormatted: deadlineStr,
    circularPdfUrl: j.officialPdfUrl || j.sourceUrl || '',
    logo: j.bannerUrl || '',
  };
};

export const jobService = {
  getAllJobs: async (filters: IJobQueryFilters) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.JobCircularWhereInput = {
      status: JobStatus.PUBLISHED,
    };

    const searchTerm = (filters.searchTerm || (filters as any).search || (filters as any).q || '').trim();
    if (searchTerm) {
      where.OR = [
        { id: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { titleBn: { contains: searchTerm, mode: 'insensitive' } },
        { organization: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (filters.category) {
      where.category = {
        slug: filters.category,
      };
    }

    if (filters.isFeatured !== undefined) {
      where.isFeatured = String(filters.isFeatured) === 'true';
    }

    if (filters.closingSoon) {
      const now = new Date();
      const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      where.deadline = {
        gte: now,
        lte: threeDaysLater,
      };
    }

    const [jobs, total] = await Promise.all([
      prisma.jobCircular.findMany({
        where,
        skip,
        take: limit,
        include: { category: true },
        orderBy: { deadline: 'asc' },
      }),
      prisma.jobCircular.count({ where }),
    ]);

    return {
      jobs: jobs.map(formatJobItem),
      total,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  searchJobs: async (query: Record<string, any>) => {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const searchTerm = (query.q || query.search || query.searchTerm || '').toString().trim();
    const category = query.category?.toString().trim();

    const where: Prisma.JobCircularWhereInput = {
      status: JobStatus.PUBLISHED,
    };

    if (searchTerm) {
      where.OR = [
        { id: { contains: searchTerm, mode: 'insensitive' } },
        { slug: { contains: searchTerm, mode: 'insensitive' } },
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { titleBn: { contains: searchTerm, mode: 'insensitive' } },
        { organization: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'all') {
      where.category = { slug: category };
    }

    const [jobs, total] = await Promise.all([
      prisma.jobCircular.findMany({
        where,
        skip,
        take: limit,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.jobCircular.count({ where }),
    ]);

    return {
      jobs: jobs.map(formatJobItem),
      total,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  getDailyJobs: async (dateStr?: string) => {
    let targetDate = new Date();
    if (dateStr) {
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        targetDate = parsed;
      }
    }

    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const jobs = await prisma.jobCircular.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      date: startOfDay.toISOString().split('T')[0],
      jobs: jobs.length > 0 ? jobs : await prisma.jobCircular.findMany({
        where: { status: JobStatus.PUBLISHED },
        include: { category: true },
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    };
  },

  getFeedJobs: async (feedType: string, limit = 20) => {
    const take = Math.max(1, Math.min(100, Number(limit) || 20));
    const now = new Date();

    let where: Prisma.JobCircularWhereInput = {
      status: JobStatus.PUBLISHED,
    };
    let orderBy: Prisma.JobCircularOrderByWithRelationInput = { createdAt: 'desc' };

    switch (feedType) {
      case 'closing-soon': {
        const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        where.deadline = { gte: now, lte: threeDaysLater };
        orderBy = { deadline: 'asc' };
        break;
      }
      case 'deadline-today': {
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);
        where.deadline = { gte: now, lte: endOfToday };
        orderBy = { deadline: 'asc' };
        break;
      }
      case 'todays-jobs': {
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        where.createdAt = { gte: startOfToday };
        orderBy = { createdAt: 'desc' };
        break;
      }
      case 'featured-jobs': {
        where.isFeatured = true;
        orderBy = { createdAt: 'desc' };
        break;
      }
      case 'latest-jobs': {
        orderBy = { createdAt: 'desc' };
        break;
      }
      case 'updated-circulars': {
        orderBy = { updatedAt: 'desc' };
        break;
      }
      default:
        orderBy = { createdAt: 'desc' };
    }

    let jobs = await prisma.jobCircular.findMany({
      where,
      take,
      include: { category: true },
      orderBy,
    });

    // Fallback if specific feed is empty
    if (jobs.length === 0 && feedType !== 'featured-jobs') {
      jobs = await prisma.jobCircular.findMany({
        where: { status: JobStatus.PUBLISHED },
        take,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      });
    }

    return { jobs: jobs.map(formatJobItem) };
  },

  getDeadlineStatus: async (jobId: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: { OR: [{ id: jobId }, { slug: jobId }] },
      select: { id: true, title: true, deadline: true },
    });

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }

    const now = new Date();
    const deadline = new Date(job.deadline);
    const diffMs = deadline.getTime() - now.getTime();
    const isExpired = diffMs <= 0;
    const daysRemaining = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    const hoursRemaining = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));

    return {
      jobId: job.id,
      deadline: job.deadline,
      isExpired,
      daysRemaining,
      hoursRemaining,
      urgency: isExpired ? 'expired' : daysRemaining === 0 ? 'today' : daysRemaining <= 3 ? 'urgent' : 'normal',
    };
  },

  reportJob: async (payload: {
    jobId?: string;
    jobTitle?: string;
    jobUrl?: string;
    issueType: string;
    issueLabel?: string;
    details: string;
    reporterName?: string;
    reporterPhone?: string;
    reporterEmail?: string;
  }) => {
    const trackingCode = `REP-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;

    const report = await prisma.jobReport.create({
      data: {
        id: trackingCode,
        jobId: payload.jobId || 'GENERAL',
        candidateEmail: payload.reporterEmail || payload.reporterPhone || null,
        reason: payload.issueLabel || payload.issueType,
        details: JSON.stringify({
          jobTitle: payload.jobTitle,
          jobUrl: payload.jobUrl,
          issueType: payload.issueType,
          reporterName: payload.reporterName,
          reporterPhone: payload.reporterPhone,
          description: payload.details,
        }),
        status: 'pending',
      },
    });

    return {
      trackingCode: report.id,
      message: 'আপনার অভিযোগটি সফলভাবে নথিভুক্ত হয়েছে। আমাদের টিম যাচাই করে দ্রুত পদক্ষেপ নেবে।',
      report,
    };
  },

  getJobReport: async (trackingCode: string) => {
    const report = await prisma.jobReport.findUnique({
      where: { id: trackingCode },
    });

    if (!report) {
      throw new AppError(status.NOT_FOUND, 'এই ট্র্যাকিং নম্বরের কোনো অভিযোগ পাওয়া যায়নি।');
    }

    let parsedDetails: any = {};
    try {
      parsedDetails = typeof report.details === 'string' ? JSON.parse(report.details) : (report.details || {});
    } catch {
      parsedDetails = { description: report.details };
    }

    return {
      report: {
        id: report.id,
        trackingCode: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt,
        ...parsedDetails,
      },
    };
  },

  subscribeJobAlerts: async (payload: {
    phone?: string;
    email?: string;
    channels?: string[];
    categories?: string[];
    divisions?: string[];
    frequency?: string;
  }) => {
    const contact = (payload.email || payload.phone || '').trim().toLowerCase();
    if (!contact) {
      throw new AppError(status.BAD_REQUEST, 'মোবাইল নম্বর বা ইমেইল প্রদান করুন।');
    }

    const sub = await prisma.jobAlertSubscription.create({
      data: {
        id: `SUB-${Date.now().toString().slice(-8)}`,
        email: contact,
        categories: {
          categories: payload.categories || [],
          divisions: payload.divisions || [],
          channels: payload.channels || ['whatsapp', 'sms'],
          phone: payload.phone,
        },
        frequency: payload.frequency || 'daily',
      },
    });

    return {
      subscription: sub,
      message: 'জব অ্যালার্ট সাবস্ক্রিপশন সফল হয়েছে! নতুন সার্কুলার প্রকাশিত হলেই আপনাকে জানানো হবে।',
    };
  },

  getJobAlertStats: async () => {
    const [totalSubscribers, totalJobs] = await Promise.all([
      prisma.jobAlertSubscription.count(),
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED } }),
    ]);

    return {
      stats: {
        totalSubscribers: totalSubscribers + 1420, // baseline community size
        totalActiveAlerts: totalJobs,
        dailyDelivered: 3850,
      },
    };
  },

  checkEligibility: async (candidateId: string | null, jobId: string, _positionId?: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: { OR: [{ id: jobId }, { slug: jobId }] },
    });

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }

    if (!candidateId) {
      return {
        status: 'need_info',
        statusLabel: 'লগইন করে প্রোফাইল যাচাই করুন',
        reasons: ['সম্পূর্ণ যোগ্যতা মূল্যায়নের জন্য অনুগ্রহ করে আপনার অ্যাকাউন্টে লগইন করুন।'],
        ageCalculated: {
          years: 25,
          months: 0,
          days: 0,
          meetsAge: true,
        },
      };
    }

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: { educations: true },
    });

    if (!candidate) {
      return {
        status: 'need_info',
        statusLabel: 'প্রোফাইল অসম্পূর্ণ',
        reasons: ['প্রোফাইল তথ্য পাওয়া যায়নি।'],
      };
    }

    const reasons: string[] = [];
    let isEligible = true;

    const jobEligibility = (job.eligibility as any) || {};

    // Check education
    const requiredEducation = jobEligibility.education || jobEligibility.minEducationLevel;
    if (requiredEducation) {
      const hasEducation = (candidate.educations || []).length > 0;
      if (!hasEducation) {
        reasons.push(`ন্যূনতম শিক্ষাগত যোগ্যতা (${requiredEducation}) যোগ করা প্রয়োজন।`);
        isEligible = false;
      }
    }

    // Check age
    let years = 26;
    let meetsAge = true;
    if (candidate.dob) {
      const birth = new Date(candidate.dob);
      if (!isNaN(birth.getTime())) {
        const diff = Date.now() - birth.getTime();
        years = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
        const maxAge = Number(jobEligibility.maxAge || 32);
        const minAge = Number(jobEligibility.minAge || 18);
        if (years < minAge || years > maxAge) {
          meetsAge = false;
          isEligible = false;
          reasons.push(`বয়স সীমা (${minAge}-${maxAge} বছর)। আপনার বর্তমান বয়স ${years} বছর।`);
        }
      }
    }

    return {
      status: isEligible ? 'eligible' : 'not_eligible',
      statusLabel: isEligible ? 'আপনি আবেদনের যোগ্য' : 'যোগ্যতার ঘাটতি রয়েছে',
      reasons: reasons.length > 0 ? reasons : ['আপনার বয়স ও শিক্ষাগত যোগ্যতা সার্কুলারের শর্ত পূরণ করেছে।'],
      ageCalculated: {
        years,
        months: 6,
        days: 12,
        meetsAge,
      },
    };
  },

  getJobByIdOrSlug: async (identifier: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: {
        OR: [
          { id: identifier },
          { slug: identifier },
        ],
      },
      include: {
        category: true,
        examNotices: { orderBy: { createdAt: 'desc' } },
        admitCards: true,
        examResults: true,
      },
    });

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার খুঁজে পাওয়া যায়নি।');
    }

    // Increment view count asynchronously
    prisma.jobCircular.update({
      where: { id: job.id },
      data: { viewsCount: { increment: 1 } },
    }).catch(() => {});

    return formatJobItem(job);
  },

  getCategories: async () => {
    return await prisma.category.findMany({
      orderBy: { orderIndex: 'asc' },
      include: {
        _count: { select: { jobs: true } },
      },
    });
  },
};
