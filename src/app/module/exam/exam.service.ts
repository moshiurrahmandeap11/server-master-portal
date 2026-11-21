import status from 'http-status';
import { prisma } from '../../lib/prisma';
import AppError from '../../errorHelpers/AppError';

export const examService = {
  getAdmitCards: async () => {
    return await prisma.admitCard.findMany({
      include: {
        job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getExamNotices: async () => {
    return await prisma.examNotice.findMany({
      include: {
        job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getExamResults: async () => {
    return await prisma.examResult.findMany({
      include: {
        job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  getVivaNotices: async () => {
    return await prisma.vivaNotice.findMany({
      where: { status: 'published' },
      orderBy: { createdAt: 'desc' },
    });
  },

  getQuestions: async (category?: string) => {
    const where = category && category !== 'all' ? { category } : {};
    return await prisma.question.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  },

  getModelTests: async () => {
    return await prisma.modelTest.findMany({
      where: { isPublished: true },
      orderBy: { createdAt: 'desc' },
    });
  },

  submitModelTestAttempt: async (
    candidateId: string,
    modelTestId: string,
    payload: { answers: Record<string, number>; durationSec?: number },
  ) => {
    const test = await prisma.modelTest.findUnique({ where: { id: modelTestId } });
    if (!test) {
      throw new AppError(status.NOT_FOUND, 'মডেল টেস্টটি খুঁজে পাওয়া যায়নি।');
    }

    const rawQuestions = Array.isArray(test.questions) ? (test.questions as any[]) : [];
    const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};

    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    rawQuestions.forEach((q: any, idx: number) => {
      const key = q?.id !== undefined ? String(q.id) : String(idx);
      const selected = answers[key] !== undefined ? answers[key] : answers[String(idx)];
      if (selected === undefined || selected === null || selected === -1) {
        skippedCount += 1;
      } else if (Number(selected) === Number(q.correctIndex ?? q.answerIndex ?? q.correctAnswer)) {
        correctCount += 1;
      } else {
        wrongCount += 1;
      }
    });

    const totalQuestions = rawQuestions.length;
    const negMark = Number(test.negativeMark ?? 0.25);
    const marksPerQ = totalQuestions > 0 ? test.totalMarks / totalQuestions : 1;
    const rawScore = correctCount * marksPerQ - wrongCount * negMark;
    const score = Number(Math.max(0, rawScore).toFixed(2));
    const answered = correctCount + wrongCount;
    const accuracy = answered > 0 ? Number(((correctCount / answered) * 100).toFixed(1)) : 0;

    const attempt = await prisma.modelTestAttempt.create({
      data: {
        candidateId,
        modelTestId: test.id,
        category: test.category,
        totalQuestions,
        correctCount,
        wrongCount,
        skippedCount,
        score,
        totalMarks: test.totalMarks,
        accuracy,
        durationSec: payload.durationSec ? Number(payload.durationSec) : null,
        answers,
      },
      include: {
        modelTest: { select: { id: true, title: true, category: true, totalMarks: true } },
      },
    });

    return attempt;
  },

  getCandidatePerformance: async (candidateId: string) => {
    const [attempts, availableTestsCount, questionBankCount, questionCategories] = await Promise.all([
      prisma.modelTestAttempt.findMany({
        where: { candidateId },
        include: {
          modelTest: { select: { id: true, title: true, category: true, totalMarks: true, durationMinutes: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.modelTest.count({ where: { isPublished: true } }),
      prisma.question.count(),
      prisma.question.groupBy({
        by: ['category'],
        _count: { _all: true },
      }),
    ]);

    const totalAttempts = attempts.length;
    const totalQuestionsAnswered = attempts.reduce((acc, a) => acc + a.correctCount + a.wrongCount, 0);
    const avgScore = totalAttempts > 0
      ? Number((attempts.reduce((acc, a) => acc + a.score, 0) / totalAttempts).toFixed(1))
      : 0;
    const avgAccuracy = totalAttempts > 0
      ? Number((attempts.reduce((acc, a) => acc + a.accuracy, 0) / totalAttempts).toFixed(1))
      : 0;
    const bestScore = totalAttempts > 0
      ? Number(Math.max(...attempts.map((a) => a.score)).toFixed(1))
      : 0;

    // Group attempts by category for subject-wise performance
    const byCategory = new Map<string, { attempts: number; correct: number; total: number; scoreSum: number; maxMarksSum: number }>();
    for (const a of attempts) {
      const curr = byCategory.get(a.category) || { attempts: 0, correct: 0, total: 0, scoreSum: 0, maxMarksSum: 0 };
      curr.attempts += 1;
      curr.correct += a.correctCount;
      curr.total += a.totalQuestions;
      curr.scoreSum += a.score;
      curr.maxMarksSum += a.totalMarks;
      byCategory.set(a.category, curr);
    }

    const subjectBreakdown = Array.from(byCategory.entries()).map(([category, stats]) => ({
      category,
      attempts: stats.attempts,
      correctCount: stats.correct,
      totalQuestions: stats.total,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0,
      avgScorePercent: stats.maxMarksSum > 0 ? Math.round((stats.scoreSum / stats.maxMarksSum) * 100) : 0,
    }));

    return {
      summary: {
        totalAttempts,
        totalQuestionsAnswered,
        avgScore,
        avgAccuracy,
        bestScore,
        availableTestsCount,
        questionBankCount,
      },
      subjectBreakdown,
      questionCategories: questionCategories.map((c) => ({
        category: c.category,
        count: c._count._all,
      })),
      attempts,
    };
  },

  getCandidateExamCalendar: async (candidateId: string) => {
    const [applications, savedJobs, examNotices, vivaNotices] = await Promise.all([
      candidateId
        ? prisma.applicationRequest.findMany({
            where: { candidateId },
            include: {
              job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true, deadline: true } },
            },
            orderBy: { submittedAt: 'desc' },
          })
        : Promise.resolve([]),
      candidateId
        ? prisma.savedJob.findMany({
            where: { candidateId },
            include: {
              job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true, deadline: true } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
      prisma.examNotice.findMany({
        where: { status: 'published' },
        include: {
          job: { select: { id: true, slug: true, title: true, titleBn: true, organization: true } },
        },
        orderBy: { examDate: 'asc' },
      }),
      prisma.vivaNotice.findMany({
        where: { status: 'published' },
        orderBy: { vivaDate: 'asc' },
      }),
    ]);

    const events: any[] = [];

    // 1. Official exam notices from DB
    for (const notice of examNotices) {
      if (!notice.examDate) continue;
      events.push({
        id: `exam-${notice.id}`,
        type: 'exam',
        title: notice.title,
        organization: notice.organization || notice.job?.organization || '',
        stage: notice.stage,
        date: notice.examDate.toISOString(),
        time: notice.examTime || null,
        venue: notice.venue || null,
        noticeUrl: notice.noticeUrl || null,
        jobSlug: notice.job?.slug || null,
      });
    }

    // 2. Official viva notices from DB
    for (const viva of vivaNotices) {
      if (!viva.vivaDate) continue;
      events.push({
        id: `viva-${viva.id}`,
        type: 'viva',
        title: viva.title,
        organization: viva.organization || '',
        stage: 'VIVA',
        date: viva.vivaDate.toISOString(),
        time: null,
        venue: viva.venue || null,
        noticeUrl: viva.noticeUrl || null,
        jobSlug: null,
      });
    }

    // 3. Application deadlines from user's saved/applied jobs (real DB deadlines only)
    const seenJobIds = new Set<string>();
    for (const app of applications) {
      if (app.job?.deadline && !seenJobIds.has(app.job.id)) {
        seenJobIds.add(app.job.id);
        events.push({
          id: `deadline-app-${app.job.id}`,
          type: 'deadline',
          title: `${app.job.titleBn || app.job.title} — আবেদনের শেষ তারিখ`,
          organization: app.job.organization,
          stage: 'APPLICATION',
          date: app.job.deadline.toISOString(),
          time: null,
          venue: null,
          noticeUrl: `/jobs/${app.job.slug}`,
          jobSlug: app.job.slug,
          applicationStatus: app.status,
        });
      }
    }
    for (const saved of savedJobs) {
      if (saved.job?.deadline && !seenJobIds.has(saved.job.id)) {
        seenJobIds.add(saved.job.id);
        events.push({
          id: `deadline-saved-${saved.job.id}`,
          type: 'deadline',
          title: `${saved.job.titleBn || saved.job.title} — আবেদনের শেষ তারিখ`,
          organization: saved.job.organization,
          stage: 'SAVED',
          date: saved.job.deadline.toISOString(),
          time: null,
          venue: null,
          noticeUrl: `/jobs/${saved.job.slug}`,
          jobSlug: saved.job.slug,
        });
      }
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      events,
      totalApplications: applications.length,
      totalExamNotices: examNotices.length,
      totalVivaNotices: vivaNotices.length,
    };
  },
};
