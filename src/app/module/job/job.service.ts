import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { IJobQueryFilters } from './job.interface';
import { JobStatus, Prisma } from '../../../generated/prisma';

export const jobService = {
  getAllJobs: async (filters: IJobQueryFilters) => {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.JobCircularWhereInput = {
      status: JobStatus.PUBLISHED,
    };

    if (filters.searchTerm) {
      where.OR = [
        { title: { contains: filters.searchTerm, mode: 'insensitive' } },
        { titleBn: { contains: filters.searchTerm, mode: 'insensitive' } },
        { organization: { contains: filters.searchTerm, mode: 'insensitive' } },
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
      jobs,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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

    return job;
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
