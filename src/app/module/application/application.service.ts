import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ICreateApplicationPayload } from './application.interface';
import { ApplicationStatus, TransactionType, TransactionStatus } from '../../../generated/prisma';

export const applicationService = {
  createApplication: async (candidateId: string, payload: ICreateApplicationPayload) => {
    const job = await prisma.jobCircular.findUnique({
      where: { id: payload.jobId },
    });

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলারটি পাওয়া যায়নি।');
    }

    if (new Date(job.deadline) < new Date()) {
      throw new AppError(status.BAD_REQUEST, 'আবেদনের সময়সীমা শেষ হয়ে গেছে।');
    }

    // Check duplicate application for the same job and position
    const existing = await prisma.applicationRequest.findFirst({
      where: {
        candidateId,
        jobId: payload.jobId,
        positionIndex: payload.positionIndex,
      },
    });

    if (existing) {
      throw new AppError(status.CONFLICT, 'আপনি ইতিমধ্যে এই পদে আবেদন করেছেন।');
    }

    const govtFee = Number(payload.govtFee || job.officialFee);
    const originalServiceFee = Number(payload.serviceFee || job.serviceFee);
    let discount = 0;

    // Validate coupon if provided
    if (payload.couponCode) {
      const coupon = await prisma.coupon.findUnique({
        where: { code: payload.couponCode.trim().toUpperCase() },
      });

      if (coupon && coupon.status === 'ACTIVE') {
        const discountVal = Number(coupon.discountValue);
        // Financial invariant: discount strictly applies to service fee only!
        discount = Math.min(originalServiceFee, discountVal);
      }
    }

    const finalServiceFee = Math.max(0, originalServiceFee - discount);
    const totalAmount = govtFee + finalServiceFee;

    // Check candidate wallet balance
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
    }

    const currentBalance = Number(candidate.walletBalance);
    if (currentBalance < totalAmount) {
      throw new AppError(
        status.PAYMENT_REQUIRED,
        `অপর্যাপ্ত ওয়ালেট ব্যালেন্স! প্রয়োজন: ৳${totalAmount}, বর্তমান ব্যালেন্স: ৳${currentBalance}। ওয়ালেট রিচার্জ করুন।`
      );
    }

    const trackingNumber = `CS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const applicationId = `APP-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

    // Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct wallet
      await tx.candidate.update({
        where: { id: candidateId },
        data: { walletBalance: { decrement: totalAmount } },
      });

      // 2. Create Application
      const application = await tx.applicationRequest.create({
        data: {
          id: applicationId,
          candidateId,
          jobId: payload.jobId,
          positionIndex: payload.positionIndex,
          positionName: payload.positionName,
          trackingNumber,
          status: ApplicationStatus.PENDING,
          govtFee,
          serviceFee: finalServiceFee,
          discount,
          totalPaid: totalAmount,
          paymentMethod: payload.paymentMethod || 'wallet',
          statusHistory: [
            {
              status: 'PENDING',
              timestamp: new Date().toISOString(),
              note: 'আবেদন ফি সফলভাবে পরিশোধ হয়েছে। অপারেটর কিউতে প্রেরণ করা হয়েছে।',
            },
          ],
        },
      });

      // 3. Create Wallet Transaction Record
      await tx.walletTransaction.create({
        data: {
          id: `TRX-${Date.now()}`,
          candidateId,
          amount: totalAmount,
          type: TransactionType.APPLICATION_FEE,
          method: 'wallet',
          status: TransactionStatus.COMPLETED,
          description: `${payload.positionName} পদে আবেদন ফি পরিশোধ (ট্র্যাকিং: ${trackingNumber})`,
          referenceId: applicationId,
        },
      });

      // 4. Create Notification
      await tx.notificationItem.create({
        data: {
          id: `NOTIF-${Date.now()}`,
          candidateId,
          title: 'আবেদন গৃহীত হয়েছে',
          message: `${job.organization}-এর "${payload.positionName}" পদে আপনার আবেদন সফলভাবে জমা হয়েছে। ট্র্যাকিং নং: ${trackingNumber}`,
          type: 'success',
          actionUrl: `/applications`,
        },
      });

      return application;
    });

    return result;
  },

  getMyApplications: async (candidateId: string) => {
    return await prisma.applicationRequest.findMany({
      where: { candidateId },
      include: {
        job: {
          select: {
            title: true,
            organization: true,
            deadline: true,
            officialPdfUrl: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  },

  getApplicationDetails: async (candidateId: string, applicationId: string) => {
    const application = await prisma.applicationRequest.findFirst({
      where: {
        id: applicationId,
        candidateId,
      },
      include: {
        job: true,
        candidate: {
          select: {
            name: true,
            email: true,
            phone: true,
            district: true,
          },
        },
      },
    });

    if (!application) {
      throw new AppError(status.NOT_FOUND, 'আবেদন খুঁজে পাওয়া যায়নি।');
    }

    return application;
  },

  updateApplication: async (candidateId: string, applicationId: string, payload: any) => {
    const existing = await prisma.applicationRequest.findFirst({
      where: { id: applicationId, candidateId },
    });

    if (!existing) {
      throw new AppError(status.NOT_FOUND, 'আবেদন খুঁজে পাওয়া যায়নি।');
    }

    const updated = await prisma.applicationRequest.update({
      where: { id: existing.id },
      data: {
        applicantCopyPdfUrl: payload.applicantCopyPdfUrl || existing.applicantCopyPdfUrl,
        operatorNotes: payload.operatorNotes || existing.operatorNotes,
      },
    });

    return updated;
  },
};
