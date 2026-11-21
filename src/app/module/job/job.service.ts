import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { IJobQueryFilters } from './job.interface';
import { JobStatus, Prisma } from '../../../generated/prisma';

export const formatJobItem = (j: any) => {
  if (!j) return j;
  const parsedOfficial = Number(j.officialFee);
  const officialFeeNum = j.officialFee !== null && j.officialFee !== undefined && Number.isFinite(parsedOfficial)
    ? parsedOfficial
    : (Number(j.positions?.[0]?.govtFee) || 0);
  const parsedService = Number(j.serviceFee);
  const serviceFeeNum = j.serviceFee !== null && j.serviceFee !== undefined && Number.isFinite(parsedService)
    ? parsedService
    : 50;
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

    if (searchTerm) {
      prisma.searchAnalyticsLog.create({
        data: { query: searchTerm, resultCount: total, category: category || 'all' },
      }).catch(() => {});
    }

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

    const resultJobs = jobs.length > 0 || dateStr
      ? jobs
      : await prisma.jobCircular.findMany({
          where: { status: JobStatus.PUBLISHED },
          include: { category: true },
          take: 10,
          orderBy: { createdAt: 'desc' },
        });

    return {
      date: startOfDay.toISOString().split('T')[0],
      jobs: resultJobs.map(formatJobItem),
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

    const jobs = await prisma.jobCircular.findMany({
      where,
      take,
      include: { category: true },
      orderBy,
    });

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
    const minutesRemaining = Math.max(0, Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60)));

    const evalStatus = isExpired ? 'EXPIRED' : daysRemaining === 0 ? 'CLOSING_TODAY' : daysRemaining <= 3 ? 'CLOSING_SOON' : 'ACTIVE';
    const labelBn = isExpired
      ? 'সময়সীমা শেষ'
      : daysRemaining === 0
      ? 'আজই শেষ দিন'
      : daysRemaining <= 3
      ? `মাত্র ${daysRemaining} দিন বাকি`
      : `${daysRemaining} দিন বাকি`;
    const badgeColor = isExpired ? 'red' : daysRemaining <= 3 ? 'amber' : 'emerald';

    return {
      jobId: job.id,
      deadline: job.deadline,
      isExpired,
      daysRemaining,
      hoursRemaining,
      minutesRemaining,
      urgency: isExpired ? 'expired' : daysRemaining === 0 ? 'today' : daysRemaining <= 3 ? 'urgent' : 'normal',
      evaluation: {
        daysRemaining,
        hoursRemaining,
        minutesRemaining,
        status: evalStatus,
        labelBn,
        badgeColor,
        hasExactTime: true,
      },
    };
  },

  getJobDownloadInfo: async (jobId: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: { OR: [{ id: jobId }, { slug: jobId }], status: JobStatus.PUBLISHED },
      select: { id: true, slug: true, title: true, officialPdfUrl: true, sourceUrl: true },
    });
    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }
    const target = job.officialPdfUrl || job.sourceUrl;
    if (target && /^https?:\/\//i.test(target)) {
      return {
        redirectUrl: `/api/pdf-proxy?url=${encodeURIComponent(target)}&download=1&filename=${encodeURIComponent((job.slug || job.id) + '.pdf')}`,
        officialPdfUrl: target,
      };
    }
    return {
      redirectUrl: null,
      officialPdfUrl: target || null,
      sheetUrl: `/api/circulars/${encodeURIComponent(job.id)}/page-1.svg`,
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
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const [totalSubscribers, totalJobs, dailyDelivered] = await Promise.all([
      prisma.jobAlertSubscription.count(),
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED } }),
      prisma.notificationDelivery.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

    return {
      stats: {
        totalSubscribers,
        totalActiveAlerts: totalJobs,
        dailyDelivered,
      },
    };
  },

  checkEligibility: async (candidateId: string | null, jobId: string, positionId?: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: { OR: [{ id: jobId }, { slug: jobId }], status: JobStatus.PUBLISHED },
    });

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলার পাওয়া যায়নি।');
    }

    if (!candidateId) {
      return {
        status: 'need_info',
        statusLabel: 'লগইন করে প্রোফাইল যাচাই করুন',
        reasons: ['সম্পূর্ণ যোগ্যতা মূল্যায়নের জন্য অনুগ্রহ করে আপনার অ্যাকাউন্টে লগইন করুন।'],
        ageCalculated: null,
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
        ageCalculated: null,
      };
    }

    const reasons: string[] = [];
    let isEligible = true;
    let missingInfo = false;

    const jobEligibility = (job.eligibility as any) || {};
    const positionsArr = Array.isArray(job.positions) ? (job.positions as any[]) : [];
    const selectedPos = positionId
      ? positionsArr.find((p, idx) => String(idx) === String(positionId) || p.id === positionId || p.title === positionId)
      : positionsArr[0];

    // Check education requirement
    const requiredEducation = String(selectedPos?.minEducation || jobEligibility.education || jobEligibility.minEducationLevel || '').trim();
    if (requiredEducation) {
      const educations = candidate.educations || [];
      if (educations.length === 0) {
        missingInfo = true;
        isEligible = false;
        reasons.push(`ন্যূনতম শিক্ষাগত যোগ্যতা (${requiredEducation}) প্রোফাইলে যোগ করা প্রয়োজন।`);
      } else {
        const eduHierarchy: Record<string, number> = { ssc: 1, hsc: 2, diploma: 2, honours: 3, graduate: 3, bachelor: 3, masters: 4 };
        const reqLower = requiredEducation.toLowerCase();
        const reqRank = reqLower.includes('মাস্টার্স') || reqLower.includes('master') ? 4
          : reqLower.includes('স্নাতক') || reqLower.includes('honour') || reqLower.includes('graduate') || reqLower.includes('bachelor') ? 3
          : reqLower.includes('এইচএসসি') || reqLower.includes('hsc') || reqLower.includes('ডিপ্লোমা') ? 2
          : reqLower.includes('এসএসসি') || reqLower.includes('ssc') ? 1 : 0;
        const maxCandidateRank = educations.reduce((mx, e) => {
          const lv = `${e.level} ${e.examTitle}`.toLowerCase();
          for (const [k, r] of Object.entries(eduHierarchy)) {
            if (lv.includes(k)) mx = Math.max(mx, r);
          }
          if (lv.includes('স্নাতকোত্তর') || lv.includes('মাস্টার্স')) mx = Math.max(mx, 4);
          else if (lv.includes('স্নাতক')) mx = Math.max(mx, 3);
          else if (lv.includes('এইচএসসি')) mx = Math.max(mx, 2);
          else if (lv.includes('এসএসসি')) mx = Math.max(mx, 1);
          return mx;
        }, 0);
        if (reqRank > 0 && maxCandidateRank > 0 && maxCandidateRank < reqRank) {
          isEligible = false;
          reasons.push(`প্রয়োজনীয় শিক্ষাগত যোগ্যতা (${requiredEducation}) পূর্ণ হয়নি।`);
        }
      }
    }

    // Check district restriction
    const allowedDistricts = String(jobEligibility.districts || '').trim();
    if (allowedDistricts && !allowedDistricts.includes('সকল') && !allowedDistricts.toLowerCase().includes('all')) {
      if (!candidate.district) {
        missingInfo = true;
        reasons.push('জেলা যাচাইয়ের জন্য আপনার প্রোফাইলে স্থায়ী জেলা যোগ করুন।');
      } else if (!allowedDistricts.toLowerCase().includes(candidate.district.toLowerCase())) {
        isEligible = false;
        reasons.push(`আপনার জেলা (${candidate.district}) এই নিয়োগের অনুমোদিত জেলার তালিকায় নেই।`);
      }
    }

    // Check exact age
    let ageCalculated: { years: number; months: number; days: number; meetsAge: boolean } | null = null;
    if (!candidate.dob) {
      missingInfo = true;
      reasons.push('বয়স যাচাইয়ের জন্য আপনার জন্মতারিখ প্রোফাইলে যোগ করুন।');
    } else {
      const birth = new Date(candidate.dob);
      if (!isNaN(birth.getTime())) {
        const refDate = new Date();
        let years = refDate.getFullYear() - birth.getFullYear();
        let months = refDate.getMonth() - birth.getMonth();
        let days = refDate.getDate() - birth.getDate();
        if (days < 0) {
          months -= 1;
          days += new Date(refDate.getFullYear(), refDate.getMonth(), 0).getDate();
        }
        if (months < 0) {
          years -= 1;
          months += 12;
        }
        const maxAge = Number(jobEligibility.maxAge || 32);
        const minAge = Number(jobEligibility.minAge || 18);
        const meetsAge = years >= minAge && years <= maxAge;
        if (!meetsAge) {
          isEligible = false;
          reasons.push(`বয়স সীমা (${minAge}-${maxAge} বছর)। আপনার বর্তমান বয়স ${years} বছর ${months} মাস।`);
        }
        ageCalculated = { years, months, days, meetsAge };
      } else {
        missingInfo = true;
        reasons.push('প্রোফাইলের জন্মতারিখের ফরম্যাট সঠিক নয়।');
      }
    }

    const finalStatus = !isEligible ? 'not_eligible' : missingInfo ? 'need_info' : 'eligible';
    return {
      status: finalStatus,
      statusLabel:
        finalStatus === 'eligible'
          ? 'আপনি আবেদনের যোগ্য'
          : finalStatus === 'need_info'
          ? 'প্রোফাইল তথ্য অসম্পূর্ণ'
          : 'যোগ্যতার ঘাটতি রয়েছে',
      reasons: reasons.length > 0 ? reasons : ['আপনার বয়স, জেলা ও শিক্ষাগত যোগ্যতা সার্কুলারের শর্ত পূরণ করেছে।'],
      ageCalculated,
    };
  },

  getJobByIdOrSlug: async (identifier: string) => {
    const job = await prisma.jobCircular.findFirst({
      where: {
        status: JobStatus.PUBLISHED,
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

  getOrganizations: async () => {
    const [orgs, publishedJobs] = await Promise.all([
      prisma.organization.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      prisma.jobCircular.findMany({
        where: { status: JobStatus.PUBLISHED },
        select: { id: true, organization: true, organizationSlug: true, totalPositions: true },
      }),
    ]);

    return orgs.map((org) => {
      const matched = publishedJobs.filter(
        (j) =>
          (j.organizationSlug && j.organizationSlug === org.slug) ||
          j.organization === org.name ||
          (org.nameBn && j.organization === org.nameBn),
      );
      return {
        ...org,
        activeJobsCount: matched.length,
        totalVacancies: matched.reduce((sum, j) => sum + (j.totalPositions || 0), 0),
      };
    });
  },

  getOrganizationBySlug: async (slug: string) => {
    const org = await prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new AppError(status.NOT_FOUND, 'প্রতিষ্ঠানটি খুঁজে পাওয়া যায়নি।');
    }
    const jobs = await prisma.jobCircular.findMany({
      where: {
        status: JobStatus.PUBLISHED,
        OR: [
          { organizationSlug: org.slug },
          { organization: org.name },
          ...(org.nameBn ? [{ organization: org.nameBn }] : []),
        ],
      },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      organization: org,
      jobs: jobs.map(formatJobItem),
    };
  },
};
