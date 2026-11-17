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

  // Skills
  getSkills: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getSkills(req.user!.candidateId);
    res.status(status.OK).json({
      success: true,
      skills: result,
      data: result,
    });
  }),

  addSkill: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.addSkill(req.user!.candidateId, req.body);
    res.status(status.OK).json({
      success: true,
      message: 'নতুন স্কিল যুক্ত করা হয়েছে',
      skills: result,
      data: result,
    });
  }),

  deleteSkill: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.deleteSkill(req.user!.candidateId, req.params.id);
    res.status(status.OK).json({
      success: true,
      message: 'স্কিল সফলভাবে মোছা হয়েছে',
      skills: result,
      data: result,
    });
  }),

  // Experience
  getExperience: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getExperience(req.user!.candidateId);
    res.status(status.OK).json({
      success: true,
      experiences: result,
      experience: result,
      data: result,
    });
  }),

  addExperience: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.addExperience(req.user!.candidateId, req.body);
    res.status(status.OK).json({
      success: true,
      message: 'কর্মঅভিজ্ঞতা যুক্ত করা হয়েছে',
      experiences: result,
      experience: result,
      data: result,
    });
  }),

  deleteExperience: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.deleteExperience(req.user!.candidateId, req.params.id);
    res.status(status.OK).json({
      success: true,
      message: 'অভিজ্ঞতা সফলভাবে মোছা হয়েছে',
      experiences: result,
      experience: result,
      data: result,
    });
  }),

  // Career Preferences
  getCareerPreferences: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getCareerPreferences(req.user!.candidateId);
    res.status(status.OK).json({
      success: true,
      careerPreferences: result,
      data: result,
    });
  }),

  updateCareerPreferences: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.updateCareerPreferences(req.user!.candidateId, req.body);
    res.status(status.OK).json({
      success: true,
      message: 'ক্যারিয়ার পছন্দসমূহ সংরক্ষিত হয়েছে',
      careerPreferences: result,
      data: result,
    });
  }),

  // Recommendations
  getRecommendations: catchAsync(async (req: Request, res: Response) => {
    const targetCandidateId = req.user?.candidateId || (req.query.candidateId as string);
    const result = await candidateService.getRecommendations(targetCandidateId, req.query);
    res.status(status.OK).json({
      success: true,
      data: result,
      recommendations: result,
    });
  }),

  recommendationFeedback: catchAsync(async (_req: Request, res: Response) => {
    res.status(status.OK).json({
      success: true,
      message: 'মতামত সফলভাবে গ্রহণ করা হয়েছে।',
    });
  }),

  // Job Reminders
  getJobReminders: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getJobReminders(req.user!.candidateId);
    res.status(status.OK).json({
      success: true,
      reminders: result,
      data: result,
    });
  }),

  addJobReminder: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.addJobReminder(req.user!.candidateId, req.body);
    res.status(status.OK).json({
      success: true,
      message: 'ডেডলাইন অ্যালার্ট সক্রিয় করা হয়েছে',
      reminder: result,
      data: result,
    });
  }),

  deleteJobReminder: catchAsync(async (req: Request, res: Response) => {
    const jobId = (req.query.jobId || req.body?.jobId || req.params.jobId) as string;
    await candidateService.deleteJobReminder(req.user!.candidateId, jobId);
    res.status(status.OK).json({
      success: true,
      message: 'রিমাইন্ডার বন্ধ করা হয়েছে',
    });
  }),

  // Alerts Preferences
  getAlertPreferences: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.getAlertPreferences(req.user!.candidateId);
    res.status(status.OK).json({
      success: true,
      alertPreferences: result,
      data: result,
    });
  }),

  saveAlertPreferences: catchAsync(async (req: Request, res: Response) => {
    const result = await candidateService.saveAlertPreferences(req.user!.candidateId, req.body);
    res.status(status.OK).json({
      success: true,
      message: 'অ্যালার্ট পছন্দ সফলভাবে সংরক্ষণ করা হয়েছে',
      alertPreferences: result,
      data: result,
    });
  }),

  importResume: catchAsync(async (req: Request, res: Response) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'কোনো সিভি/রেজিউমে PDF ফাইল পাওয়া যায়নি। অনুগ্রহ করে একটি সঠিক PDF ফাইল আপলোড করুন।',
      });
    }

    const candidateId = req.user!.candidateId;
    const result = await candidateService.importResumePdf(candidateId, req.file.buffer, req.file.originalname);

    return res.status(200).json({
      success: true,
      message: 'সিভি সফলভাবে স্ক্যান ও বিশ্লেষণ করা হয়েছে।',
      parsed: result.parsed,
      documentUrl: result.documentUrl,
    });
  }),
};
