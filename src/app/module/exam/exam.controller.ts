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

  getVivaNotices: catchAsync(async (_req: Request, res: Response) => {
    const result = await examService.getVivaNotices();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ভাইভা নোটিশ তালিকা।',
      data: result,
    });
  }),

  submitModelTestAttempt: catchAsync(async (req: Request, res: Response) => {
    const candidateId = (req as any).user?.candidateId || (req as any).user?.id || (req as any).user?.userId;
    const result = await examService.submitModelTestAttempt(candidateId, req.params.id, req.body || {});

    sendResponse(res, {
      httpStatusCode: status.CREATED,
      success: true,
      message: 'মডেল টেস্ট সাবমিট সফল হয়েছে।',
      data: result,
    });
  }),

  getCandidatePerformance: catchAsync(async (req: Request, res: Response) => {
    const candidateId = (req as any).user?.candidateId || (req as any).user?.id || (req as any).user?.userId;
    const result = await examService.getCandidatePerformance(candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রার্থীর প্রস্তুতি ও পারফরম্যান্স রিপোর্ট।',
      data: result,
    });
  }),

  getCandidateExamCalendar: catchAsync(async (req: Request, res: Response) => {
    const candidateId = (req as any).user?.candidateId || (req as any).user?.id || (req as any).user?.userId;
    const result = await examService.getCandidateExamCalendar(candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রার্থীর পরীক্ষা ক্যালেন্ডার।',
      data: result,
    });
  }),
};
