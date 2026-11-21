import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { cmsService } from './cms.service';

export const cmsController = {
  getPage: catchAsync(async (req: Request, res: Response) => {
    const slug = req.params.slug || req.params[0] || 'home';
    const result = await cmsService.getPageBySlug(slug);

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'পেজ কনটেন্ট লোড সফল হয়েছে।',
      page: result,
      data: result,
    });
  }),

  getAllPages: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getAllPages();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'সমস্ত পেজের তালিকা।',
      pages: result,
      data: result,
    });
  }),

  getPlatformSettings: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getPlatformSettings();

    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'প্ল্যাটফর্ম গ্লোবাল সেটিংস।',
      settings: result,
      data: result,
    });
  }),

  getAccessPolicy: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getPlatformSettings();
    const operational = (result.operational as any) || {};
    res.status(status.OK).json({
      success: true,
      policy: {
        maintenanceMode: Boolean(operational.maintenanceMode),
        allowRegistration: operational.allowRegistration !== false,
        requireEmailVerification: true,
        guestBrowseEnabled: true,
      },
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

  getPublicStats: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getPublicStats();
    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'প্ল্যাটফর্মের লাইভ পরিসংখ্যান।',
      stats: result,
      data: result,
    });
  }),

  getPublicReviews: catchAsync(async (_req: Request, res: Response) => {
    const result = await cmsService.getPublicReviews();
    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'প্রার্থীদের মতামত তালিকা।',
      reviews: result,
      data: result,
    });
  }),

  getContentPosts: catchAsync(async (req: Request, res: Response) => {
    const kind = typeof req.query.kind === 'string' ? req.query.kind : undefined;
    const result = await cmsService.getContentPosts(kind);
    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'কনটেন্ট তালিকা।',
      posts: result,
      data: result,
    });
  }),

  getContentPostBySlug: catchAsync(async (req: Request, res: Response) => {
    const result = await cmsService.getContentPostBySlug(req.params.slug);
    res.status(status.OK).json({
      statusCode: status.OK,
      success: true,
      message: 'কনটেন্ট বিস্তারিত।',
      post: result,
      data: result,
    });
  }),
};
