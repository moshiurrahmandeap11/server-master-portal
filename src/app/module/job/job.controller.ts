import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { jobService } from './job.service';

export const jobController = {
  getAllJobs: catchAsync(async (req: Request, res: Response) => {
    const result = await jobService.getAllJobs(req.query);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'চাকরির তালিকা লোড সফল হয়েছে।',
      data: result.jobs,
      meta: result.meta,
    });
  }),

  searchJobs: catchAsync(async (req: Request, res: Response) => {
    const result = await jobService.searchJobs(req.query);

    return res.status(200).json({
      success: true,
      message: 'চাকরি অনুসন্ধান সম্পন্ন।',
      jobs: result.jobs,
      total: result.total,
      data: result.jobs,
      meta: result.meta,
    });
  }),

  getDailyJobs: catchAsync(async (req: Request, res: Response) => {
    const dateStr = (req.params.date || req.query.date) as string | undefined;
    const result = await jobService.getDailyJobs(dateStr);

    return res.status(200).json({
      success: true,
      date: result.date,
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getClosingSoonJobs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('closing-soon', limit);

    return res.status(200).json({
      success: true,
      feedType: 'closing-soon',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getDeadlineTodayJobs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('deadline-today', limit);

    return res.status(200).json({
      success: true,
      feedType: 'deadline-today',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getTodaysJobs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('todays-jobs', limit);

    return res.status(200).json({
      success: true,
      feedType: 'todays-jobs',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getFeaturedJobs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('featured-jobs', limit);

    return res.status(200).json({
      success: true,
      feedType: 'featured-jobs',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getLatestJobs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('latest-jobs', limit);

    return res.status(200).json({
      success: true,
      feedType: 'latest-jobs',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getUpdatedCirculars: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 20;
    const result = await jobService.getFeedJobs('updated-circulars', limit);

    return res.status(200).json({
      success: true,
      feedType: 'updated-circulars',
      jobs: result.jobs,
      data: result.jobs,
    });
  }),

  getDeadlineStatus: catchAsync(async (req: Request, res: Response) => {
    const result = await jobService.getDeadlineStatus(req.params.id);

    return res.status(200).json({
      success: true,
      data: result,
      ...result,
    });
  }),

  reportJob: catchAsync(async (req: Request, res: Response) => {
    if (req.method === 'GET') {
      const id = (req.query.id || req.params.id) as string;
      const result = await jobService.getJobReport(id);
      return res.status(200).json({
        success: true,
        report: result.report,
      });
    }

    const result = await jobService.reportJob(req.body);
    return res.status(200).json({
      success: true,
      trackingCode: result.trackingCode,
      message: result.message,
      report: result.report,
    });
  }),

  subscribeJobAlerts: catchAsync(async (req: Request, res: Response) => {
    if (req.method === 'GET') {
      const result = await jobService.getJobAlertStats();
      return res.status(200).json({
        success: true,
        stats: result.stats,
      });
    }

    const result = await jobService.subscribeJobAlerts(req.body);
    return res.status(200).json({
      success: true,
      message: result.message,
      subscription: result.subscription,
    });
  }),

  checkEligibility: catchAsync(async (req: Request, res: Response) => {
    const candidateId = req.user?.candidateId || null;
    const { jobId, positionId } = req.body;
    const result = await jobService.checkEligibility(candidateId, jobId, positionId);

    return res.status(200).json({
      success: true,
      ...result,
      data: result,
    });
  }),

  getCategories: catchAsync(async (_req: Request, res: Response) => {
    const result = await jobService.getCategories();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ক্যাটাগরি তালিকা লোড সফল হয়েছে।',
      data: result,
    });
  }),

  getJobDetails: catchAsync(async (req: Request, res: Response) => {
    const result = await jobService.getJobByIdOrSlug(req.params.idOrSlug);

    return res.status(200).json({
      success: true,
      message: 'চাকরির বিবরণ সফলভাবে পাওয়া গেছে।',
      job: result,
      data: result,
    });
  }),
};
