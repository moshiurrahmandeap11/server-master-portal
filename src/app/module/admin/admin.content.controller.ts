import { Request, Response, Router } from 'express';
import status from 'http-status';
import { prisma } from '../../lib/prisma';
import { catchAsync } from '../../shared/catchAsync';
import AppError from '../../errorHelpers/AppError';
import { recordAdminAudit } from './admin.service';

interface CrudResourceConfig {
  modelName: string;
  label: string;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, any>;
  sanitize?: (body: any, isUpdate: boolean) => Record<string, any>;
}

function parseOptionalDate(val: any): Date | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === '') return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function slugifyText(input: string): string {
  const base = String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return base || `item-${Date.now().toString(36)}`;
}

/**
 * Reusable generic CRUD router factory for Admin Content & Exam resources.
 * Eliminates repetitive boilerplate while ensuring uniform audit logging & error handling.
 */
function buildCrudRouter(config: CrudResourceConfig): Router {
  const router = Router();
  const getDelegate = () => (prisma as any)[config.modelName];

  router.get(
    '/',
    catchAsync(async (req: Request, res: Response) => {
      const where: Record<string, any> = {};
      if (req.query.kind && config.modelName === 'blogPost') {
        where.kind = String(req.query.kind);
      }
      if (req.query.category && (config.modelName === 'question' || config.modelName === 'modelTest')) {
        where.category = String(req.query.category);
      }

      const items = await getDelegate().findMany({
        where,
        ...(config.include ? { include: config.include } : {}),
        orderBy: config.orderBy || { createdAt: 'desc' },
        take: 200,
      });

      res.status(status.OK).json({
        success: true,
        items,
        data: items,
      });
    }),
  );

  router.post(
    '/',
    catchAsync(async (req: Request, res: Response) => {
      const data = config.sanitize ? config.sanitize(req.body || {}, false) : (req.body || {});
      const created = await getDelegate().create({ data });
      await recordAdminAudit(`CREATE_${config.modelName.toUpperCase()}`, config.modelName, created.id, {
        title: created.title || created.name || created.question?.slice(0, 60),
      });

      res.status(status.CREATED).json({
        success: true,
        message: `${config.label} সফলভাবে যুক্ত করা হয়েছে।`,
        item: created,
        data: created,
      });
    }),
  );

  const updateHandler = catchAsync(async (req: Request, res: Response) => {
    const id = req.params.id || req.body?.id;
    if (!id) throw new AppError(status.BAD_REQUEST, 'আইডি প্রদান করুন।');

    const data = config.sanitize ? config.sanitize(req.body || {}, true) : (req.body || {});
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    const updated = await getDelegate().update({
      where: { id },
      data,
    });
    await recordAdminAudit(`UPDATE_${config.modelName.toUpperCase()}`, config.modelName, id);

    res.status(status.OK).json({
      success: true,
      message: `${config.label} সফলভাবে আপডেট করা হয়েছে।`,
      item: updated,
      data: updated,
    });
  });

  router.put('/:id', updateHandler);
  router.patch('/:id', updateHandler);

  router.delete(
    '/:id',
    catchAsync(async (req: Request, res: Response) => {
      const id = req.params.id;
      await getDelegate().delete({ where: { id } });
      await recordAdminAudit(`DELETE_${config.modelName.toUpperCase()}`, config.modelName, id);

      res.status(status.OK).json({
        success: true,
        message: `${config.label} সফলভাবে মুছে ফেলা হয়েছে।`,
      });
    }),
  );

  return router;
}

export const adminContentRouter = Router();

// 1. Exam Notices
adminContentRouter.use(
  '/exams/notices',
  buildCrudRouter({
    modelName: 'examNotice',
    label: 'পরীক্ষার নোটিশ',
    include: { job: { select: { id: true, title: true, organization: true } } },
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'নতুন পরীক্ষার নোটিশ' } : {}),
      ...(b.organization !== undefined ? { organization: b.organization || null } : {}),
      ...(b.category !== undefined ? { category: b.category || null } : {}),
      ...(b.jobId !== undefined ? { jobId: b.jobId || null } : {}),
      ...(b.stage !== undefined ? { stage: b.stage } : {}),
      ...(b.examDate !== undefined ? { examDate: parseOptionalDate(b.examDate) } : {}),
      ...(b.examTime !== undefined ? { examTime: b.examTime || null } : {}),
      ...(b.venue !== undefined ? { venue: b.venue || null } : {}),
      ...(b.description !== undefined ? { description: b.description || null } : {}),
      ...(b.noticeUrl !== undefined ? { noticeUrl: b.noticeUrl || null } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
    }),
  }),
);

// 2. Admit Cards
adminContentRouter.use(
  '/exams/admit-cards',
  buildCrudRouter({
    modelName: 'admitCard',
    label: 'প্রবেশপত্র',
    include: { job: { select: { id: true, title: true, organization: true } } },
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'নতুন প্রবেশপত্র' } : {}),
      ...(b.organization !== undefined ? { organization: b.organization || null } : {}),
      ...(b.category !== undefined ? { category: b.category || null } : {}),
      ...(b.jobId !== undefined ? { jobId: b.jobId || null } : {}),
      ...(b.examDate !== undefined ? { examDate: parseOptionalDate(b.examDate) } : {}),
      ...(b.deadline !== undefined ? { deadline: parseOptionalDate(b.deadline) } : {}),
      ...(b.downloadUrl !== undefined ? { downloadUrl: b.downloadUrl || null } : {}),
      ...(b.rollInstructions !== undefined ? { rollInstructions: b.rollInstructions || null } : {}),
      ...(b.isAvailable !== undefined ? { isAvailable: Boolean(b.isAvailable) } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
    }),
  }),
);

// 3. Exam Results
adminContentRouter.use(
  '/exams/results',
  buildCrudRouter({
    modelName: 'examResult',
    label: 'পরীক্ষার ফলাফল',
    include: { job: { select: { id: true, title: true, organization: true } } },
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'পরীক্ষার ফলাফল' } : {}),
      ...(b.organization !== undefined ? { organization: b.organization || null } : {}),
      ...(b.category !== undefined ? { category: b.category || null } : {}),
      ...(b.jobId !== undefined ? { jobId: b.jobId || null } : {}),
      ...(b.stage !== undefined ? { stage: b.stage } : {}),
      ...(b.summary !== undefined ? { summary: b.summary || null } : {}),
      ...(b.pdfUrl !== undefined ? { pdfUrl: b.pdfUrl || null } : {}),
      ...(b.passedRolls !== undefined
        ? {
            passedRolls: Array.isArray(b.passedRolls)
              ? b.passedRolls
              : typeof b.passedRolls === 'string' && b.passedRolls.trim()
                ? b.passedRolls.split(/[\s,]+/).filter(Boolean)
                : [],
          }
        : {}),
      ...(b.publishedAt !== undefined ? { publishedAt: parseOptionalDate(b.publishedAt) || new Date() } : {}),
    }),
  }),
);

// 4. Viva Notices
adminContentRouter.use(
  '/exams/viva-notices',
  buildCrudRouter({
    modelName: 'vivaNotice',
    label: 'ভাইভা নোটিশ',
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'ভাইভা নোটিশ' } : {}),
      ...(b.organization !== undefined ? { organization: b.organization || null } : {}),
      ...(b.category !== undefined ? { category: b.category || null } : {}),
      ...(b.vivaDate !== undefined ? { vivaDate: parseOptionalDate(b.vivaDate) } : {}),
      ...(b.venue !== undefined ? { venue: b.venue || null } : {}),
      ...(b.instructions !== undefined ? { instructions: b.instructions || null } : {}),
      ...(b.noticeUrl !== undefined ? { noticeUrl: b.noticeUrl || null } : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
    }),
  }),
);

// 5. Question Bank
adminContentRouter.use(
  '/exams/questions',
  buildCrudRouter({
    modelName: 'question',
    label: 'প্রশ্ন',
    sanitize: (b, isUpdate) => ({
      ...(b.category !== undefined ? { category: String(b.category).trim() } : !isUpdate ? { category: 'সাধারণ জ্ঞান' } : {}),
      ...(b.question !== undefined ? { question: String(b.question).trim() } : !isUpdate ? { question: '' } : {}),
      ...(b.options !== undefined
        ? {
            options: Array.isArray(b.options)
              ? b.options
              : typeof b.options === 'string'
                ? b.options.split('\n').map((s: string) => s.trim()).filter(Boolean)
                : [],
          }
        : !isUpdate
          ? { options: [] }
          : {}),
      ...(b.correctIndex !== undefined ? { correctIndex: Number(b.correctIndex) || 0 } : !isUpdate ? { correctIndex: 0 } : {}),
      ...(b.explanation !== undefined ? { explanation: b.explanation || null } : {}),
      ...(b.examYear !== undefined ? { examYear: b.examYear ? Number(b.examYear) : null } : {}),
      ...(b.organization !== undefined ? { organization: b.organization || null } : {}),
    }),
  }),
);

// 6. Model Tests
adminContentRouter.use(
  '/exams/model-tests',
  buildCrudRouter({
    modelName: 'modelTest',
    label: 'মডেল টেস্ট',
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'নতুন মডেল টেস্ট' } : {}),
      ...(b.category !== undefined ? { category: String(b.category).trim() } : !isUpdate ? { category: 'বিসিএস ও সরকারি চাকরি' } : {}),
      ...(b.description !== undefined ? { description: b.description || null } : {}),
      ...(b.totalMarks !== undefined ? { totalMarks: Number(b.totalMarks) || 100 } : {}),
      ...(b.durationMinutes !== undefined ? { durationMinutes: Number(b.durationMinutes) || 60 } : {}),
      ...(b.negativeMark !== undefined ? { negativeMark: Number(b.negativeMark) || 0 } : {}),
      ...(b.isPublished !== undefined ? { isPublished: Boolean(b.isPublished) } : {}),
      ...(b.questions !== undefined
        ? {
            questions: Array.isArray(b.questions)
              ? b.questions
              : typeof b.questions === 'string' && b.questions.trim()
                ? JSON.parse(b.questions)
                : [],
          }
        : !isUpdate
          ? { questions: [] }
          : {}),
    }),
  }),
);

// 7. Blog & Career Guides (BlogPost)
adminContentRouter.use(
  '/content-posts',
  buildCrudRouter({
    modelName: 'blogPost',
    label: 'ব্লগ / গাইড',
    orderBy: { publishedAt: 'desc' },
    sanitize: (b, isUpdate) => ({
      ...(b.title !== undefined ? { title: String(b.title).trim() } : !isUpdate ? { title: 'নতুন আর্টিকেল' } : {}),
      ...(b.slug !== undefined || !isUpdate
        ? { slug: b.slug ? slugifyText(b.slug) : `${slugifyText(b.title || 'post')}-${Date.now().toString(36).slice(-4)}` }
        : {}),
      ...(b.kind !== undefined ? { kind: b.kind === 'guide' ? 'guide' : 'blog' } : {}),
      ...(b.excerpt !== undefined ? { excerpt: b.excerpt || null } : {}),
      ...(b.content !== undefined ? { content: String(b.content) } : !isUpdate ? { content: '' } : {}),
      ...(b.category !== undefined ? { category: b.category || null } : {}),
      ...(b.author !== undefined ? { author: b.author || null } : {}),
      ...(b.coverImage !== undefined ? { coverImage: b.coverImage || null } : {}),
      ...(b.readTime !== undefined ? { readTime: b.readTime || null } : {}),
      ...(b.tags !== undefined
        ? {
            tags: Array.isArray(b.tags)
              ? b.tags
              : typeof b.tags === 'string'
                ? b.tags.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [],
          }
        : {}),
      ...(b.status !== undefined ? { status: b.status } : {}),
      ...(b.publishedAt !== undefined ? { publishedAt: parseOptionalDate(b.publishedAt) || new Date() } : {}),
    }),
  }),
);

// 8. Candidate Reviews
adminContentRouter.use(
  '/reviews',
  buildCrudRouter({
    modelName: 'candidateReview',
    label: 'প্রার্থীর মতামত',
    orderBy: { orderIndex: 'asc' },
    sanitize: (b, isUpdate) => ({
      ...(b.name !== undefined ? { name: String(b.name).trim() } : !isUpdate ? { name: 'প্রার্থী' } : {}),
      ...(b.role !== undefined ? { role: b.role || null } : {}),
      ...(b.institution !== undefined ? { institution: b.institution || null } : {}),
      ...(b.quote !== undefined ? { quote: String(b.quote).trim() } : !isUpdate ? { quote: '' } : {}),
      ...(b.rating !== undefined ? { rating: Math.min(5, Math.max(1, Number(b.rating) || 5)) } : {}),
      ...(b.isApproved !== undefined ? { isApproved: Boolean(b.isApproved) } : {}),
      ...(b.orderIndex !== undefined ? { orderIndex: Number(b.orderIndex) || 0 } : {}),
    }),
  }),
);

// 9. Organizations
adminContentRouter.use(
  '/organizations',
  buildCrudRouter({
    modelName: 'organization',
    label: 'প্রতিষ্ঠান',
    orderBy: { name: 'asc' },
    sanitize: (b, isUpdate) => ({
      ...(b.name !== undefined ? { name: String(b.name).trim() } : !isUpdate ? { name: 'নতুন প্রতিষ্ঠান' } : {}),
      ...(b.nameBn !== undefined ? { nameBn: b.nameBn || null } : {}),
      ...(b.slug !== undefined || !isUpdate
        ? { slug: b.slug ? slugifyText(b.slug) : `${slugifyText(b.name || 'org')}-${Date.now().toString(36).slice(-4)}` }
        : {}),
      ...(b.type !== undefined ? { type: b.type || 'Govt' } : {}),
      ...(b.logoUrl !== undefined ? { logoUrl: b.logoUrl || null } : {}),
      ...(b.websiteUrl !== undefined ? { websiteUrl: b.websiteUrl || null } : {}),
      ...(b.description !== undefined ? { description: b.description || null } : {}),
      ...(b.isActive !== undefined ? { isActive: Boolean(b.isActive) } : {}),
    }),
  }),
);
