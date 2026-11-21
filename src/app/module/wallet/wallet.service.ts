import crypto from 'crypto';
import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { DiscountType, TransactionType, TransactionStatus } from '../../../generated/prisma';

const calculateCouponDiscount = (
  coupon: {
    discountType: DiscountType;
    discountValue: any;
    maxDiscount?: any;
    minSpend?: any;
  },
  baseServiceFee: number,
  totalSpend: number
): number => {
  if (coupon.minSpend && totalSpend < Number(coupon.minSpend)) {
    throw new AppError(status.BAD_REQUEST, `এই কুপনটির জন্য ন্যূনতম খরচ ৳${Number(coupon.minSpend)} হতে হবে।`);
  }
  const rawVal = Number(coupon.discountValue);
  let rawDiscount = coupon.discountType === DiscountType.PERCENTAGE
    ? Math.round((baseServiceFee * rawVal) / 100)
    : rawVal;

  if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
    rawDiscount = Math.min(rawDiscount, Number(coupon.maxDiscount));
  }
  return Math.max(0, Math.min(baseServiceFee, rawDiscount));
};

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
      transactions: transactions.map((t) => ({
        ...t,
        amount: Number(t.amount),
        date: t.createdAt.toISOString(),
        status: t.status.toLowerCase(),
        type: t.type.toLowerCase(),
      })),
    };
  },

  rechargeWallet: async (candidateId: string, amount: number, method = 'bKash', trxId?: string) => {
    if (!Number.isFinite(amount) || amount < 10 || amount > 50000) {
      throw new AppError(status.BAD_REQUEST, 'রিচার্জের পরিমাণ ন্যূনতম ৳১০ থেকে ৳৫০,০০০ এর মধ্যে হতে হবে।');
    }

    const cleanTrxId = (trxId || '').trim();
    if (cleanTrxId.length < 4) {
      throw new AppError(status.BAD_REQUEST, 'সঠিক পেমেন্ট ট্রানজেকশন আইডি (TrxID) প্রদান করুন।');
    }

    const existingTrx = await prisma.walletTransaction.findFirst({
      where: { trxId: cleanTrxId },
      select: { id: true },
    });
    if (existingTrx) {
      throw new AppError(status.CONFLICT, 'এই ট্রানজেকশন আইডি (TrxID) ইতিমধ্যে ব্যবহৃত হয়েছে।');
    }

    const result = await prisma.$transaction(async (tx) => {
      const candidate = await tx.candidate.findUnique({
        where: { id: candidateId },
        select: { walletBalance: true },
      });
      if (!candidate) {
        throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');
      }

      // Create PENDING recharge transaction — credited strictly upon admin verification!
      const trxRecordId = `TRX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const transaction = await tx.walletTransaction.create({
        data: {
          id: trxRecordId,
          candidateId,
          amount,
          type: TransactionType.RECHARGE,
          method,
          trxId: cleanTrxId,
          status: TransactionStatus.PENDING,
          description: `${method} মাধ্যমে ৳${amount} ওয়ালেট রিচার্জ অনুরোধ (TrxID: ${cleanTrxId})। অ্যাডমিন ভেরিফিকেশন অপেক্ষমান।`,
        },
      });

      await tx.notificationItem.create({
        data: {
          id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          candidateId,
          title: 'ওয়ালেট রিচার্জ অনুরোধ গৃহীত',
          message: `আপনার ${method} ৳${amount} রিচার্জ অনুরোধ (TrxID: ${cleanTrxId}) ভেরিফিকেশনের জন্য জমা হয়েছে।`,
          type: 'info',
          actionUrl: '/dashboard/wallet',
        },
      });

      return {
        transaction: {
          ...transaction,
          amount: Number(transaction.amount),
          date: transaction.createdAt.toISOString(),
          status: transaction.status.toLowerCase(),
          type: transaction.type.toLowerCase(),
        },
        newBalance: Number(candidate.walletBalance),
      };
    });

    return result;
  },

  validateCoupon: async (candidateId: string, code: string, serviceFee: number, govtFee = 0) => {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new AppError(status.BAD_REQUEST, 'কুপন কোড প্রদান করুন।');
    }

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

    const userRedeemed = await prisma.couponRedemption.findFirst({
      where: { couponId: coupon.id, candidateId },
    });

    if (userRedeemed) {
      throw new AppError(status.BAD_REQUEST, 'আপনি ইতিমধ্যে এই কুপনটি ব্যবহার করেছেন।');
    }

    const finalDiscount = calculateCouponDiscount(coupon, serviceFee, govtFee + serviceFee);
    const finalServiceFee = Math.max(0, serviceFee - finalDiscount);

    return {
      valid: true,
      code: coupon.code,
      discount: finalDiscount,
      discountAmount: finalDiscount,
      snapshot: {
        govtFee,
        baseServiceFee: serviceFee,
        discountAmount: finalDiscount,
        finalServiceFee,
        payableTotal: govtFee + finalServiceFee,
        couponCode: coupon.code,
      },
      message: `কুপন সফলভাবে প্রয়োগ হয়েছে! ৳${finalDiscount} ছাড় দেওয়া হয়েছে।`,
    };
  },
};
