import { Router } from 'express';
import { authRoutes } from '../module/auth/auth.route';
import { candidateRoutes } from '../module/candidate/candidate.route';
import { documentRoutes } from '../module/candidate/document.route';
import { jobRoutes } from '../module/job/job.route';
import { applicationRoutes } from '../module/application/application.route';
import { walletRoutes } from '../module/wallet/wallet.route';
import { examRoutes } from '../module/exam/exam.route';
import { cmsRoutes } from '../module/cms/cms.route';
import { adminRoutes } from '../module/admin/admin.route';

const router = Router();

router.use('/auth', authRoutes);
router.use('/social', authRoutes);
router.use('/candidate', candidateRoutes);
router.use('/profile', candidateRoutes);
router.use('/user', candidateRoutes);
router.use('/documents', documentRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/wallet', walletRoutes);
router.use('/exams', examRoutes);
router.use('/cms', cmsRoutes);
router.use('/platform', cmsRoutes);
router.use('/settings', cmsRoutes);
router.use('/admin', adminRoutes);

export const IndexRoutes = router;
