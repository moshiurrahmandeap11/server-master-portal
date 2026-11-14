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

  getJobDetails: catchAsync(async (req: Request, res: Response) => {
    const result = await jobService.getJobByIdOrSlug(req.params.idOrSlug);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'চাকরির বিবরণ সফলভাবে পাওয়া গেছে।',
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
};
