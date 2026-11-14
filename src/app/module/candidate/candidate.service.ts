import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';
import { IUpdateCandidateProfilePayload, IEducationPayload, IDocumentPayload } from './candidate.interface';

export const candidateService = {
  getProfile: async (candidateId: string) => {
    const profile = await prisma.candidate.findUnique({
      where: { id: candidateId },
      include: {
        educations: { orderBy: { passingYear: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
        savedJobs: { include: { job: true } },
      },
    });

    if (!profile) {
      throw new AppError(status.NOT_FOUND, 'প্রোফাইল খুঁজে পাওয়া যায়নি।');
    }

    const { passwordHash: _, ...safeProfile } = profile;
    return safeProfile;
  },

  updateProfile: async (candidateId: string, payload: IUpdateCandidateProfilePayload) => {
    const updated = await prisma.candidate.update({
      where: { id: candidateId },
      data: payload,
    });

    const { passwordHash: _, ...safeProfile } = updated;
    return safeProfile;
  },

  // Educations CRUD
  addEducation: async (candidateId: string, payload: IEducationPayload) => {
    return await prisma.educationRecord.create({
      data: {
        ...payload,
        candidateId,
      },
    });
  },

  deleteEducation: async (candidateId: string, educationId: string) => {
    const record = await prisma.educationRecord.findFirst({
      where: { id: educationId, candidateId },
    });

    if (!record) {
      throw new AppError(status.NOT_FOUND, 'শিক্ষাগত তথ্য খুঁজে পাওয়া যায়নি।');
    }

    await prisma.educationRecord.delete({ where: { id: educationId } });
    return { success: true };
  },

  // Documents Vault
  addDocument: async (candidateId: string, payload: IDocumentPayload) => {
    return await prisma.candidateDocument.create({
      data: {
        ...payload,
        candidateId,
      },
    });
  },

  deleteDocument: async (candidateId: string, documentId: string) => {
    const doc = await prisma.candidateDocument.findFirst({
      where: { id: documentId, candidateId },
    });

    if (!doc) {
      throw new AppError(status.NOT_FOUND, 'ডকুমেন্ট খুঁজে পাওয়া যায়নি।');
    }

    await prisma.candidateDocument.delete({ where: { id: documentId } });
    return { success: true };
  },

  // Saved Jobs Bookmark
  toggleSaveJob: async (candidateId: string, jobId: string) => {
    const existing = await prisma.savedJob.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });

    if (existing) {
      await prisma.savedJob.delete({
        where: { id: existing.id },
      });
      return { saved: false, message: 'চাকরিটি বুকমার্ক তালিকা থেকে সরানো হয়েছে।' };
    } else {
      await prisma.savedJob.create({
        data: { candidateId, jobId },
      });
      return { saved: true, message: 'চাকরিটি সফলভাবে বুকমার্ক করা হয়েছে।' };
    }
  },

  getSavedJobs: async (candidateId: string) => {
    return await prisma.savedJob.findMany({
      where: { candidateId },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
  },
};
