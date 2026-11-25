import crypto from 'crypto';
import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ICreateApplicationPayload } from './application.interface';
import { ApplicationStatus, DiscountType, TransactionType, TransactionStatus, JobStatus } from '../../../generated/prisma';

export const applicationService = {
  createApplication: async (candidateId: string, payload: ICreateApplicationPayload) => {
    const job = await prisma.jobCircular.findFirst({
      where: {
        OR: [{ id: payload.jobId }, { slug: payload.jobId }],
      },
    });

    if (!job || job.status !== JobStatus.PUBLISHED) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলারটি পাওয়া যায়নি অথবা বর্তমানে সক্রিয় নয়।');
    }

    payload.jobId = job.id;

    if (new Date(job.deadline) < new Date()) {
      throw new AppError(status.BAD_REQUEST, 'আবেদনের সময়সীমা শেষ হয়ে গেছে।');
    }

    const positionIndex = typeof payload.positionIndex === 'number' && payload.positionIndex >= 0 ? payload.positionIndex : 0;
    const positionsArr = Array.isArray(job.positions) ? (job.positions as any[]) : [];
    const selectedPos = positionsArr[positionIndex] || positionsArr[0];
    const postName = payload.postName || payload.positionName || selectedPos?.title || 'অফিসার';

    // Check duplicate application for the same job and position
    const existing = await prisma.applicationRequest.findFirst({
      where: {
        candidateId,
        jobId: payload.jobId,
        positionIndex,
      },
    });

    if (existing) {
      throw new AppError(status.CONFLICT, 'আপনি ইতিমধ্যে এই পদে আবেদন করেছেন।');
    }

    const isWalletPayment = (payload.paymentMethod || '').toLowerCase() === 'wallet';
    const useWalletSplit = Boolean(payload.useWalletSplit);

    // Strictly derive fees server-side from JobCircular DB record
    const govtFee = Math.max(0, Number(selectedPos?.govtFee ?? job.officialFee ?? 0));
    const originalServiceFee = Math.max(0, Number(job.serviceFee ?? 50));

    const trackingNumber = `CS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const applicationId = `APP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Execute atomic financial + application transaction
    const result = await prisma.$transaction(async (tx) => {
      let discount = 0;
      let appliedCouponId: string | null = null;

      if (payload.couponCode) {
        const coupon = await tx.coupon.findUnique({
          where: { code: payload.couponCode.trim().toUpperCase() },
        });

        if (!coupon || coupon.status !== 'ACTIVE') {
          throw new AppError(status.BAD_REQUEST, 'অবৈধ বা মেয়াদোত্তীর্ণ কুপন কোড।');
        }
        if (coupon.expiresAt && coupon.expiresAt < new Date()) {
          throw new AppError(status.BAD_REQUEST, 'কুপনটির মেয়াদ শেষ হয়ে গেছে।');
        }
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
          throw new AppError(status.BAD_REQUEST, 'কুপনটির ব্যবহারের সীমা শেষ।');
        }
        const priorRedemption = await tx.couponRedemption.findFirst({
          where: { couponId: coupon.id, candidateId },
        });
        if (priorRedemption) {
          throw new AppError(status.BAD_REQUEST, 'আপনি ইতিমধ্যে এই কুপনটি ব্যবহার করেছেন।');
        }
        if (coupon.minSpend && govtFee + originalServiceFee < Number(coupon.minSpend)) {
          throw new AppError(status.BAD_REQUEST, `এই কুপনের জন্য ন্যূনতম খরচ ৳${Number(coupon.minSpend)}।`);
        }

        const rawVal = Number(coupon.discountValue);
        let computed = coupon.discountType === DiscountType.PERCENTAGE
          ? Math.round((originalServiceFee * rawVal) / 100)
          : rawVal;
        if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
          computed = Math.min(computed, Number(coupon.maxDiscount));
        }
        discount = Math.max(0, Math.min(originalServiceFee, computed));
        appliedCouponId = coupon.id;
      }

      const finalServiceFee = Math.max(0, originalServiceFee - discount);
      const totalAmount = govtFee + finalServiceFee;

      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: { id: true, walletBalance: true },
      });
      if (!candidate) {
        throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
      }

      const currentBalance = Number(candidate.walletBalance || 0);
      let walletDeducted = 0;

      if (isWalletPayment) {
        if (currentBalance < totalAmount) {
          throw new AppError(
            status.PAYMENT_REQUIRED,
            `অপর্যাপ্ত ওয়ালেট ব্যালেন্স! প্রয়োজন: ৳${totalAmount}, বর্তমান ব্যালেন্স: ৳${currentBalance}। ওয়ালেট রিচার্জ করুন।`
          );
        }
        walletDeducted = totalAmount;
      } else if (useWalletSplit && currentBalance > 0 && totalAmount > 0) {
        walletDeducted = Math.min(currentBalance, totalAmount);
      }

      if (walletDeducted > 0) {
        const deducted = await tx.candidate.updateMany({
          where: {
            id: candidateId,
            walletBalance: { gte: walletDeducted },
          },
          data: { walletBalance: { decrement: walletDeducted } },
        });
        if (deducted.count === 0) {
          throw new AppError(status.PAYMENT_REQUIRED, 'অপর্যাপ্ত ওয়ালেট ব্যালেন্স। অনুগ্রহ করে রিচার্জ করে পুনরায় চেষ্টা করুন।');
        }
      }

      if (appliedCouponId) {
        await tx.coupon.update({
          where: { id: appliedCouponId },
          data: { usedCount: { increment: 1 } },
        });
        await tx.couponRedemption.create({
          data: {
            couponId: appliedCouponId,
            candidateId,
            discountApplied: discount,
          },
        });
      }

      const mobileDue = Math.max(0, totalAmount - walletDeducted);
      const isFullyPaidByWallet = isWalletPayment || mobileDue === 0;

      // 2. Create Application
      const application = await tx.applicationRequest.create({
        data: {
          id: applicationId,
          candidateId,
          jobId: payload.jobId,
          positionIndex,
          positionName: postName,
          trackingNumber,
          status: ApplicationStatus.PENDING,
          govtFee,
          serviceFee: finalServiceFee,
          discount,
          totalPaid: totalAmount,
          splitWalletAmount: walletDeducted > 0 ? walletDeducted : null,
          paymentMethod: payload.paymentMethod || 'bKash',
          transactionId: payload.trxId || payload.transactionId || null,
          paymentScreenshotUrl: payload.paymentScreenshotUrl || null,
          submissionChannel: payload.submissionChannel || 'teletalk',
          statusHistory: [
            {
              status: 'PENDING',
              timestamp: new Date().toISOString(),
              note: isFullyPaidByWallet
                ? 'আবেদন ফি ওয়ালেট থেকে সফলভাবে পরিশোধ হয়েছে। অপারেটর কিউতে প্রেরণ করা হয়েছে।'
                : `আবেদন জমা হয়েছে (${payload.paymentMethod || 'মোবাইল ব্যাংকিং'} প্রদেয়: ৳${mobileDue}, TrxID: ${payload.trxId || 'N/A'})। ভেরিফিকেশনের পর প্রসেস শুরু হবে।`,
            },
          ],
        },
      });

      // 3. Create Transaction Record(s)
      if (walletDeducted > 0) {
        await tx.walletTransaction.create({
          data: {
            id: `TRX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            candidateId,
            amount: walletDeducted,
            type: TransactionType.APPLICATION_FEE,
            method: 'wallet',
            status: TransactionStatus.COMPLETED,
            trxId: `WALLET-${trackingNumber}`,
            description: `${postName} পদে আবেদন ফি ওয়ালেট থেকে পরিশোধ (ট্র্যাকিং: ${trackingNumber})`,
            referenceId: applicationId,
          },
        });
      }

      if (mobileDue > 0) {
        await tx.walletTransaction.create({
          data: {
            id: `TRX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            candidateId,
            amount: mobileDue,
            type: TransactionType.APPLICATION_FEE,
            method: payload.paymentMethod || 'bKash',
            status: TransactionStatus.PENDING,
            trxId: payload.trxId || payload.transactionId || `MB-${trackingNumber}`,
            description: `${postName} পদে আবেদন ফি (${payload.paymentMethod || 'মোবাইল ব্যাংকিং'}) (ট্র্যাকিং: ${trackingNumber})`,
            referenceId: applicationId,
          },
        });
      }

      // 4. Create Notification
      await tx.notificationItem.create({
        data: {
          id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          candidateId,
          title: 'আবেদন গৃহীত হয়েছে',
          message: `${job.organization}-এর "${postName}" পদে আপনার আবেদন সফলভাবে জমা হয়েছে। ট্র্যাকিং নং: ${trackingNumber}`,
          type: 'success',
          actionUrl: `/dashboard/applications`,
        },
      });

      return { application, totalAmount };
    });

    return {
      ...result.application,
      totalAmount: result.totalAmount,
      postName,
      jobTitle: job.title,
      organization: job.organization,
    };
  },

  getMyApplications: async (candidateId: string) => {
    const apps = await prisma.applicationRequest.findMany({
      where: { candidateId },
      include: {
        job: {
          select: {
            title: true,
            titleBn: true,
            organization: true,
            deadline: true,
            officialPdfUrl: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const normalizeAppStatus = (raw: string): string => {
      const s = String(raw || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'ADMIT_ISSUED') return 'completed';
      if (s === 'PROCESSING' || s === 'PAYMENT_COMPLETED') return 'processing';
      if (s === 'REJECTED' || s === 'CANCELLED') return 'rejected';
      return 'pending_payment';
    };

    return apps.map((a: any) => ({
      ...a,
      status: normalizeAppStatus(a.status),
      rawStatus: a.status,
      jobTitle: a.job?.title || a.job?.titleBn || a.positionName || 'চাকরির বিজ্ঞপ্তি',
      organization: a.job?.organization || '',
      date: a.submittedAt ? new Date(a.submittedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      totalAmount: Number(a.totalPaid ?? (Number(a.govtFee || 0) + Number(a.serviceFee || 0))),
      trxId: a.transactionId || '',
    }));
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

  updateApplication: async (user: any, applicationId: string, payload: any) => {
    const isStaff = user?.role === 'ADMIN' || user?.role === 'OPERATOR';
    const existing = await prisma.applicationRequest.findFirst({
      where: isStaff ? { id: applicationId } : { id: applicationId, candidateId: user?.candidateId || user?.id },
    });

    if (!existing) {
      throw new AppError(status.NOT_FOUND, 'আবেদন খুঁজে পাওয়া যায়নি।');
    }

    // Candidates can ONLY update their own pending payment TrxID / screenshot
    if (!isStaff) {
      if (existing.status !== ApplicationStatus.PENDING) {
        throw new AppError(status.FORBIDDEN, 'প্রসেসিং শুরু হওয়া আবেদন পরিবর্তন করার অনুমতি নেই।');
      }
      const allowedCandidateTrx = (payload.trxId || payload.transactionId || '').trim();
      const updated = await prisma.applicationRequest.update({
        where: { id: existing.id },
        data: {
          ...(allowedCandidateTrx ? { transactionId: allowedCandidateTrx } : {}),
          ...(payload.paymentScreenshotUrl ? { paymentScreenshotUrl: String(payload.paymentScreenshotUrl) } : {}),
        },
      });
      return updated;
    }

    let nextStatus: ApplicationStatus | undefined = undefined;
    if (payload.status) {
      const s = String(payload.status).toUpperCase();
      if (s === 'COMPLETED' || s === 'ADMIT_ISSUED') nextStatus = ApplicationStatus.COMPLETED;
      else if (s === 'PROCESSING' || s === 'PAYMENT_COMPLETED') nextStatus = ApplicationStatus.PROCESSING;
      else if (s === 'REJECTED' || s === 'CANCELLED') nextStatus = ApplicationStatus.REJECTED;
      else if (s === 'PENDING' || s === 'PENDING_PAYMENT') nextStatus = ApplicationStatus.PENDING;
    }

    const existingHistory = (existing.statusHistory as any[]) || [];
    if (nextStatus && nextStatus !== existing.status) {
      existingHistory.push({
        status: nextStatus,
        timestamp: new Date().toISOString(),
        note: payload.notes || payload.operatorNotes || `স্ট্যাটাস পরিবর্তন: ${nextStatus}`,
      });
    }

    const updated = await prisma.applicationRequest.update({
      where: { id: existing.id },
      data: {
        ...(nextStatus ? { status: nextStatus } : {}),
        applicantCopyPdfUrl: payload.applicantCopyPdfUrl || existing.applicantCopyPdfUrl,
        admitCardUrl: payload.admitCardUrl || existing.admitCardUrl,
        operatorNotes: payload.notes || payload.operatorNotes || existing.operatorNotes,
        teletalkUserId: payload.teletalkUserId || payload.teleTalkTrackingId || existing.teletalkUserId,
        teleTalkPassword: payload.teleTalkPassword || existing.teleTalkPassword,
        corporateTrackingId: payload.corporateTrackingId || existing.corporateTrackingId,
        rollNumber: payload.rollNumber || existing.rollNumber,
        statusHistory: existingHistory,
      },
    });

    return updated;
  },
};
