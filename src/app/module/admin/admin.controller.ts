import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { adminService } from './admin.service';
import { ApplicationStatus } from '../../../generated/prisma';

export const adminController = {
  getStats: catchAsync(async (_req: Request, res: Response) => {
    const result = await adminService.getDashboardStats();

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'অ্যাডমিন ড্যাশবোর্ড পরিসংখ্যান।',
      data: result,
    });
  }),

  getCandidates: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const search = (req.query.search as string) || '';

    const result = await adminService.getAllCandidates(page, limit, search);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'প্রার্থী তালিকা।',
      data: result.candidates,
      meta: result.meta,
    });
  }),

  getApplications: catchAsync(async (req: Request, res: Response) => {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const statusFilter = req.query.status as ApplicationStatus | undefined;

    const result = await adminService.getAllApplications(page, limit, statusFilter);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'অপারেটর আবেদন কিউ।',
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

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'আবেদনের স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।',
      data: result,
    });
  }),

  getAuditLogs: catchAsync(async (req: Request, res: Response) => {
    const limit = Number(req.query.limit) || 50;
    const result = await adminService.getAuditLogs(limit);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'অডিট লগ তালিকা।',
      data: result,
    });
  }),
};
