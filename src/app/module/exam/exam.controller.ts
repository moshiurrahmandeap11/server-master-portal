import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { examService } from './exam.service';

export const examController = {
  getAdmitCards: catchAsync(async (_req: Request, res: Response) => {
    const result = await examService.getAdmitCards();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রবেশপত্র সংক্রান্ত বিজ্ঞপ্তি।',
      data: result,
    });
  }),

  getExamNotices: catchAsync(async (_req: Request, res: Response) => {
    const result = await examService.getExamNotices();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'পরীক্ষার নোটিশ তালিকা।',
      data: result,
    });
  }),

  getExamResults: catchAsync(async (_req: Request, res: Response) => {
    const result = await examService.getExamResults();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'পরীক্ষার ফলাফল তালিকা।',
      data: result,
    });
  }),

  getQuestions: catchAsync(async (req: Request, res: Response) => {
    const result = await examService.getQuestions(req.query.category as string);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রশ্নব্যাংক ডাটা।',
      data: result,
    });
  }),

  getModelTests: catchAsync(async (_req: Request, res: Response) => {
    const result = await examService.getModelTests();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'মডেল টেস্ট তালিকা।',
      data: result,
    });
  }),
};
