import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

export const discountController = {
  getAvailableDiscounts: catchAsync(async (_req: Request, res: Response) => {
    const coupons = await prisma.coupon.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      message: 'সক্রিয় কুপন ও ছাড়ের তালিকা।',
      coupons,
      discounts: coupons.map((c) => ({
        id: c.id,
        code: c.code,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        minSpend: c.minSpend ? Number(c.minSpend) : 0,
      })),
      data: coupons,
    });
  }),

  validateDiscount: catchAsync(async (req: Request, res: Response) => {
    const { code, fee, serviceFee } = req.body;
    const baseFee = Number(fee || serviceFee || 50);

    if (!code) {
      throw new AppError(status.BAD_REQUEST, 'কুপন কোড প্রদান করুন।');
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await prisma.coupon.findUnique({
      where: { code: cleanCode },
    });

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

    const discountVal = Number(coupon.discountValue);
    const finalDiscount = Math.min(baseFee, discountVal);

    return res.status(200).json({
      valid: true,
      success: true,
      code: coupon.code,
      discount: finalDiscount,
      discountAmount: finalDiscount,
      message: `কুপন সফলভাবে প্রয়োগ হয়েছে! ৳${finalDiscount} ছাড় দেওয়া হয়েছে।`,
    });
  }),
};
