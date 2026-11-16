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

  // Skills CRUD
  getSkills: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { skills: true },
    });
    return Array.isArray(candidate?.skills) ? (candidate?.skills as any[]) : [];
  },

  addSkill: async (candidateId: string, payload: any) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { skills: true },
    });
    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const currentSkills: any[] = Array.isArray(candidate.skills) ? [...(candidate.skills as any[])] : [];
    const skillName = (payload.name || payload.title || '').trim();
    if (!skillName) throw new AppError(status.BAD_REQUEST, 'স্কিলের নাম দেওয়া আবশ্যক।');

    const skillItem = {
      id: payload.id || `sk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: skillName,
      proficiency: payload.proficiency || 'intermediate',
      category: payload.category || 'Technical',
      isUserConfirmed: true,
    };

    const existingIdx = currentSkills.findIndex(
      (s: any) => (typeof s === 'string' ? s.toLowerCase() === skillName.toLowerCase() : s.name?.toLowerCase() === skillName.toLowerCase())
    );

    if (existingIdx >= 0) {
      currentSkills[existingIdx] = { ...currentSkills[existingIdx], ...skillItem };
    } else {
      currentSkills.push(skillItem);
    }

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { skills: currentSkills },
    });

    return currentSkills;
  },

  deleteSkill: async (candidateId: string, skillId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { skills: true },
    });
    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const currentSkills: any[] = Array.isArray(candidate.skills) ? [...(candidate.skills as any[])] : [];
    const updatedSkills = currentSkills.filter(
      (s: any) => (typeof s === 'string' ? s !== skillId : (s.id !== skillId && s.name !== skillId))
    );

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { skills: updatedSkills },
    });

    return updatedSkills;
  },

  // Experience CRUD
  getExperience: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { experiences: true },
    });
    return Array.isArray(candidate?.experiences) ? (candidate?.experiences as any[]) : [];
  },

  addExperience: async (candidateId: string, payload: any) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { experiences: true },
    });
    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const currentExp: any[] = Array.isArray(candidate.experiences) ? [...(candidate.experiences as any[])] : [];
    const expItem = {
      id: payload.id || `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      designation: (payload.designation || '').trim(),
      organization: (payload.organization || '').trim(),
      startDate: payload.startDate || '',
      endDate: payload.isCurrent ? '' : (payload.endDate || ''),
      isCurrent: Boolean(payload.isCurrent),
      responsibilities: (payload.responsibilities || '').trim(),
    };

    currentExp.push(expItem);

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { experiences: currentExp },
    });

    return currentExp;
  },

  deleteExperience: async (candidateId: string, expId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { experiences: true },
    });
    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const currentExp: any[] = Array.isArray(candidate.experiences) ? [...(candidate.experiences as any[])] : [];
    const updatedExp = currentExp.filter((e: any) => e.id !== expId);

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { experiences: updatedExp },
    });

    return updatedExp;
  },

  // Career Preferences
  getCareerPreferences: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { careerPreferences: true },
    });
    return candidate?.careerPreferences || {};
  },

  updateCareerPreferences: async (candidateId: string, payload: any) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { careerPreferences: true },
    });
    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const updatedPrefs = {
      ...(typeof candidate.careerPreferences === 'object' && candidate.careerPreferences !== null ? candidate.careerPreferences : {}),
      ...payload,
    };

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { careerPreferences: updatedPrefs },
    });

    return updatedPrefs;
  },

  // Job Recommendations
  getRecommendations: async (candidateId: string, query: any) => {
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 20));
    const minScore = Number(query?.minScore) || 20;

    const [candidate, jobs] = await Promise.all([
      prisma.candidate.findUnique({
        where: { id: candidateId },
        include: { educations: true },
      }),
      prisma.jobCircular.findMany({
        where: { status: 'PUBLISHED' },
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const userDistrict = (candidate.district || '').toLowerCase();
    const userEduLevels = (candidate.educations || []).map((e) => e.level.toLowerCase());
    const candidateSkills: string[] = (Array.isArray(candidate.skills) ? (candidate.skills as any[]) : [])
      .map((s) => (typeof s === 'string' ? s : s.name || '').toLowerCase());

    const scoredJobs = jobs.map((job) => {
      let score = 50;
      const reasons: string[] = ['সাধারণ উন্মুক্ত নিয়োগ'];

      const jobEligibility = (job.eligibility as any) || {};
      const jobDistricts = String(jobEligibility.districts || '').toLowerCase();

      if (jobDistricts.includes('সকল') || jobDistricts.includes('all') || (userDistrict && jobDistricts.includes(userDistrict))) {
        score += 20;
        reasons.push('জেলার যোগ্যতা মিলেছে');
      }

      if (userEduLevels.length > 0) {
        score += 15;
        reasons.push('শিক্ষাগত যোগ্যতা উপযুক্ত');
      }

      if (candidateSkills.length > 0) {
        score += 15;
        reasons.push('প্রাসঙ্গিক দক্ষতা প্রযোজ্য');
      }

      return {
        ...job,
        matchScore: Math.min(100, score),
        matchReasons: reasons,
      };
    });

    return scoredJobs
      .filter((j) => j.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  },
};
