import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ApplicationStatus } from '../../../generated/prisma';

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

  getAllCandidates: async (page = 1, limit = 20, searchTerm = '') => {
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
          _count: { select: { applications: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.candidate.count({ where }),
    ]);

    return {
      candidates: candidates.map(c => ({ ...c, walletBalance: Number(c.walletBalance) })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  getAllApplications: async (page = 1, limit = 20, statusFilter?: ApplicationStatus) => {
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
          candidate: { select: { name: true, email: true, phone: true } },
          job: { select: { title: true, organization: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.applicationRequest.count({ where }),
    ]);

    return {
      applications,
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
    });

    return updated;
  },

  getAuditLogs: async (limit = 50) => {
    return await prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
