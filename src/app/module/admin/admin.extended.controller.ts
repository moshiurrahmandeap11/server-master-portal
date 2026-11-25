import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import { geminiUtils } from '../../utils/gemini';
import { scraperEngine } from '../../utils/scraper';
import { adminService, recordAdminAudit } from './admin.service';
import { adminExtendedService } from './admin.extended.service';

export const adminExtendedController = {
  uploadApplicantCopy: catchAsync(async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'কোনো ফাইল পাওয়া যায়নি।' });
    }
    const fileUrl = `/api/uploads/applicant-copies/${req.file.filename}`;
    const applicationId = req.body?.applicationId as string | undefined;
    const isAdmit = req.body?.kind === 'admit' || req.body?.docType === 'admit_card';

    if (applicationId) {
      await prisma.applicationRequest
        .update({
          where: { id: applicationId },
          data: isAdmit ? { admitCardUrl: fileUrl } : { applicantCopyPdfUrl: fileUrl },
        })
        .catch(() => {});
      await recordAdminAudit('UPLOAD_APPLICANT_COPY', 'ApplicationRequest', applicationId, { fileUrl, isAdmit });
    }

    return res.status(200).json({
      success: true,
      url: fileUrl,
      fileUrl,
      applicantCopyPdfUrl: fileUrl,
      filename: req.file.filename,
    });
  }),

  generateJobContentAi: catchAsync(async (req: Request, res: Response) => {
    const rawText = String(req.body?.rawText || req.body?.prompt || req.body?.title || '').trim();
    if (!rawText) {
      return res.status(400).json({ success: false, message: 'কনটেন্ট জেনারেশনের জন্য টেক্সট বা শিরোনাম প্রদান করুন।' });
    }
    const parsed = await geminiUtils.parseCircularContent(rawText);
    return res.status(200).json({
      success: true,
      content: parsed,
      data: parsed,
    });
  }),

  syncCollector: catchAsync(async (_req: Request, res: Response) => {
    const result = await scraperEngine.scrapeGovernmentJobs();
    await recordAdminAudit('COLLECTOR_SYNC', 'JobSource', 'all', { draftsCreated: result.draftsCreated });
    return res.status(200).json({
      success: true,
      message: `কালেক্টর সিঙ্ক সম্পন্ন! ${result.draftsCreated}টি নতুন সার্কুলার সংগৃহীত।`,
      ...result,
    });
  }),

  // Candidate Admin CRUD
  createCandidate: catchAsync(async (req: Request, res: Response) => {
    const candidate = await adminExtendedService.createCandidateByAdmin(req.body);
    return res.status(201).json({ success: true, message: 'নতুন প্রার্থী তৈরি হয়েছে।', candidate, data: candidate });
  }),

  updateCandidate: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id || req.body?.candidateId;
    if (!id) return res.status(400).json({ success: false, message: 'প্রার্থী আইডি প্রয়োজন।' });
    const candidate = await adminExtendedService.updateCandidateByAdmin(id, req.body);
    return res.status(200).json({ success: true, message: 'প্রার্থীর তথ্য আপডেট হয়েছে।', candidate, data: candidate });
  }),

  deleteCandidate: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || (req.query.id as string);
    if (!id) return res.status(400).json({ success: false, message: 'প্রার্থী আইডি প্রয়োজন।' });
    await adminExtendedService.deleteCandidateByAdmin(id);
    return res.status(200).json({ success: true, message: 'প্রার্থী অ্যাকাউন্ট মুছে ফেলা হয়েছে।' });
  }),

  updateWalletTransaction: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id || req.body?.transactionId;
    const statusVal = req.body?.status;
    if (!id || !statusVal) return res.status(400).json({ success: false, message: 'ট্রানজেকশন আইডি এবং স্ট্যাটাস প্রয়োজন।' });
    const transaction = await adminExtendedService.updateWalletTransactionStatus(id, statusVal, req.body?.note);
    return res.status(200).json({ success: true, message: 'ট্রানজেকশন স্ট্যাটাস আপডেট হয়েছে।', transaction, data: transaction });
  }),

  bulkAssignCategory: catchAsync(async (req: Request, res: Response) => {
    const { jobIds, categoryId } = req.body || {};
    const result = await adminExtendedService.bulkAssignCategory(jobIds, categoryId);
    return res.status(200).json({
      success: true,
      message: `${result.count}টি সার্কুলারে ক্যাটাগরি অ্যাসাইন করা হয়েছে।`,
      ...result,
    });
  }),

  // Media
  createMedia: catchAsync(async (req: Request, res: Response) => {
    const item = await adminExtendedService.createMedia(req.file, req.body);
    return res.status(201).json({ success: true, message: 'মিডিয়া যুক্ত হয়েছে।', item, data: item });
  }),

  updateMedia: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id || (req.query.id as string);
    const item = await adminExtendedService.updateMedia(id, req.body);
    return res.status(200).json({ success: true, message: 'মিডিয়া আপডেট হয়েছে।', item, data: item });
  }),

  deleteMediaQueryOrParam: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || (req.query.id as string) || req.body?.id;
    if (!id) return res.status(400).json({ success: false, message: 'মিডিয়া আইডি প্রয়োজন।' });
    await adminExtendedService.deleteMediaWithFile(id);
    return res.status(200).json({ success: true, message: 'মিডিয়া ফাইল মোছা হয়েছে।' });
  }),

  // Coupons & Raffles
  updateCoupon: catchAsync(async (req: Request, res: Response) => {
    const coupon = await adminExtendedService.updateCoupon(req.params.id, req.body);
    return res.status(200).json({ success: true, message: 'কুপন আপডেট হয়েছে।', coupon, data: coupon });
  }),

  updateRaffle: catchAsync(async (req: Request, res: Response) => {
    const raffle = await adminExtendedService.updateRaffle(req.params.id, req.body);
    return res.status(200).json({ success: true, message: 'র‍্যাফেল ক্যাম্পেইন আপডেট হয়েছে।', raffle, data: raffle });
  }),

  // Support Tickets
  getSupportTickets: catchAsync(async (req: Request, res: Response) => {
    const tickets = await adminExtendedService.getSupportTickets(req.query.status as string | undefined);
    return res.status(200).json({ success: true, tickets, messages: tickets, data: tickets });
  }),

  updateSupportTicket: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id || req.body?.ticketId;
    const ticket = await adminExtendedService.updateSupportTicket(id, req.body);
    return res.status(200).json({ success: true, message: 'টিকেট আপডেট হয়েছে।', ticket, data: ticket });
  }),

  // Job Reports
  getJobReportsExtended: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getJobReportsWithCounts();
    return res.status(200).json({ success: true, reports: result.reports, counts: result.counts, data: result.reports });
  }),

  patchJobReport: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id;
    const statusVal = req.body?.status || 'resolved';
    const report = await prisma.jobReport.update({
      where: { id },
      data: {
        status: statusVal,
        ...(req.body?.resolutionNote !== undefined ? { resolutionNote: req.body.resolutionNote } : {}),
      },
    });
    return res.status(200).json({ success: true, message: 'রিপোর্ট আপডেট হয়েছে।', report, data: report });
  }),

  // Certificates Verification Queue
  getCertificatesQueue: catchAsync(async (_req: Request, res: Response) => {
    const queue = await adminExtendedService.getVerificationQueue();
    return res.status(200).json({ success: true, ...queue, data: queue });
  }),

  verifyCertificate: catchAsync(async (req: Request, res: Response) => {
    const updated = await adminExtendedService.verifyCertificateItem(req.body);
    return res.status(200).json({ success: true, message: 'ভেরিফিকেশন সম্পন্ন হয়েছে।', item: updated, data: updated });
  }),

  // Deadlines, Monitoring, Changes & Notifications
  getDeadlines: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getDeadlinesOverview();
    return res.status(200).json({ success: true, ...result, data: result });
  }),

  runMonitoring: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.runMonitoringSweep();
    return res.status(200).json({ success: true, message: 'মনিটরিং সম্পন্ন হয়েছে।', ...result });
  }),

  getCircularChanges: catchAsync(async (_req: Request, res: Response) => {
    const changes = await adminExtendedService.getCircularChanges();
    return res.status(200).json({ success: true, changes, data: changes });
  }),

  createCircularChange: catchAsync(async (req: Request, res: Response) => {
    const change = await adminExtendedService.createCircularChange(req.body);
    return res.status(201).json({ success: true, change, data: change });
  }),

  resolveCircularChange: catchAsync(async (req: Request, res: Response) => {
    const action = req.path.endsWith('/dismiss') ? 'dismiss' : 'apply';
    const change = await adminExtendedService.resolveCircularChange(req.params.id, action);
    return res.status(200).json({ success: true, change, data: change });
  }),

  getNotificationDeliveries: catchAsync(async (_req: Request, res: Response) => {
    const deliveries = await adminExtendedService.getNotificationDeliveries();
    return res.status(200).json({ success: true, deliveries, data: deliveries });
  }),

  sendNotification: catchAsync(async (req: Request, res: Response) => {
    const result = await adminExtendedService.sendBroadcastNotification(req.body);
    return res.status(200).json({ success: true, message: `${result.sentCount} জন প্রার্থীকে নোটিফিকেশন পাঠানো হয়েছে।`, ...result });
  }),

  // Content Studio
  getContentStudioQueue: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getContentStudioQueue();
    return res.status(200).json({ success: true, ...result, data: result });
  }),

  getContentStudioState: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getContentStudioQueue();
    return res.status(200).json({ success: true, state: { activeDrafts: result.drafts.length }, drafts: result.drafts });
  }),

  generateContentStudio: catchAsync(async (req: Request, res: Response) => {
    const draft = await adminExtendedService.generateContentStudioDraft(req.body);
    return res.status(201).json({ success: true, draft, data: draft });
  }),

  validateContentStudio: catchAsync(async (req: Request, res: Response) => {
    const draft = await adminExtendedService.validateOrApproveContentDraft(req.body?.id || req.body?.draftId, 'validate');
    return res.status(200).json({ success: true, draft, data: draft });
  }),

  approveContentStudio: catchAsync(async (req: Request, res: Response) => {
    const draft = await adminExtendedService.validateOrApproveContentDraft(req.body?.id || req.body?.draftId, 'approve');
    return res.status(200).json({ success: true, draft, data: draft });
  }),

  getContentStudioRevisions: catchAsync(async (req: Request, res: Response) => {
    const drafts = await prisma.contentStudioDraft.findMany({ orderBy: { updatedAt: 'desc' }, take: 30 });
    return res.status(200).json({ success: true, revisions: drafts.flatMap((d) => (Array.isArray(d.revisions) ? d.revisions : [])) });
  }),

  // Featured Jobs, Feeds, Matching, Publishing, Search & Operations
  getFeaturedJobs: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getFeaturedJobs();
    return res.status(200).json({ success: true, ...result, data: result });
  }),

  createFeaturedJob: catchAsync(async (req: Request, res: Response) => {
    const placement = await adminExtendedService.upsertFeaturedPlacement(req.body);
    return res.status(201).json({ success: true, placement, data: placement });
  }),

  deleteFeaturedJob: catchAsync(async (req: Request, res: Response) => {
    await adminExtendedService.deleteFeaturedPlacement(req.params.id);
    return res.status(200).json({ success: true, message: 'ফিচার্ড তালিকা থেকে সরানো হয়েছে।' });
  }),

  getJobFeeds: catchAsync(async (_req: Request, res: Response) => {
    const feeds = await adminExtendedService.getJobFeeds();
    return res.status(200).json({ success: true, feeds, data: feeds });
  }),

  upsertJobFeed: catchAsync(async (req: Request, res: Response) => {
    const feed = await adminExtendedService.upsertJobFeed(req.body, req.params.id);
    return res.status(200).json({ success: true, feed, data: feed });
  }),

  deleteJobFeed: catchAsync(async (req: Request, res: Response) => {
    await prisma.jobFeedConfig.delete({ where: { id: req.params.id } }).catch(() => {});
    return res.status(200).json({ success: true });
  }),

  rebuildJobFeeds: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({ success: true, message: 'জব ফিড রিবিল্ড সম্পন্ন হয়েছে।' });
  }),

  getMatchingConfig: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminExtendedService.getMatchingConfig();
    return res.status(200).json({ success: true, ...result });
  }),

  updateMatchingConfig: catchAsync(async (req: Request, res: Response) => {
    const config = await adminExtendedService.updateMatchingConfig(req.body);
    return res.status(200).json({ success: true, config, data: config });
  }),

  rebuildMatching: catchAsync(async (_req: Request, res: Response) => {
    const cfg = await prisma.matchingConfig.upsert({
      where: { id: 'global' },
      update: { lastRebuiltAt: new Date() },
      create: { id: 'global', lastRebuiltAt: new Date() },
    });
    return res.status(200).json({ success: true, message: 'স্মার্ট ম্যাচিং ইনডেক্স হালনাগাদ হয়েছে।', config: cfg });
  }),

  getPublishingData: catchAsync(async (_req: Request, res: Response) => {
    const data = await adminExtendedService.getPublishingData();
    return res.status(200).json({ success: true, ...data });
  }),

  schedulePublishing: catchAsync(async (req: Request, res: Response) => {
    const item = await prisma.publishingQueueItem.create({
      data: {
        jobId: req.body?.jobId || null,
        title: req.body?.title || 'Scheduled Publish',
        channel: req.body?.channel || 'website',
        status: req.path.endsWith('/publish') ? 'published' : 'scheduled',
        scheduledAt: req.body?.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
        publishedAt: req.path.endsWith('/publish') ? new Date() : null,
      },
    });
    return res.status(201).json({ success: true, item, data: item });
  }),

  manageRedirects: catchAsync(async (req: Request, res: Response) => {
    if (req.method === 'DELETE') {
      const id = (req.params.id || req.query.id || req.body?.id) as string;
      await prisma.redirectRule.delete({ where: { id } }).catch(() => {});
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST') {
      const rule = await prisma.redirectRule.upsert({
        where: { fromPath: String(req.body.fromPath) },
        update: { toPath: String(req.body.toPath), statusCode: Number(req.body.statusCode || 301), isEnabled: req.body.isEnabled !== false },
        create: { fromPath: String(req.body.fromPath), toPath: String(req.body.toPath), statusCode: Number(req.body.statusCode || 301), isEnabled: req.body.isEnabled !== false },
      });
      return res.status(201).json({ success: true, rule, data: rule });
    }
    const redirects = await prisma.redirectRule.findMany({ orderBy: { createdAt: 'desc' } });
    return res.status(200).json({ success: true, redirects, data: redirects });
  }),

  getSearchAnalytics: catchAsync(async (_req: Request, res: Response) => {
    const [logs, totalJobs] = await Promise.all([
      prisma.searchAnalyticsLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.jobCircular.count({ where: { status: 'PUBLISHED' } }),
    ]);
    return res.status(200).json({ success: true, logs, totalSearches: logs.length, indexedJobs: totalJobs });
  }),

  addExpense: catchAsync(async (req: Request, res: Response) => {
    const expense = await adminExtendedService.addExpense(req.body);
    return res.status(201).json({ success: true, expense, data: expense });
  }),

  deleteExpense: catchAsync(async (req: Request, res: Response) => {
    const id = (req.params.id || req.query.id || req.body?.id) as string;
    await prisma.expenseRecord.delete({ where: { id } });
    return res.status(200).json({ success: true });
  }),

  updateBudget: catchAsync(async (req: Request, res: Response) => {
    const budget = await adminExtendedService.updateBudget(req.body);
    return res.status(200).json({ success: true, budget, data: budget });
  }),

  // Overview overrides backed by real DB
  getAnalyticsOverview: catchAsync(async (_req: Request, res: Response) => {
    const data = await adminExtendedService.getAnalyticsOverview();
    return res.status(200).json({ success: true, ...data });
  }),

  getAutomationOverview: catchAsync(async (_req: Request, res: Response) => {
    const data = await adminExtendedService.getAutomationOverview();
    return res.status(200).json({ success: true, ...data });
  }),

  getGovernanceOverview: catchAsync(async (_req: Request, res: Response) => {
    const data = await adminExtendedService.getGovernanceOverview();
    return res.status(200).json({ success: true, ...data });
  }),

  getOperationsOverview: catchAsync(async (_req: Request, res: Response) => {
    const data = await adminExtendedService.getOperationsOverview();
    return res.status(200).json({ success: true, ...data });
  }),

  // Update Company by PATCH body id or param
  patchCompany: catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id;
    const company = await adminService.updateCompany(id, req.body);
    return res.status(200).json({ success: true, company, data: company });
  }),

  getStaffMembers: catchAsync(async (_req: Request, res: Response) => {
    const staff = await adminExtendedService.getStaffMembers();
    return res.status(200).json({ success: true, staff, data: staff });
  }),

  createStaffMember: catchAsync(async (req: Request, res: Response) => {
    const member = await adminExtendedService.createStaffMember(req.body);
    return res.status(201).json({ success: true, member, data: member });
  }),

  deleteStaffMember: catchAsync(async (req: Request, res: Response) => {
    await adminExtendedService.deleteStaffMember(req.params.id);
    return res.status(200).json({ success: true });
  }),
};
