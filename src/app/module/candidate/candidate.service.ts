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
    const mappedEducations = (safeProfile.educations || []).map((e: any) => ({
      ...e,
      degree: e.examTitle || '',
      boardOrUni: e.boardUniversity || '',
      roll: e.rollNumber || '',
      reg: e.regNumber || '',
      year: String(e.passingYear || ''),
      result: e.gpaCgpa ? String(e.gpaCgpa) : e.resultType || '',
      majorSubject: e.groupMajor || '',
      institutionName: e.institute || '',
    }));

    const photo = (safeProfile as any).photoUrl || (safeProfile as any).avatarUrl || null;

    return {
      ...safeProfile,
      photoUrl: photo,
      avatarUrl: photo,
      education: mappedEducations,
      educations: mappedEducations,
      skills: (safeProfile as any).skills || [],
      experiences: (safeProfile as any).experiences || [],
      documents: (safeProfile.documents || []).map((d: any) => ({
        ...d,
        dataUrl: d.fileUrl,
        type: d.type === 'PHOTO_300x300' ? 'photo' : d.type === 'SIGNATURE_300x80' ? 'signature' : String(d.type).toLowerCase(),
      })),
      walletBalance: Number(safeProfile.walletBalance || 0),
    };
  },

  getNotifications: async (candidateId: string) => {
    return await prisma.notificationItem.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
  },

  updateProfile: async (candidateId: string, payload: any) => {
    const allowedColumns = [
      'name',
      'nameBn',
      'phone',
      'district',
      'division',
      'avatarUrl',
      'photoUrl',
      'nidFrontUrl',
      'nidBackUrl',
      'fatherNidUrl',
      'motherNidUrl',
      'nagorikCertificateUrl',
      'birthCertificateUrl',
      'characterCertificateUrl',
      'fatherName',
      'fatherNameBn',
      'motherName',
      'motherNameBn',
      'fatherNid',
      'motherNid',
      'dob',
      'gender',
      'nid',
      'address',
      'permanentAddress',
      'sameAsPresentAddress',
      'maritalStatus',
      'religion',
      'nationality',
      'signatureUrl',
      'quota',
      'quotaCertificateUrl',
      'skills',
      'experiences',
      'presentAddressDetails',
      'permanentAddressDetails',
      'careerObjective',
      'professionalSummary',
      'currentPosition',
      'currentOrganization',
      'careerPreferences',
    ];
    const updateData: Record<string, any> = {};
    for (const col of allowedColumns) {
      if (payload[col] !== undefined) {
        updateData[col] = payload[col];
      }
    }

    const incomingEdu = payload.education !== undefined ? payload.education : payload.educations;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Update Candidate table fields
      await tx.candidate.update({
        where: { id: candidateId },
        data: updateData,
      });

      // 2. Sync Education records if provided in payload
      if (Array.isArray(incomingEdu)) {
        const existingRecords = await tx.educationRecord.findMany({
          where: { candidateId },
          select: { id: true },
        });
        const existingIds = new Set(existingRecords.map((r) => r.id));
        const keepIds = new Set<string>();

        for (const item of incomingEdu) {
          if (!item) continue;

          const rawYear = String(item.year || item.passingYear || '2020').replace(/[^0-9]/g, '');
          const passingYear = parseInt(rawYear, 10) || 2020;

          let parsedGpa: number | null = null;
          if (typeof item.gpaCgpa === 'number') {
            parsedGpa = item.gpaCgpa;
          } else if (typeof item.result === 'string') {
            const numMatch = item.result.match(/[0-9]+(?:\.[0-9]+)?/);
            if (numMatch) parsedGpa = parseFloat(numMatch[0]);
          }

          const eduData = {
            level: String(item.level || 'SSC'),
            examTitle: String(item.degree || item.examTitle || 'ডিগ্রি'),
            groupMajor: item.majorSubject || item.groupMajor || null,
            boardUniversity: item.boardOrUni || item.boardUniversity || null,
            institute: item.institutionName || item.institute || null,
            rollNumber: item.roll ? String(item.roll) : (item.rollNumber ? String(item.rollNumber) : null),
            regNumber: item.reg ? String(item.reg) : (item.regNumber ? String(item.regNumber) : null),
            passingYear,
            resultType: typeof item.result === 'string' ? item.result : (item.resultType || null),
            gpaCgpa: parsedGpa,
            scale: typeof item.scale === 'number' ? item.scale : null,
          };

          const itemId = item.id && typeof item.id === 'string' ? item.id : null;
          if (itemId && existingIds.has(itemId)) {
            // Update existing record
            await tx.educationRecord.update({
              where: { id: itemId },
              data: eduData,
            });
            keepIds.add(itemId);
          } else {
            // Create new record
            const created = await tx.educationRecord.create({
              data: {
                ...eduData,
                candidateId,
              },
            });
            keepIds.add(created.id);
          }
        }

        // Remove records that were deleted by candidate
        const idsToDelete = existingRecords.map((r) => r.id).filter((id) => !keepIds.has(id));
        if (idsToDelete.length > 0) {
          await tx.educationRecord.deleteMany({
            where: { id: { in: idsToDelete }, candidateId },
          });
        }
      }

      return await tx.candidate.findUnique({
        where: { id: candidateId },
        include: {
          educations: { orderBy: { passingYear: 'desc' } },
          documents: { orderBy: { createdAt: 'desc' } },
          savedJobs: { include: { job: true } },
        },
      });
    });

    if (!updated) {
      throw new AppError(status.NOT_FOUND, 'প্রোফাইল আপডেট করতে ব্যর্থ হয়েছে।');
    }

    const { passwordHash: _, ...safeProfile } = updated;
    const mappedEducations = (safeProfile.educations || []).map((e: any) => ({
      ...e,
      degree: e.examTitle || '',
      boardOrUni: e.boardUniversity || '',
      roll: e.rollNumber || '',
      reg: e.regNumber || '',
      year: String(e.passingYear || ''),
      result: e.gpaCgpa ? String(e.gpaCgpa) : e.resultType || '',
      majorSubject: e.groupMajor || '',
      institutionName: e.institute || '',
    }));

    return {
      ...payload, // Preserve full form state (address, permanentAddress, fatherName, dob, nid, etc.)
      ...safeProfile,
      education: mappedEducations,
      educations: mappedEducations,
      skills: (safeProfile as any).skills || payload.skills || [],
      experiences: (safeProfile as any).experiences || payload.experiences || [],
      documents: safeProfile.documents || payload.documents || [],
      walletBalance: Number(safeProfile.walletBalance || 0),
    };
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
