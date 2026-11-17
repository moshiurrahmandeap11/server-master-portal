import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { applicationService } from './application.service';

export const applicationController = {
  createApplication: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.createApplication(req.user!.candidateId, req.body);

    return res.status(201).json({
      httpStatusCode: status.CREATED,
      success: true,
      message: 'আবেদন সফলভাবে গৃহীত হয়েছে!',
      application: result,
      createdApp: result,
      data: result,
    });
  }),

  getMyApplications: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.getMyApplications(req.user!.candidateId);

    return res.status(200).json({
      httpStatusCode: status.OK,
      success: true,
      message: 'আপনার আবেদনের তালিকা।',
      applications: result,
      data: result,
    });
  }),

  getApplicationDetails: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.getApplicationDetails(req.user!.candidateId, req.params.id);

    return res.status(200).json({
      httpStatusCode: status.OK,
      success: true,
      message: 'আবেদনের বিস্তারিত বিবরণ।',
      application: result,
      data: result,
    });
  }),

  updateApplication: catchAsync(async (req: Request, res: Response) => {
    const result = await applicationService.updateApplication(req.user!.candidateId, req.params.id, req.body);

    return res.status(200).json({
      httpStatusCode: status.OK,
      success: true,
      message: 'আবেদন তথ্য সফলভাবে আপডেট হয়েছে।',
      application: result,
      data: result,
    });
  }),
};
