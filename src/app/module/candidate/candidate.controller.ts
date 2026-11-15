import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { candidateService } from './candidate.service';

export const candidateController = {
  getProfile: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getProfile(req.user!.candidateId);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'প্রোফাইল তথ্য লোড সফল হয়েছে।',
      profile: result,
      user: result,
      data: result,
    });
  }),

  updateProfile: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.updateProfile(req.user!.candidateId, req.body);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'প্রোফাইল সফলভাবে আপডেট করা হয়েছে।',
      profile: result,
      user: result,
      data: result,
    });
  }),

  addEducation: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.addEducation(req.user!.candidateId, req.body);

    sendResponse(res, {
      httpStatusCode: status.CREATED,
      success: true,
      message: 'শিক্ষাগত যোগ্যতা যুক্ত হয়েছে।',
      data: result,
    });
  }),

  deleteEducation: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.deleteEducation(req.user!.candidateId, req.params.id);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'শিক্ষাগত তথ্য সফলভাবে মোছা হয়েছে।',
      data: result,
    });
  }),

  addDocument: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.addDocument(req.user!.candidateId, req.body);

    sendResponse(res, {
      httpStatusCode: status.CREATED,
      success: true,
      message: 'ডকুমেন্ট সফলভাবে সংরক্ষণ করা হয়েছে।',
      data: result,
    });
  }),

  deleteDocument: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.deleteDocument(req.user!.candidateId, req.params.id);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ডকুমেন্ট সফলভাবে মোছা হয়েছে।',
      data: result,
    });
  }),

  toggleSaveJob: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.toggleSaveJob(req.user!.candidateId, req.params.jobId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: result.message,
      data: result,
    });
  }),

  getSavedJobs: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getSavedJobs(req.user!.candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'সংরক্ষিত চাকরির তালিকা।',
      data: result,
    });
  }),

  getNotifications: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getNotifications(req.user!.candidateId);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'নোটিফিকেশন তালিকা লোড হয়েছে।',
      notifications: result,
      data: result,
    });
  }),
};
