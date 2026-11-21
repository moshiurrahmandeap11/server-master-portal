import crypto from 'crypto';
import status from 'http-status';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { DocumentType } from '../../../generated/prisma';
import { geminiUtils } from '../../utils/gemini';
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
        type: d.slotType || (d.type === 'PHOTO_300x300' ? 'photo' : d.type === 'SIGNATURE_300x80' ? 'signature' : String(d.type).toLowerCase()),
      })),
      walletBalance: Number(safeProfile.walletBalance || 0),
    };
  },

  getNotifications: async (candidateId: string) => {
    const items = await prisma.notificationItem.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((n) => ({
      ...n,
      read: n.isRead,
      date: n.createdAt.toISOString(),
      link: n.actionUrl || undefined,
    }));
  },

  markNotificationsRead: async (candidateId: string, notificationId?: string, markAll = false) => {
    if (markAll || !notificationId) {
      await prisma.notificationItem.updateMany({
        where: { candidateId, isRead: false },
        data: { isRead: true },
      });
    } else {
      await prisma.notificationItem.updateMany({
        where: { id: notificationId, candidateId },
        data: { isRead: true },
      });
    }
    return { updated: true };
  },

  deleteNotification: async (candidateId: string, notificationId?: string, clearAll = false) => {
    if (clearAll || !notificationId) {
      await prisma.notificationItem.deleteMany({ where: { candidateId } });
    } else {
      await prisma.notificationItem.deleteMany({ where: { id: notificationId, candidateId } });
    }
    return { deleted: true };
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
      ...safeProfile,
      education: mappedEducations,
      educations: mappedEducations,
      skills: (safeProfile as any).skills || [],
      experiences: (safeProfile as any).experiences || [],
      documents: (safeProfile.documents || []).map((d: any) => ({
        ...d,
        dataUrl: d.fileUrl,
        type: d.slotType || (d.type === 'PHOTO_300x300' ? 'photo' : d.type === 'SIGNATURE_300x80' ? 'signature' : String(d.type).toLowerCase()),
      })),
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
  toggleSaveJob: async (candidateId: string, jobId: string, action?: 'save' | 'unsave') => {
    const existing = await prisma.savedJob.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });

    if (action === 'unsave' || (!action && existing)) {
      if (existing) {
        await prisma.savedJob.delete({ where: { id: existing.id } });
      }
      const remaining = await prisma.savedJob.findMany({ where: { candidateId }, select: { jobId: true } });
      return {
        saved: false,
        savedIds: remaining.map((r) => r.jobId),
        message: 'চাকরিটি বুকমার্ক তালিকা থেকে সরানো হয়েছে।',
      };
    }

    if (!existing) {
      await prisma.savedJob.create({ data: { candidateId, jobId } });
    }
    const remaining = await prisma.savedJob.findMany({ where: { candidateId }, select: { jobId: true } });
    return {
      saved: true,
      savedIds: remaining.map((r) => r.jobId),
      message: 'চাকরিটি সফলভাবে বুকমার্ক করা হয়েছে।',
    };
  },

  getSavedJobs: async (candidateId: string) => {
    const rows = await prisma.savedJob.findMany({
      where: { candidateId },
      include: { job: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      savedIds: rows.map((r) => r.jobId),
      items: rows,
    };
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
    const minScore = Number(query?.minScore) || 25;

    const [candidate, jobs] = await Promise.all([
      prisma.candidate.findUnique({
        where: { id: candidateId },
        include: { educations: true },
      }),
      prisma.jobCircular.findMany({
        where: { status: 'PUBLISHED' },
        take: 120,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!candidate) throw new AppError(status.NOT_FOUND, 'প্রার্থী অ্যাকাউন্ট পাওয়া যায়নি।');

    const userDistrict = (candidate.district || '').toLowerCase();
    const userEduList = (candidate.educations || []).map((e) =>
      `${e.level} ${e.examTitle} ${e.groupMajor || ''}`.toLowerCase()
    );
    const hasGraduate = userEduList.some((s) =>
      /(honours|honors|bachelor|bsc|ba|bba|bcom|graduate|স্নাতক|masters|msc|ma|mba)/.test(s)
    );
    const hasHsc = userEduList.some((s) => /(hsc|এইচএসসি|diploma|ডিপ্লোমা)/.test(s));
    const hasSsc = userEduList.some((s) => /(ssc|এসএসসি)/.test(s));
    const candidateSkills: string[] = (Array.isArray(candidate.skills) ? (candidate.skills as any[]) : [])
      .map((s) => (typeof s === 'string' ? s : s.name || '').toLowerCase())
      .filter(Boolean);
    const prefCategories: string[] = Array.isArray((candidate.careerPreferences as any)?.categories)
      ? (candidate.careerPreferences as any).categories.map((c: any) => String(c).toLowerCase())
      : [];

    const scoredJobs = jobs.map((job) => {
      let score = 20;
      const reasons: string[] = [];
      let skillMatched = false;
      let eduMatched = false;

      const jobEligibility = (job.eligibility as any) || {};
      const jobDistricts = String(jobEligibility.districts || jobEligibility.district || 'সকল জেলা').toLowerCase();
      const jobBlob = `${job.title} ${job.titleBn || ''} ${job.organization} ${JSON.stringify(job.positions || [])} ${JSON.stringify(jobEligibility)}`.toLowerCase();

      if (jobDistricts.includes('সকল') || jobDistricts.includes('all') || (userDistrict && jobDistricts.includes(userDistrict))) {
        score += 20;
        reasons.push('জেলার যোগ্যতা মিলেছে');
      }

      if (prefCategories.length > 0 && prefCategories.some((c) => jobBlob.includes(c))) {
        score += 15;
        reasons.push('পছন্দের ক্যাটাগরির সাথে মিলেছে');
      }

      const matchedSkills = candidateSkills.filter((sk) => sk.length >= 2 && jobBlob.includes(sk));
      if (matchedSkills.length > 0) {
        score += Math.min(30, 15 + matchedSkills.length * 5);
        skillMatched = true;
        reasons.push(`দক্ষতা মিলেছে: ${matchedSkills.slice(0, 3).join(', ')}`);
      }

      if (
        (hasGraduate && /(graduate|honours|bachelor|স্নাতক|degree|masters)/.test(jobBlob)) ||
        (hasHsc && /(hsc|এইচএসসি|ডিপ্লোমা|diploma)/.test(jobBlob)) ||
        (hasSsc && /(ssc|এসএসসি|৮ম|অষ্টম)/.test(jobBlob)) ||
        userEduList.some((edu) => edu.split(/\s+/).some((tok) => tok.length >= 3 && jobBlob.includes(tok)))
      ) {
        score += 25;
        eduMatched = true;
        reasons.push('শিক্ষাগত যোগ্যতা মিলেছে');
      } else if (userEduList.length > 0) {
        score += 5;
      }

      if (reasons.length === 0) {
        reasons.push('চলমান প্রকাশিত বিজ্ঞপ্তি');
      }

      const positionsArr = Array.isArray(job.positions) ? (job.positions as any[]) : [];
      const firstPos = positionsArr[0] || {};
      return {
        ...job,
        id: job.id,
        slug: job.slug,
        title: job.titleBn || job.title,
        organization: job.organization,
        deadline: job.deadline,
        officialFee: Number(job.officialFee),
        serviceFee: Number(job.serviceFee),
        vacancy: job.totalPositions,
        salaryGrade: firstPos.salaryGrade || 'গ্রেড অনুযায়ী',
        matchScore: Math.min(100, score),
        matchReasons: reasons,
        skillMatched,
        eduMatched,
      };
    });

    const filtered = scoredJobs
      .filter((j) => j.matchScore >= minScore)
      .sort((a, b) => b.matchScore - a.matchScore);

    return {
      recommendations: filtered.slice(0, limit),
      bestMatches: filtered.slice(0, Math.min(8, limit)),
      skillsMatches: filtered.filter((j) => j.skillMatched).slice(0, limit),
      educationMatches: filtered.filter((j) => j.eduMatched).slice(0, limit),
    };
  },

  getJobReminders: async (candidateId: string) => {
    return await prisma.userJobReminder.findMany({
      where: { candidateId },
      include: {
        job: {
          select: {
            id: true,
            title: true,
            organization: true,
            deadline: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  addJobReminder: async (candidateId: string, payload: { jobId: string; daysBefore?: number[] | number }) => {
    const alertDaysBefore = Array.isArray(payload.daysBefore) ? payload.daysBefore[0] : (payload.daysBefore || 1);
    const existing = await prisma.userJobReminder.findFirst({
      where: { candidateId, jobId: payload.jobId },
    });

    if (existing) {
      return existing;
    }

    return await prisma.userJobReminder.create({
      data: {
        candidateId,
        jobId: payload.jobId,
        alertDaysBefore: Number(alertDaysBefore),
      },
    });
  },

  deleteJobReminder: async (candidateId: string, jobId: string) => {
    await prisma.userJobReminder.deleteMany({
      where: { candidateId, jobId },
    });
    return { success: true };
  },

  getAlertPreferences: async (candidateId: string) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { careerPreferences: true, district: true },
    });

    const prefs = (candidate?.careerPreferences as any)?.alerts || {
      categories: ['সরকারি চাকরি', 'ব্যাংক ও আর্থিক'],
      districts: [candidate?.district || 'ঢাকা'],
      district: candidate?.district || 'ঢাকা',
      whatsappAlert: true,
      smsAlert: false,
      emailAlert: true,
      frequency: 'daily',
    };

    return prefs;
  },

  saveAlertPreferences: async (candidateId: string, payload: any) => {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { careerPreferences: true },
    });

    const existingPrefs = (candidate?.careerPreferences as any) || {};
    const updatedPrefs = {
      ...existingPrefs,
      alerts: payload,
    };

    await prisma.candidate.update({
      where: { id: candidateId },
      data: { careerPreferences: updatedPrefs },
    });

    return payload;
  },

  sendTestAlert: async (candidateId: string, payload: any) => {
    const channel = payload?.channel || 'in_app';
    const notifId = `NOTIF-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: { email: true, name: true },
    });

    const notif = await prisma.notificationItem.create({
      data: {
        id: notifId,
        candidateId,
        title: 'টেস্ট ডেডলাইন অ্যালার্ট সক্রিয়',
        message: `হ্যালো ${candidate?.name || 'প্রার্থী'}, আপনার ${channel.toUpperCase()} জব অ্যালার্ট সিস্টেম সঠিকভাবে কাজ করছে।`,
        type: 'info',
        actionUrl: '/dashboard/alerts',
      },
    });

    await prisma.notificationDelivery.create({
      data: {
        channel,
        recipient: candidate?.email || candidateId,
        title: notif.title,
        message: notif.message,
        status: 'delivered',
      },
    });

    return notif;
  },

  importResumePdf: async (candidateId: string, fileBuffer: Buffer, filename?: string) => {
    // 1. Parse using Gemini Multimodal OCR
    const parsed = await geminiUtils.parseResumeFromPdfBuffer(fileBuffer);

    // 2. Save original resume in document vault
    let savedDocUrl: string | undefined;
    try {
      const uploadDir = env.CHAKRI_UPLOAD_DIR;
      const docFilename = `${candidateId}_resume_${Date.now()}.pdf`;
      const docPath = path.join(uploadDir, 'candidate-documents', docFilename);
      fs.mkdirSync(path.dirname(docPath), { recursive: true });
      fs.writeFileSync(docPath, fileBuffer);

      savedDocUrl = `/api/uploads/candidate-documents/${docFilename}`;
      await prisma.candidateDocument.create({
        data: {
          candidateId,
          type: DocumentType.OTHER,
          slotType: 'resume',
          category: 'resume',
          title: filename ? `অফিসিয়াল সিভি (${filename})` : 'অফিসিয়াল রিজিউমে / সিভি (PDF)',
          fileUrl: savedDocUrl,
          fileSize: fileBuffer.length,
          mimeType: 'application/pdf',
          isVerified: false,
        },
      });
    } catch (docErr) {
      console.warn('[importResumePdf] Failed to auto-save to document vault:', docErr);
    }

    return {
      parsed,
      documentUrl: savedDocUrl,
    };
  },
};
