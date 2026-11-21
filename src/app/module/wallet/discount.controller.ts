import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

export const discountController = {
  getAvailableDiscounts: catchAsync(async (_req: Request, res: Response) => {
    const [coupons, raffles] = await Promise.all([
      prisma.coupon.findMany({
        where: {
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.raffleCampaign.findMany({
        where: { status: 'active' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'সক্রিয় কুপন ও ছাড়ের তালিকা।',
      coupons,
      raffles,
      discounts: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : undefined,
        minSpend: c.minSpend ? Number(c.minSpend) : 0,
      })),
      data: coupons,
    });
  }),

  validateDiscount: catchAsync(async (req: Request, res: Response) => {
    const code = req.body.code || req.body.couponCode;
    const baseFee = Number(req.body.fee ?? req.body.serviceFee ?? req.body.serviceCharge ?? 50);
    const govtFee = Number(req.body.governmentFee ?? req.body.govtFee ?? 0);
    const raffleCampaignId = req.body.raffleCampaignId as string | undefined;

    if (!code && !raffleCampaignId) {
      throw new AppError(status.BAD_REQUEST, 'কুপন কোড প্রদান করুন।');
    }

    let finalDiscount = 0;
    let appliedCode: string | null = null;
    let couponStackable = true;

    if (code) {
      const cleanCode = String(code).trim().toUpperCase();
      const coupon = await prisma.coupon.findUnique({ where: { code: cleanCode } });

      if (!coupon || coupon.status !== 'ACTIVE') {
        return res.status(200).json({
          valid: false,
          success: false,
          discount: 0,
          message: 'অবৈধ বা মেয়াদোত্তীর্ণ কুপন কোড।',
        });
      }

      if (coupon.expiresAt && coupon.expiresAt < new Date()) {
        return res.status(200).json({
          valid: false,
          success: false,
          discount: 0,
          message: 'কুপনটির মেয়াদ শেষ হয়ে গেছে।',
        });
      }

      if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
        return res.status(200).json({
          valid: false,
          success: false,
          discount: 0,
          message: 'কুপনটির ব্যবহারের সীমা শেষ।',
        });
      }

      if (req.user?.candidateId) {
        const redeemed = await prisma.couponRedemption.findFirst({
          where: { couponId: coupon.id, candidateId: req.user.candidateId },
        });
        if (redeemed) {
          return res.status(200).json({
            valid: false,
            success: false,
            discount: 0,
            message: 'আপনি ইতিমধ্যে এই কুপনটি ব্যবহার করেছেন।',
          });
        }
      }

      if (coupon.minSpend && govtFee + baseFee < Number(coupon.minSpend)) {
        return res.status(200).json({
          valid: false,
          success: false,
          discount: 0,
          message: `এই কুপনের জন্য ন্যূনতম ৳${Number(coupon.minSpend)} খরচ হতে হবে।`,
        });
      }

      const rawVal = Number(coupon.discountValue);
      let computed = coupon.discountType === 'PERCENTAGE'
        ? Math.round((baseFee * rawVal) / 100)
        : rawVal;
      if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
        computed = Math.min(computed, Number(coupon.maxDiscount));
      }
      finalDiscount = Math.max(0, Math.min(baseFee, computed));
      appliedCode = coupon.code;
      couponStackable = coupon.stackable ?? true;
    }

    let raffleBonus = 0;
    if (raffleCampaignId) {
      const raffle = await prisma.raffleCampaign.findFirst({
        where: { id: raffleCampaignId, status: 'active' },
      });
      if (raffle && (couponStackable || !appliedCode)) {
        raffleBonus = Number(raffle.rewardAmount || 0);
      }
    }

    const finalServiceFee = Math.max(0, baseFee - finalDiscount);
    const snapshot = {
      govtFee,
      baseServiceFee: baseFee,
      discountAmount: finalDiscount,
      finalServiceFee,
      payableTotal: govtFee + finalServiceFee,
      couponCode: appliedCode,
      raffleCampaignId: raffleCampaignId || null,
      raffleRewardAmount: raffleBonus,
    };

    return res.status(200).json({
      valid: true,
      success: true,
      code: appliedCode,
      discount: finalDiscount,
      discountAmount: finalDiscount,
      snapshot,
      message: appliedCode
        ? `কুপন সফলভাবে প্রয়োগ হয়েছে! সার্ভিস চার্জে ৳${finalDiscount} ছাড়।`
        : 'অফার যাচাই সম্পন্ন হয়েছে।',
    });
  }),
};
