import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { cmsService } from './cms.service';

export const cmsController = {
  getPage: catchAsync(async (req: Request, res: Response) => {
    const slug = req.params.slug || req.params[0] || 'home';
    const result = await cmsService.getPageBySlug(slug);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'পেজ কনটেন্ট লোড সফল হয়েছে।',
      data: result,
    });
  }),

  getAllPages: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getAllPages();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'সমস্ত পেজের তালিকা।',
      data: result,
    });
  }),

  getPlatformSettings: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getPlatformSettings();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্ল্যাটফর্ম গ্লোবাল সেটিংস।',
      data: result,
    });
  }),

  getMediaItems: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getMediaItems();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'মিডিয়া ফাইল তালিকা।',
      data: result,
    });
  }),
};
