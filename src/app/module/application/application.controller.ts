import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { applicationService } from './application.service';

export const applicationController = {
  createApplication: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.createApplication(req.user!.candidateId, req.body);

    sendResponse(res, {
      httpStatusCode: status.CREATED,
      success: true,
      message: 'আবেদন সফলভাবে গৃহীত হয়েছে!',
      data: result,
    });
  }),

  getMyApplications: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.getMyApplications(req.user!.candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'আপনার আবেদনের তালিকা।',
      data: result,
    });
  }),

  getApplicationDetails: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.getApplicationDetails(req.user!.candidateId, req.params.id);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'আবেদনের বিস্তারিত বিবরণ।',
      data: result,
    });
  }),
};
