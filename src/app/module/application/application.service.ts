import status from 'http-status';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { ICreateApplicationPayload } from './application.interface';
import { ApplicationStatus, TransactionType, TransactionStatus, JobStatus } from '../../../generated/prisma';

function parseBengaliDate(dateStr?: string): Date {
  if (!dateStr) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let norm = String(dateStr);
  bnDigits.forEach((d, idx) => { norm = norm.split(d).join(String(idx)); });
  const direct = Date.parse(norm);
  if (!isNaN(direct)) return new Date(direct);

  const monthMap: Record<string, string> = {
    'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04',
    'মে': '05', 'জুন': '06', 'জুলাই': '07', 'আগস্ট': '08',
    'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12'
  };
  for (const [bnMonth, numMonth] of Object.entries(monthMap)) {
    if (norm.includes(bnMonth)) {
      const match = norm.match(/(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const year = match[3];
        return new Date(`${year}-${numMonth}-${day}T23:59:59.000Z`);
      }
    }
  }
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

async function findOrAutoSyncJob(jobId: string) {
  let job = await prisma.jobCircular.findFirst({
    where: {
      OR: [{ id: jobId }, { slug: jobId }],
    },
  });
  if (job) return job;

  // Search local stores for fallback
  const candidatePaths = [
    path.resolve(process.cwd(), '_legacy_archive/db/local_store.json'),
    path.resolve(process.cwd(), '../client-master-portal/src/db/local_store.json'),
    path.resolve(process.cwd(), 'src/db/local_store.json'),
  ];

  for (const filePath of candidatePaths) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const storeJobs = raw.jobs || {};
      const found = storeJobs[jobId] || Object.values(storeJobs).find((j: any) => j.id === jobId || j.slug === jobId);
      if (found) {
        const f = found as any;
        const positions = (Array.isArray(f.positions) && f.positions.length > 0)
          ? f.positions
          : [{
              title: f.title || 'অফিসার',
              grade: f.grade || '১০ম গ্রেড',
              posts: Number(f.totalPosts) || 1,
              salary: f.salary || 'জাতীয় বেতন স্কেল',
              minEducation: f.minEducation || 'স্নাতক',
              govtFee: Number(f.govtFee) || 0,
            }];

        const created = await prisma.jobCircular.upsert({
          where: { id: f.id },
          update: {
            status: JobStatus.PUBLISHED,
          },
          create: {
            id: f.id,
            slug: f.slug || f.id,
            title: f.title || 'চাকরির বিজ্ঞপ্তি',
            titleBn: f.title || null,
            organization: f.organization || 'সরকারি সংস্থা',
            deadline: parseBengaliDate(f.deadline),
            totalPositions: Number(f.totalPosts) || positions.reduce((acc: number, p: any) => acc + (Number(p.posts) || 0), 0) || 1,
            officialFee: Number(f.govtFee) || 0,
            serviceFee: Number(f.serviceFee) || 50,
            sourceUrl: f.officialLink || f.applicationUrl || null,
            officialPdfUrl: f.pdfUrl || f.circularPdfUrl || null,
            bannerUrl: f.logo || null,
            positions,
            eligibility: {
              minAge: f.minAge,
              maxAge: f.maxAge,
              districts: f.districts,
              education: f.minEducation,
            },
            status: JobStatus.PUBLISHED,
          },
        });
        return created;
      }
    } catch {}
  }
  return null;
}

export const applicationService = {
  createApplication: async (candidateId: string, payload: ICreateApplicationPayload) => {
    const job = await findOrAutoSyncJob(payload.jobId);

    if (!job) {
      throw new AppError(status.NOT_FOUND, 'চাকরির সার্কুলারটি পাওয়া যায়নি।');
    }

    payload.jobId = job.id;

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

    const isWalletPayment = (payload.paymentMethod || '').toLowerCase() === 'wallet';
    const postName = payload.postName || payload.positionName || 'অফিসার';
    const positionIndex = typeof payload.positionIndex === 'number' ? payload.positionIndex : 0;
    const govtFee = Number(payload.govtFee ?? payload.governmentFee ?? job.officialFee ?? 0);
    const originalServiceFee = Number(payload.serviceFee ?? payload.serviceCharge ?? job.serviceFee ?? 50);
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
    const totalAmount = Number(payload.totalAmount) || (govtFee + finalServiceFee);

    // Check candidate wallet balance
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    if (!candidate) {
      throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।');
    }

    if (isWalletPayment) {
      const currentBalance = Number(candidate.walletBalance);
      if (currentBalance < totalAmount) {
        throw new AppError(
          status.PAYMENT_REQUIRED,
          `অপর্যাপ্ত ওয়ালেট ব্যালেন্স! প্রয়োজন: ৳${totalAmount}, বর্তমান ব্যালেন্স: ৳${currentBalance}। ওয়ালেট রিচার্জ করুন।`
        );
      }
    }

    const trackingNumber = `CS-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
    const applicationId = `APP-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`.toUpperCase();

    // Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Deduct wallet if wallet payment
      if (isWalletPayment) {
        await tx.candidate.update({
          where: { id: candidateId },
          data: { walletBalance: { decrement: totalAmount } },
        });
      }

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
          paymentMethod: payload.paymentMethod || 'bKash',
          transactionId: payload.trxId || payload.transactionId || null,
          statusHistory: [
            {
              status: 'PENDING',
              timestamp: new Date().toISOString(),
              note: isWalletPayment 
                ? 'আবেদন ফি ওয়ালেট থেকে সফলভাবে পরিশোধ হয়েছে। অপারেটর কিউতে প্রেরণ করা হয়েছে।' 
                : `আবেদন জমা হয়েছে (${payload.paymentMethod || 'মোবাইল ব্যাংকিং'} TrxID: ${payload.trxId || 'N/A'})। ভেরিফিকেশনের পর প্রসেস শুরু হবে।`,
            },
          ],
        },
      });

      // 3. Create Transaction Record
      await tx.walletTransaction.create({
        data: {
          id: `TRX-${Date.now()}`,
          candidateId,
          amount: totalAmount,
          type: TransactionType.APPLICATION_FEE,
          method: payload.paymentMethod || (isWalletPayment ? 'wallet' : 'bKash'),
          status: isWalletPayment ? TransactionStatus.COMPLETED : TransactionStatus.PENDING,
          trxId: payload.trxId || payload.transactionId || `TRX-${Date.now()}`,
          description: `${postName} পদে আবেদন ফি (${payload.paymentMethod || 'মোবাইল ব্যাংকিং'}) (ট্র্যাকিং: ${trackingNumber})`,
          referenceId: applicationId,
        },
      });

      // 4. Create Notification
      await tx.notificationItem.create({
        data: {
          id: `NOTIF-${Date.now()}`,
          candidateId,
          title: 'আবেদন গৃহীত হয়েছে',
          message: `${job.organization}-এর "${postName}" পদে আপনার আবেদন সফলভাবে জমা হয়েছে। ট্র্যাকিং নং: ${trackingNumber}`,
          type: 'success',
          actionUrl: `/dashboard/applications`,
        },
      });

      return application;
    });

    return {
      ...result,
      totalAmount,
      postName,
      jobTitle: job.title,
      organization: job.organization,
    };
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
