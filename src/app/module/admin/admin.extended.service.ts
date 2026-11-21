import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { env } from '../../config/env';
import { bcryptUtils } from '../../utils/bcrypt';
import { geminiUtils } from '../../utils/gemini';
import { JobStatus, TransactionStatus, TransactionType, UserRole, UserStatus } from '../../../generated/prisma';
import { adminService, recordAdminAudit } from './admin.service';

export const adminExtendedService = {
  // 1. Real Analytics / Automation / Governance / Operations Overviews
  getAnalyticsOverview: async () => {
    const [totalJobs, totalApps, totalCandidates, totalViewsAgg, topSearches, recentApps] = await Promise.all([
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED } }),
      prisma.applicationRequest.count(),
      prisma.candidate.count(),
      prisma.jobCircular.aggregate({ _sum: { viewsCount: true } }),
      prisma.searchAnalyticsLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.applicationRequest.groupBy({ by: ['status'], _count: { id: true } }),
    ]);

    const totalViews = totalViewsAgg._sum.viewsCount || 0;
    const conversionRate = totalViews > 0 ? Number(((totalApps / totalViews) * 100).toFixed(2)) : 0;

    return {
      metrics: {
        totalViews,
        totalPublishedJobs: totalJobs,
        totalCandidates,
        totalApplications: totalApps,
        applicationConversionRate: conversionRate,
        uniqueVisitors: totalCandidates,
      },
      statusBreakdown: recentApps.map((r) => ({ status: r.status, count: r._count.id })),
      recentSearches: topSearches,
    };
  },

  getAutomationOverview: async () => {
    const [sources, draftsCount, runsCount, alertRulesCount] = await Promise.all([
      prisma.jobSource.findMany({ orderBy: { updatedAt: 'desc' } }),
      prisma.circularDraft.count({ where: { status: 'draft' } }),
      prisma.spiderRunRecord.count(),
      prisma.deadlineAlertRule.count({ where: { isEnabled: true } }),
    ]);

    return {
      status: 'active',
      activeRulesCount: alertRulesCount,
      totalSources: sources.length,
      activeSources: sources.filter((s) => s.isEnabled).length,
      pendingDrafts: draftsCount,
      totalRuns: runsCount,
      rules: sources.map((s) => ({
        id: s.id,
        name: s.name,
        frequency: s.frequency,
        healthStatus: s.healthStatus,
        isEnabled: s.isEnabled,
        lastRunAt: s.lastRunAt,
      })),
    };
  },

  getGovernanceOverview: async () => {
    const [pendingReports, openTickets, unverifiedDocs, auditLogsCount, expiredOpenJobs] = await Promise.all([
      prisma.jobReport.count({ where: { status: 'pending' } }),
      prisma.contactMessage.count({ where: { status: { in: ['unread', 'open', 'pending'] } } }),
      prisma.candidateDocument.count({ where: { verificationStatus: 'pending' } }),
      prisma.adminAuditLog.count(),
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED, deadline: { lt: new Date() } } }),
    ]);

    const deduction = Math.min(25, pendingReports * 2 + expiredOpenJobs * 3);
    return {
      complianceScore: Math.max(70, 100 - deduction),
      pendingAudits: pendingReports + expiredOpenJobs,
      openTickets,
      unverifiedDocs,
      auditLogsCount,
      activePolicyVersion: 'v2.5.0',
    };
  },

  getOperationsOverview: async () => {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [expenses, budgetRow, mediaAgg, appCalls24h, searchCalls24h] = await Promise.all([
      prisma.expenseRecord.findMany({ orderBy: { incurredAt: 'desc' }, take: 50 }),
      prisma.operationBudget.findUnique({ where: { id: 'global' } }),
      prisma.mediaItem.aggregate({ _sum: { fileSize: true }, _count: { id: true } }),
      prisma.applicationRequest.count({ where: { submittedAt: { gte: new Date(Date.now() - 86400000) } } }),
      prisma.searchAnalyticsLog.count({ where: { createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    ]);

    const budget = budgetRow || (await prisma.operationBudget.create({ data: { id: 'global' } }));
    const totalSpent = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const allocated = Number(budget.monthlyBudget || 100000);

    return {
      expenses: expenses.map((e) => ({ ...e, amount: Number(e.amount) })),
      budget: {
        allocated,
        spent: totalSpent,
        remaining: Math.max(0, allocated - totalSpent),
        marketingCap: Number(budget.marketingCap || 25000),
        infraCap: Number(budget.infraCap || 30000),
        currency: 'BDT',
      },
      usage: {
        apiCalls24h: appCalls24h + searchCalls24h,
        mediaCount: mediaAgg._count.id,
        storageMb: Number(((mediaAgg._sum.fileSize || 0) / (1024 * 1024)).toFixed(2)),
      },
    };
  },

  // 2. Candidate Admin CRUD
  createCandidateByAdmin: async (data: any) => {
    const email = String(data.email || '').trim().toLowerCase();
    const name = String(data.name || '').trim();
    if (!email || !name) {
      throw new AppError(status.BAD_REQUEST, 'নাম এবং ইমেইল প্রদান করা আবশ্যক।');
    }
    const existing = await prisma.candidate.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(status.CONFLICT, 'এই ইমেইলে ইতিমধ্যে একটি অ্যাকাউন্ট রয়েছে।');
    }
    const rawPass = String(data.password || crypto.randomBytes(8).toString('hex'));
    const passwordHash = await bcryptUtils.hashPassword(rawPass);
    const username = (data.username || `usr_${email.split('@')[0]}_${Math.floor(1000 + Math.random() * 9000)}`).toLowerCase();

    const created = await prisma.candidate.create({
      data: {
        email,
        username,
        name,
        nameBn: data.nameBn || null,
        phone: data.phone || null,
        passwordHash,
        role: data.role === 'OPERATOR' ? UserRole.OPERATOR : data.role === 'ADMIN' ? UserRole.ADMIN : UserRole.CANDIDATE,
        status: UserStatus.ACTIVE,
        isEmailVerified: data.isEmailVerified !== false,
        isVerified: Boolean(data.isVerified),
        walletBalance: Number(data.walletBalance || 0),
        district: data.district || 'ঢাকা',
        division: data.division || 'ঢাকা',
        adminNote: data.adminNote || null,
      },
    });
    await recordAdminAudit('CREATE_CANDIDATE', 'Candidate', created.id, { email });
    const { passwordHash: _, ...safe } = created;
    return { ...safe, walletBalance: Number(safe.walletBalance) };
  },

  updateCandidateByAdmin: async (candidateId: string, data: any) => {
    const existing = await prisma.candidate.findUnique({ where: { id: candidateId } });
    if (!existing) throw new AppError(status.NOT_FOUND, 'প্রার্থী খুঁজে পাওয়া যায়নি।');

    const updateData: any = {};
    for (const k of ['name', 'nameBn', 'phone', 'district', 'division', 'adminNote', 'isEmailVerified', 'isVerified', 'role', 'status']) {
      if (data[k] !== undefined) updateData[k] = data[k];
    }

    if (data.newPassword && String(data.newPassword).length >= 6) {
      updateData.passwordHash = await bcryptUtils.hashPassword(String(data.newPassword));
    }

    const walletDelta = Number(data.walletAdjustment ?? 0);
    const result = await prisma.$transaction(async (tx) => {
      if (Number.isFinite(walletDelta) && walletDelta !== 0) {
        updateData.walletBalance = Math.max(0, Number(existing.walletBalance) + walletDelta);
        await tx.walletTransaction.create({
          data: {
            id: `TRX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            candidateId,
            amount: Math.abs(walletDelta),
            type: TransactionType.ADJUSTMENT,
            method: 'admin_adjustment',
            trxId: `ADJ-${Date.now()}`,
            status: TransactionStatus.COMPLETED,
            description: data.walletNote || `অ্যাডমিন কর্তৃক ওয়ালেট সমন্বয় (${walletDelta > 0 ? '+' : ''}৳${walletDelta})`,
          },
        });
      }

      return await tx.candidate.update({
        where: { id: candidateId },
        data: updateData,
      });
    });

    await recordAdminAudit('UPDATE_CANDIDATE', 'Candidate', candidateId, { fields: Object.keys(updateData), walletDelta });
    const { passwordHash: _, ...safe } = result;
    return { ...safe, walletBalance: Number(safe.walletBalance) };
  },

  deleteCandidateByAdmin: async (candidateId: string) => {
    if (candidateId === 'ADMIN-SUPER') {
      throw new AppError(status.FORBIDDEN, 'সুপার অ্যাডমিন অ্যাকাউন্ট মোছা যাবে না।');
    }
    await prisma.candidate.delete({ where: { id: candidateId } });
    await recordAdminAudit('DELETE_CANDIDATE', 'Candidate', candidateId);
    return { success: true };
  },

  // 3. Wallet Transaction Approval / Rejection
  updateWalletTransactionStatus: async (trxId: string, newStatusRaw: string, note?: string) => {
    const txRow = await prisma.walletTransaction.findUnique({ where: { id: trxId } });
    if (!txRow) throw new AppError(status.NOT_FOUND, 'ট্রানজেকশন খুঁজে পাওয়া যায়নি।');

    const upper = String(newStatusRaw || '').toUpperCase();
    const targetStatus: TransactionStatus =
      upper === 'COMPLETED' || upper === 'APPROVED'
        ? TransactionStatus.COMPLETED
        : upper === 'FAILED' || upper === 'REJECTED'
        ? TransactionStatus.FAILED
        : TransactionStatus.PENDING;

    const updated = await prisma.$transaction(async (tx) => {
      if (txRow.type === TransactionType.RECHARGE && txRow.status === TransactionStatus.PENDING && targetStatus === TransactionStatus.COMPLETED) {
        const amt = Number(txRow.amount);
        await tx.candidate.update({
          where: { id: txRow.candidateId },
          data: { walletBalance: { increment: amt } },
        });
        await tx.notificationItem.create({
          data: {
            id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            candidateId: txRow.candidateId,
            title: 'ওয়ালেট রিচার্জ অনুমোদিত',
            message: `আপনার ৳${amt} রিচার্জ অনুরোধ যাচাই করে ওয়ালেটে যোগ করা হয়েছে।`,
            type: 'success',
            actionUrl: '/dashboard/wallet',
          },
        });
      } else if (txRow.status === TransactionStatus.PENDING && targetStatus === TransactionStatus.FAILED) {
        await tx.notificationItem.create({
          data: {
            id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
            candidateId: txRow.candidateId,
            title: 'ওয়ালেট রিচার্জ বাতিল',
            message: note || `আপনার TrxID (${txRow.trxId || txRow.id}) যাচাই করা যায়নি।`,
            type: 'warning',
            actionUrl: '/dashboard/wallet',
          },
        });
      }

      return await tx.walletTransaction.update({
        where: { id: trxId },
        data: {
          status: targetStatus,
          ...(note ? { description: `${txRow.description || ''} | ${note}` } : {}),
        },
      });
    });

    await recordAdminAudit('UPDATE_WALLET_TRANSACTION', 'WalletTransaction', trxId, { targetStatus, note });
    return updated;
  },

  // 4. Categories Bulk Assign
  bulkAssignCategory: async (jobIds: string[], categoryId: string) => {
    if (!Array.isArray(jobIds) || jobIds.length === 0 || !categoryId) {
      throw new AppError(status.BAD_REQUEST, 'চাকরি আইডি তালিকা এবং ক্যাটাগরি আইডি আবশ্যক।');
    }
    const cat = await prisma.category.findFirst({
      where: { OR: [{ id: categoryId }, { slug: categoryId }] },
    });
    if (!cat) throw new AppError(status.NOT_FOUND, 'ক্যাটাগরি পাওয়া যায়নি।');

    const res = await prisma.jobCircular.updateMany({
      where: { id: { in: jobIds } },
      data: { categoryId: cat.id },
    });
    await recordAdminAudit('BULK_ASSIGN_CATEGORY', 'Category', cat.id, { count: res.count });
    return { count: res.count, categoryId: cat.id };
  },

  // 5. Media Create / Update / Delete
  createMedia: async (file: Express.Multer.File | undefined, body: any) => {
    const filename = file?.filename || body.filename || `media-${Date.now()}`;
    const fileUrl = file ? `/api/uploads/media/${file.filename}` : String(body.fileUrl || '');
    if (!fileUrl) throw new AppError(status.BAD_REQUEST, 'ফাইল অথবা ফাইল ইউআরএল প্রদান করুন।');

    const created = await prisma.mediaItem.create({
      data: {
        filename,
        originalName: file?.originalname || body.originalName || filename,
        fileUrl,
        fileSize: file?.size || (body.fileSize ? Number(body.fileSize) : null),
        mimeType: file?.mimetype || body.mimeType || 'image/jpeg',
        altText: body.altText || null,
        caption: body.caption || null,
        category: body.category || 'general',
        dimensions: body.dimensions || undefined,
      },
    });
    await recordAdminAudit('CREATE_MEDIA', 'MediaItem', created.id);
    return created;
  },

  updateMedia: async (id: string, body: any) => {
    const allowed: any = {};
    for (const k of ['altText', 'caption', 'category', 'filename']) {
      if (body[k] !== undefined) allowed[k] = body[k];
    }
    return await prisma.mediaItem.update({ where: { id }, data: allowed });
  },

  deleteMediaWithFile: async (id: string) => {
    const item = await prisma.mediaItem.findUnique({ where: { id } });
    if (item?.fileUrl?.includes('/uploads/media/')) {
      const diskPath = path.join(env.CHAKRI_UPLOAD_DIR, 'media', path.basename(item.fileUrl));
      if (fs.existsSync(diskPath)) fs.unlinkSync(diskPath);
    }
    await prisma.mediaItem.delete({ where: { id } });
    await recordAdminAudit('DELETE_MEDIA', 'MediaItem', id);
    return { success: true };
  },

  // 6. Coupons & Raffles Update
  updateCoupon: async (id: string, data: any) => {
    const allowed: any = {};
    if (data.status !== undefined) allowed.status = data.status;
    if (data.discountValue !== undefined) allowed.discountValue = Number(data.discountValue);
    if (data.discountType !== undefined) allowed.discountType = data.discountType;
    if (data.maxDiscount !== undefined) allowed.maxDiscount = data.maxDiscount ? Number(data.maxDiscount) : null;
    if (data.minSpend !== undefined) allowed.minSpend = data.minSpend ? Number(data.minSpend) : null;
    if (data.usageLimit !== undefined) allowed.usageLimit = data.usageLimit ? Number(data.usageLimit) : null;
    if (data.expiresAt !== undefined) allowed.expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
    if (data.stackable !== undefined) allowed.stackable = Boolean(data.stackable);
    return await prisma.coupon.update({ where: { id }, data: allowed });
  },

  updateRaffle: async (id: string, data: any) => {
    const allowed: any = {};
    for (const k of ['title', 'description', 'prizeDescription', 'status', 'winnerId']) {
      if (data[k] !== undefined) allowed[k] = data[k];
    }
    if (data.rewardAmount !== undefined) allowed.rewardAmount = Number(data.rewardAmount);
    if (data.endsAt !== undefined) allowed.endsAt = data.endsAt ? new Date(data.endsAt) : null;
    return await prisma.raffleCampaign.update({ where: { id }, data: allowed });
  },

  // 7. Support Tickets & Job Reports
  getSupportTickets: async (statusFilter?: string) => {
    return await prisma.contactMessage.findMany({
      where: statusFilter && statusFilter !== 'all' ? { status: statusFilter } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  updateSupportTicket: async (id: string, data: any) => {
    const allowed: any = {};
    if (data.status !== undefined) allowed.status = data.status;
    if (data.replyNotes !== undefined || data.notes !== undefined) {
      allowed.replyNotes = data.replyNotes ?? data.notes;
    }
    const updated = await prisma.contactMessage.update({ where: { id }, data: allowed });
    await recordAdminAudit('UPDATE_SUPPORT_TICKET', 'ContactMessage', id, allowed);
    return updated;
  },

  getJobReportsWithCounts: async () => {
    const reports = await prisma.jobReport.findMany({ orderBy: { createdAt: 'desc' } });
    const counts = {
      total: reports.length,
      pending: reports.filter((r) => r.status === 'pending').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
      dismissed: reports.filter((r) => r.status === 'dismissed').length,
    };
    return { reports, counts };
  },

  // 8. Certificates & Education Verification Queue
  getVerificationQueue: async () => {
    const [documents, educations] = await Promise.all([
      prisma.candidateDocument.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          candidate: { select: { id: true, name: true, nameBn: true, email: true, phone: true } },
        },
      }),
      prisma.educationRecord.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          candidate: { select: { id: true, name: true, nameBn: true, email: true, phone: true } },
        },
      }),
    ]);

    return {
      documents: documents.map((d) => ({
        ...d,
        itemType: 'document',
        status: d.verificationStatus || (d.isVerified ? 'verified' : 'pending'),
      })),
      educations: educations.map((e) => ({
        ...e,
        itemType: 'education',
        status: e.verificationStatus || 'pending',
      })),
    };
  },

  verifyCertificateItem: async (payload: {
    id: string;
    itemType?: 'document' | 'education';
    status: string;
    remarks?: string;
  }) => {
    const itemType = payload.itemType || 'document';
    const vStatus = payload.status === 'approved' || payload.status === 'verified' ? 'verified' : payload.status === 'rejected' ? 'rejected' : 'pending';
    const isVerified = vStatus === 'verified';

    if (itemType === 'education') {
      const updated = await prisma.educationRecord.update({
        where: { id: payload.id },
        data: { verificationStatus: vStatus, verificationRemarks: payload.remarks || null },
      });
      await recordAdminAudit('VERIFY_EDUCATION', 'EducationRecord', payload.id, { vStatus });
      return updated;
    }

    const updated = await prisma.candidateDocument.update({
      where: { id: payload.id },
      data: {
        isVerified,
        verificationStatus: vStatus,
        verificationRemarks: payload.remarks || null,
      },
    });

    await prisma.notificationItem.create({
      data: {
        id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        candidateId: updated.candidateId,
        title: isVerified ? 'ডকুমেন্ট ভেরিফাই সম্পন্ন' : 'ডকুমেন্ট ভেরিফিকেশন আপডেট',
        message: isVerified
          ? `আপনার "${updated.title}" নথিটি ভেরিফাই করা হয়েছে।`
          : `আপনার "${updated.title}" নথির অবস্থা: ${vStatus}${payload.remarks ? ` (${payload.remarks})` : ''}`,
        type: isVerified ? 'success' : 'warning',
        actionUrl: '/dashboard/vault',
      },
    }).catch(() => {});

    await recordAdminAudit('VERIFY_DOCUMENT', 'CandidateDocument', payload.id, { vStatus });
    return updated;
  },

  // 9. Deadlines, Monitoring & Circular Changes & Notification Deliveries
  getDeadlinesOverview: async () => {
    const now = new Date();
    const soon = new Date(Date.now() + 5 * 86400000);
    const [closingSoon, expiredPublished, rules] = await Promise.all([
      prisma.jobCircular.findMany({
        where: { status: JobStatus.PUBLISHED, deadline: { gte: now, lte: soon } },
        orderBy: { deadline: 'asc' },
        take: 50,
      }),
      prisma.jobCircular.findMany({
        where: { status: JobStatus.PUBLISHED, deadline: { lt: now } },
        orderBy: { deadline: 'desc' },
        take: 30,
      }),
      prisma.deadlineAlertRule.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);

    return { closingSoon, expiredPublished, rules };
  },

  runMonitoringSweep: async () => {
    const now = new Date();
    const expiredResult = await prisma.jobCircular.updateMany({
      where: { status: JobStatus.PUBLISHED, deadline: { lt: now } },
      data: { status: JobStatus.EXPIRED },
    });
    const urgentCount = await prisma.jobCircular.count({
      where: { status: JobStatus.PUBLISHED, deadline: { gte: now, lte: new Date(Date.now() + 2 * 86400000) } },
    });
    await recordAdminAudit('RUN_DEADLINE_MONITORING', 'JobCircular', undefined, {
      expiredClosed: expiredResult.count,
      urgentCount,
    });
    return {
      expiredClosed: expiredResult.count,
      urgentAlertsDetected: urgentCount,
      checkedAt: now.toISOString(),
    };
  },

  getCircularChanges: async () => {
    return await prisma.circularChangeProposal.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  },

  createCircularChange: async (data: any) => {
    return await prisma.circularChangeProposal.create({
      data: {
        jobId: data.jobId,
        field: data.field || 'deadline',
        oldValue: data.oldValue ?? undefined,
        newValue: data.newValue ?? undefined,
        reason: data.reason || null,
        status: 'pending',
      },
    });
  },

  resolveCircularChange: async (id: string, action: 'apply' | 'dismiss') => {
    const proposal = await prisma.circularChangeProposal.findUnique({ where: { id } });
    if (!proposal) throw new AppError(status.NOT_FOUND, 'পরিবর্তন প্রস্তাব পাওয়া যায়নি।');
    if (action === 'apply' && proposal.newValue !== null && proposal.field) {
      await adminService.updateJob(proposal.jobId, { [proposal.field]: proposal.newValue }).catch(() => {});
    }
    return await prisma.circularChangeProposal.update({
      where: { id },
      data: { status: action === 'apply' ? 'applied' : 'dismissed', reviewedBy: 'ADMIN-SUPER' },
    });
  },

  getNotificationDeliveries: async () => {
    return await prisma.notificationDelivery.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  },

  sendBroadcastNotification: async (payload: { title: string; message: string; channel?: string; candidateId?: string }) => {
    const title = String(payload.title || '').trim();
    const message = String(payload.message || '').trim();
    if (!title || !message) {
      throw new AppError(status.BAD_REQUEST, 'নোটিফিকেশন শিরোনাম ও বিবরণ আবশ্যক।');
    }

    const targets = payload.candidateId
      ? await prisma.candidate.findMany({ where: { id: payload.candidateId }, select: { id: true, email: true } })
      : await prisma.candidate.findMany({ where: { status: UserStatus.ACTIVE }, select: { id: true, email: true }, take: 200 });

    for (const c of targets) {
      await prisma.notificationItem.create({
        data: {
          id: `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          candidateId: c.id,
          title,
          message,
          type: 'info',
          actionUrl: '/dashboard/notifications',
        },
      });
    }

    const delivery = await prisma.notificationDelivery.create({
      data: {
        channel: payload.channel || 'in_app',
        recipient: payload.candidateId || `active_candidates (${targets.length})`,
        title,
        message,
        status: 'sent',
      },
    });

    await recordAdminAudit('SEND_NOTIFICATION', 'NotificationDelivery', delivery.id, { count: targets.length });
    return { sentCount: targets.length, delivery };
  },

  // 10. Content Studio
  getContentStudioQueue: async () => {
    const [jobs, drafts] = await Promise.all([
      prisma.jobCircular.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
      prisma.contentStudioDraft.findMany({ orderBy: { updatedAt: 'desc' }, take: 50 }),
    ]);
    return { drafts, jobsCount: jobs.length };
  },

  generateContentStudioDraft: async (payload: { jobId?: string; rawText?: string; title?: string }) => {
    let parsed: any = null;
    if (payload.rawText) {
      parsed = await geminiUtils.parseCircularContent(payload.rawText);
    } else if (payload.jobId) {
      const job = await prisma.jobCircular.findUnique({ where: { id: payload.jobId } });
      if (job) {
        parsed = {
          title: job.titleBn || job.title,
          organization: job.organization,
          positions: job.positions,
          eligibility: job.eligibility,
          summary: `${job.organization}-এ ${job.totalPositions}টি পদে নিয়োগ বিজ্ঞপ্তি।`,
        };
      }
    }

    const created = await prisma.contentStudioDraft.create({
      data: {
        jobId: payload.jobId || null,
        title: parsed?.title || payload.title || 'নতুন সার্কুলার কনটেন্ট ড্রাফট',
        status: 'generated',
        qualityScore: parsed ? 92 : 70,
        content: parsed || { summary: payload.rawText || '' },
        revisions: [{ timestamp: new Date().toISOString(), action: 'generated', summary: 'AI Content Studio' }],
      },
    });
    return created;
  },

  validateOrApproveContentDraft: async (id: string, mode: 'validate' | 'approve') => {
    const draft = await prisma.contentStudioDraft.findUnique({ where: { id } });
    if (!draft) throw new AppError(status.NOT_FOUND, 'কনটেন্ট ড্রাফট পাওয়া যায়নি।');
    const revs = Array.isArray(draft.revisions) ? [...(draft.revisions as any[])] : [];
    revs.push({ timestamp: new Date().toISOString(), action: mode });

    return await prisma.contentStudioDraft.update({
      where: { id },
      data: {
        status: mode === 'approve' ? 'approved' : 'validated',
        qualityScore: mode === 'approve' ? 98 : 94,
        revisions: revs,
      },
    });
  },

  // 11. Featured Jobs, Job Feeds, Job Matching & Publishing
  getFeaturedJobs: async () => {
    const [placements, featuredCirculars] = await Promise.all([
      prisma.featuredPlacement.findMany({ orderBy: { priority: 'asc' } }),
      prisma.jobCircular.findMany({ where: { isFeatured: true }, orderBy: { updatedAt: 'desc' } }),
    ]);
    return { placements, featuredCirculars };
  },

  upsertFeaturedPlacement: async (data: any) => {
    const jobId = String(data.jobId || '');
    if (!jobId) throw new AppError(status.BAD_REQUEST, 'jobId প্রয়োজন।');
    await prisma.jobCircular.update({ where: { id: jobId }, data: { isFeatured: true } }).catch(() => {});
    return await prisma.featuredPlacement.create({
      data: {
        jobId,
        slot: data.slot || 'hero',
        priority: Number(data.priority || 0),
        isActive: data.isActive !== false,
      },
    });
  },

  deleteFeaturedPlacement: async (id: string) => {
    const existing = await prisma.featuredPlacement.findUnique({ where: { id } });
    if (existing) {
      await prisma.jobCircular.update({ where: { id: existing.jobId }, data: { isFeatured: false } }).catch(() => {});
      await prisma.featuredPlacement.delete({ where: { id } });
    } else {
      await prisma.jobCircular.update({ where: { id }, data: { isFeatured: false } }).catch(() => {});
    }
    return { success: true };
  },

  getJobFeeds: async () => {
    const configs = await prisma.jobFeedConfig.findMany({ orderBy: { orderIndex: 'asc' } });
    if (configs.length > 0) return configs;
    return [
      { id: 'feed-closing', name: 'Closing Soon', slug: 'closing-soon', feedType: 'closing-soon', isActive: true },
      { id: 'feed-today', name: "Today's Jobs", slug: 'todays-jobs', feedType: 'todays-jobs', isActive: true },
      { id: 'feed-featured', name: 'Featured Jobs', slug: 'featured-jobs', feedType: 'featured-jobs', isActive: true },
    ];
  },

  upsertJobFeed: async (data: any, id?: string) => {
    const slug = data.slug || String(data.name || 'feed').toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (id) {
      return await prisma.jobFeedConfig.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.feedType !== undefined ? { feedType: data.feedType } : {}),
          ...(data.rules !== undefined ? { rules: data.rules } : {}),
          ...(data.jobIds !== undefined ? { jobIds: data.jobIds } : {}),
          ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
        },
      });
    }
    return await prisma.jobFeedConfig.create({
      data: {
        name: data.name || slug,
        slug,
        feedType: data.feedType || 'curated',
        rules: data.rules || {},
        jobIds: data.jobIds || [],
        isActive: data.isActive !== false,
      },
    });
  },

  getMatchingConfig: async () => {
    let cfg = await prisma.matchingConfig.findUnique({ where: { id: 'global' } });
    if (!cfg) cfg = await prisma.matchingConfig.create({ data: { id: 'global' } });
    const [candidatesCount, jobsCount] = await Promise.all([
      prisma.candidate.count(),
      prisma.jobCircular.count({ where: { status: JobStatus.PUBLISHED } }),
    ]);
    return { config: cfg, health: { candidatesIndexed: candidatesCount, jobsIndexed: jobsCount, status: 'healthy' } };
  },

  updateMatchingConfig: async (data: any) => {
    const allowed: any = {};
    for (const k of ['educationWeight', 'skillsWeight', 'districtWeight', 'ageWeight', 'minScore']) {
      if (data[k] !== undefined) allowed[k] = Number(data[k]);
    }
    if (data.enableAiFallback !== undefined) allowed.enableAiFallback = Boolean(data.enableAiFallback);
    return await prisma.matchingConfig.upsert({
      where: { id: 'global' },
      update: allowed,
      create: { id: 'global', ...allowed },
    });
  },

  getPublishingData: async () => {
    const [queue, redirects, settings] = await Promise.all([
      prisma.publishingQueueItem.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.redirectRule.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      adminService.getPlatformSettings(),
    ]);
    return { queue, redirects, seo: settings.seoDefaults || {} };
  },

  addExpense: async (data: any) => {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AppError(status.BAD_REQUEST, 'খরচের সঠিক পরিমাণ দিন।');
    }
    return await prisma.expenseRecord.create({
      data: {
        title: String(data.title || 'অপারেশনাল খরচ'),
        category: String(data.category || 'operations'),
        amount,
        notes: data.notes || null,
        createdBy: 'ADMIN-SUPER',
      },
    });
  },

  updateBudget: async (data: any) => {
    const update: any = { updatedBy: 'ADMIN-SUPER' };
    if (data.monthlyBudget !== undefined) update.monthlyBudget = Number(data.monthlyBudget);
    if (data.marketingCap !== undefined) update.marketingCap = Number(data.marketingCap);
    if (data.infraCap !== undefined) update.infraCap = Number(data.infraCap);
    return await prisma.operationBudget.upsert({
      where: { id: 'global' },
      update,
      create: { id: 'global', ...update },
    });
  },
};
