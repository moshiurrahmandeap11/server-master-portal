import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { TransactionType, TransactionStatus } from '../../../generated/prisma';

export const walletService = {
  getWalletOverview: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        name: true,
        walletBalance: true,
      },
    });

    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');
    }

    const transactions = await prisma.walletTransaction.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      balance: Number(candidate.walletBalance),
      transactions,
    };
  },

  rechargeWallet: async (candidateId: string, amount: number, method = 'bKash', trxId?: string) => {
    if (amount <= 0) {
      throw new AppError(status.BAD_REQUEST, 'রিচার্জের পরিমাণ সঠিক নয়।');
    }

    const cleanTrxId = trxId || `BK-${Date.now().toString().slice(-8)}`;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Credit wallet
      const updatedCandidate = await tx.candidate.update({
        where: { id: candidateId },
        data: { walletBalance: { increment: amount } },
      });

      // 2. Create transaction record
      const transaction = await tx.walletTransaction.create({
        data: {
          id: `TRX-${Date.now()}`,
          candidateId,
          amount,
          type: TransactionType.RECHARGE,
          method,
          trxId: cleanTrxId,
          status: TransactionStatus.COMPLETED,
          description: `${method} মাধ্যমে ৳${amount} ওয়ালেট রিচার্জ সম্পন্ন।`,
        },
      });

      // 3. Notification
      await tx.notificationItem.create({
        data: {
          id: `NOTIF-${Date.now()}`,
          candidateId,
          title: 'ওয়ালেট রিচার্জ সফল',
          message: `আপনার ওয়ালেটে ৳${amount} সফলভাবে যোগ করা হয়েছে। বর্তমান ব্যালেন্স: ৳${updatedCandidate.walletBalance}`,
          type: 'success',
          actionUrl: '/wallet',
        },
      });

      return {
        transaction,
        newBalance: Number(updatedCandidate.walletBalance),
      };
    });

    return result;
  },

  validateCoupon: async (candidateId: string, code: string, serviceFee: number) => {
    const cleanCode = code.trim().toUpperCase();
    const coupon = await prisma.coupon.findUnique({
      where: { code: cleanCode },
    });

    if (!coupon || coupon.status !== 'ACTIVE') {
      throw new AppError(status.NOT_FOUND, 'অবৈধ বা মেয়াদোত্তীর্ণ কুপন কোড।');
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new AppError(status.BAD_REQUEST, 'কুপনটির মেয়াদ শেষ হয়ে গেছে।');
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError(status.BAD_REQUEST, 'কুপনটির ব্যবহারের সর্বোচ্চ সীমা শেষ।');
    }

    // Check if user already used this coupon
    const userRedeemed = await prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, candidateId },
    });

    if (userRedeemed) {
      throw new AppError(status.BAD_REQUEST, 'আপনি ইতিমধ্যে এই কুপনটি ব্যবহার করেছেন।');
    }

    const discountVal = Number(coupon.discountValue);
    const finalDiscount = Math.min(serviceFee, discountVal);

    return {
      valid: true,
      code: coupon.code,
      discount: finalDiscount,
      message: `কুপন সফলভাবে প্রয়োগ হয়েছে! ৳${finalDiscount} ছাড় দেওয়া হয়েছে।`,
    };
  },
};
