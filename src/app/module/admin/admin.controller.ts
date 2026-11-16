import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { adminService } from './admin.service';
import { ApplicationStatus } from '../../../generated/prisma';
import { jwtUtils } from '../../utils/jwt';

export const adminController = {
  getStats: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminService.getDashboardStats();

    return res.status(200).json({
      success: true,
      message: 'অ্যাডমিন ড্যাশবোর্ড পরিসংখ্যান।',
      stats: result,
      data: result,
    });
  }),

  getCandidates: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const search = (req.query.search as string) || '';

    const result = await adminService.getAllCandidates(page, limit, search);

    return res.status(200).json({
      success: true,
      message: 'প্রার্থী তালিকা।',
      candidates: result.candidates,
      data: result.candidates,
      meta: result.meta,
    });
  }),

  getCandidateById: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.getCandidateById(req.params.id);

    return res.status(200).json({
      success: true,
      candidate: result,
      data: result,
    });
  }),

  getApplications: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 50;
    const statusFilter = req.query.status as ApplicationStatus | undefined;

    const result = await adminService.getAllApplications(page, limit, statusFilter);

    return res.status(200).json({
      success: true,
      message: 'অপারেটর আবেদন কিউ।',
      applications: result.applications,
      data: result.applications,
      meta: result.meta,
    });
  }),

  updateApplicationStatus: catchAsync(async (req: Request, res: Response) => {
    const { status: newStatus, teletalkUserId, rollNumber, applicantCopyPdfUrl, notes } = req.body;
    const result = await adminService.updateApplicationStatus(req.params.id, newStatus, {
      teletalkUserId,
      rollNumber,
      applicantCopyPdfUrl,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: 'আবেদনের স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।',
      application: result,
      data: result,
    });
  }),

  // Jobs CRUD
  getJobs: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.getAllJobs(req.query);

    return res.status(200).json({
      success: true,
      jobs: result.jobs,
      total: result.total,
      data: result.jobs,
      meta: result.meta,
    });
  }),

  createJob: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.createJob(req.body);

    return res.status(201).json({
      success: true,
      message: 'নতুন চাকরির সার্কুলার সফলভাবে তৈরি হয়েছে।',
      job: result,
      data: result,
    });
  }),

  updateJob: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.updateJob(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'চাকরির সার্কুলার সফলভাবে আপডেট করা হয়েছে।',
      job: result,
      data: result,
    });
  }),

  deleteJob: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.deleteJob(req.params.id);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  }),

  // Categories CRUD
  getCategories: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminService.getAllCategories();

    return res.status(200).json({
      success: true,
      categories: result,
      data: result,
    });
  }),

  createCategory: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.createCategory(req.body);

    return res.status(201).json({
      success: true,
      message: 'নতুন ক্যাটাগরি তৈরি হয়েছে।',
      category: result,
      data: result,
    });
  }),

  updateCategory: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.updateCategory(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'ক্যাটাগরি সফলভাবে আপডেট করা হয়েছে।',
      category: result,
      data: result,
    });
  }),

  deleteCategory: catchAsync(async (req: Request, res: Response) => {
    await adminService.deleteCategory(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'ক্যাটাগরি মোছা হয়েছে।',
    });
  }),

  // Sources & Spider
  getSources: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminService.getAllSources();

    return res.status(200).json({
      success: true,
      sources: result,
      data: result,
    });
  }),

  createSource: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.createSource(req.body);

    return res.status(201).json({
      success: true,
      source: result,
      data: result,
    });
  }),

  updateSource: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.updateSource(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      source: result,
      data: result,
    });
  }),

  deleteSource: catchAsync(async (req: Request, res: Response) => {
    await adminService.deleteSource(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'সোর্স মোছা হয়েছে।',
    });
  }),

  getSourceDrafts: catchAsync(async (_req: Request, res: Response) => {
    const drafts = await adminService.getSourceDrafts();

    return res.status(200).json({
      success: true,
      drafts,
      data: drafts,
    });
  }),

  runSourceSpider: catchAsync(async (req: Request, res: Response) => {
    const result = await adminService.runSourceSpider(req.params.id || req.body?.id);

    return res.status(200).json({
      success: true,
      message: result.message,
    });
  }),

  // Companies
  getCompanies: catchAsync(async (_req: Request, res: Response) => {
    const companies = await adminService.getAllCompanies();

    return res.status(200).json({
      success: true,
      companies,
      data: companies,
    });
  }),

  createCompany: catchAsync(async (req: Request, res: Response) => {
    const company = await adminService.createCompany(req.body);

    return res.status(201).json({
      success: true,
      company,
      data: company,
    });
  }),

  updateCompany: catchAsync(async (req: Request, res: Response) => {
    const company = await adminService.updateCompany(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      company,
      data: company,
    });
  }),

  deleteCompany: catchAsync(async (req: Request, res: Response) => {
    await adminService.deleteCompany(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'প্রতিষ্ঠান মোছা হয়েছে।',
    });
  }),

  // Coupons
  getCoupons: catchAsync(async (_req: Request, res: Response) => {
    const coupons = await adminService.getAllCoupons();

    return res.status(200).json({
      success: true,
      coupons,
      data: coupons,
    });
  }),

  createCoupon: catchAsync(async (req: Request, res: Response) => {
    const coupon = await adminService.createCoupon(req.body);

    return res.status(201).json({
      success: true,
      message: 'নতুন কুপন কোড তৈরি হয়েছে।',
      coupon,
      data: coupon,
    });
  }),

  deleteCoupon: catchAsync(async (req: Request, res: Response) => {
    await adminService.deleteCoupon(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'কুপন মোছা হয়েছে।',
    });
  }),

  // Raffles
  getRaffles: catchAsync(async (_req: Request, res: Response) => {
    const raffles = await adminService.getAllRaffles();

    return res.status(200).json({
      success: true,
      raffles,
      data: raffles,
    });
  }),

  createRaffle: catchAsync(async (req: Request, res: Response) => {
    const raffle = await adminService.createRaffle(req.body);

    return res.status(201).json({
      success: true,
      message: 'নতুন লটারি ক্যাম্পেইন তৈরি হয়েছে।',
      raffle,
      data: raffle,
    });
  }),

  // Pages
  getPages: catchAsync(async (_req: Request, res: Response) => {
    const pages = await adminService.getAllPages();

    return res.status(200).json({
      success: true,
      pages,
      data: pages,
    });
  }),

  createPage: catchAsync(async (req: Request, res: Response) => {
    const page = await adminService.createPage(req.body);

    return res.status(201).json({
      success: true,
      message: 'পেজ সংরক্ষিত হয়েছে।',
      page,
      data: page,
    });
  }),

  updatePage: catchAsync(async (req: Request, res: Response) => {
    const page = await adminService.updatePage(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      message: 'পেজ সফলভাবে আপডেট করা হয়েছে।',
      page,
      data: page,
    });
  }),

  deletePage: catchAsync(async (req: Request, res: Response) => {
    await adminService.deletePage(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'পেজ মোছা হয়েছে।',
    });
  }),

  // Media
  getMedia: catchAsync(async (_req: Request, res: Response) => {
    const media = await adminService.getAllMedia();

    return res.status(200).json({
      success: true,
      media,
      data: media,
    });
  }),

  deleteMedia: catchAsync(async (req: Request, res: Response) => {
    await adminService.deleteMedia(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'মিডিয়া ফাইল মোছা হয়েছে।',
    });
  }),

  // Settings
  getPlatformSettings: catchAsync(async (_req: Request, res: Response) => {
    const settings = await adminService.getPlatformSettings();

    return res.status(200).json({
      success: true,
      settings,
      data: settings,
    });
  }),

  updatePlatformSettings: catchAsync(async (req: Request, res: Response) => {
    const settings = await adminService.updatePlatformSettings(req.body);

    return res.status(200).json({
      success: true,
      message: 'প্ল্যাটফর্ম সেটিংস আপডেট সফল হয়েছে।',
      settings,
      data: settings,
    });
  }),

  // Impersonate
  impersonateCandidate: catchAsync(async (req: Request, res: Response) => {
    const candidateId = req.body?.candidateId || req.params.candidateId;
    const candidate = await adminService.getCandidateById(candidateId);

    const tokenPayload = {
      candidateId: candidate.id,
      email: candidate.email,
      role: candidate.role,
      phone: candidate.phone,
      name: candidate.name,
      isImpersonating: true,
    };

    const accessToken = jwtUtils.createAccessToken(tokenPayload);

    return res.status(200).json({
      success: true,
      message: `ইমপারসোনেশন সফল! আপনি এখন ${candidate.name} হিসেবে দেখছেন।`,
      candidate,
      accessToken,
    });
  }),

  stopImpersonation: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      message: 'ইমপারসোনেশন বন্ধ করা হয়েছে।',
    });
  }),

  // Wallet Transactions
  getWalletTransactions: catchAsync(async (_req: Request, res: Response) => {
    const transactions = await adminService.getWalletTransactions();

    return res.status(200).json({
      success: true,
      transactions,
      data: transactions,
    });
  }),

  // Job Reports
  getJobReports: catchAsync(async (_req: Request, res: Response) => {
    const reports = await adminService.getAllJobReports();

    return res.status(200).json({
      success: true,
      reports,
      data: reports,
    });
  }),

  updateJobReportStatus: catchAsync(async (req: Request, res: Response) => {
    const { status: reportStatus } = req.body;
    const report = await adminService.updateJobReportStatus(req.params.id, reportStatus);

    return res.status(200).json({
      success: true,
      message: 'রিপোর্ট স্ট্যাটাস আপডেট হয়েছে।',
      report,
      data: report,
    });
  }),

  // Audit Logs
  getAuditLogs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 100;
    const result = await adminService.getAuditLogs(limit);

    return res.status(200).json({
      success: true,
      message: 'অডিট লগ তালিকা।',
      logs: result,
      data: result,
    });
  }),

  // Supporting mocks for specialized admin sub-tabs (Analytics, Governance, Automation, Operations)
  getAnalyticsOverview: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      metrics: {
        totalViews: 142500,
        uniqueVisitors: 45200,
        applicationConversionRate: 18.5,
        avgSessionDurationMinutes: 8.2,
      },
    });
  }),

  getAutomationOverview: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      status: 'active',
      activeRulesCount: 8,
      scheduledJobsToday: 42,
    });
  }),

  getGovernanceOverview: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      complianceScore: 98.4,
      pendingAudits: 0,
      activePolicyVersion: 'v2.4.0',
    });
  }),

  getOperationsOverview: catchAsync(async (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      expenses: [],
      budget: { allocated: 50000, spent: 12450, currency: 'BDT' },
      usage: { apiCalls24h: 84320, storageMb: 420 },
    });
  }),
};
