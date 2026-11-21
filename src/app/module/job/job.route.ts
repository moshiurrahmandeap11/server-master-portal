import { Router } from 'express';
import { jobController } from './job.controller';

const router = Router();

// 1. Static & specific sub-paths MUST be declared before /:idOrSlug
router.get('/', jobController.getAllJobs);
router.get('/categories', jobController.getCategories);
router.get('/organizations', jobController.getOrganizations);
router.get('/organizations/:slug', jobController.getOrganizationBySlug);
router.get('/search', jobController.searchJobs);

// 2. Job Feeds
router.get('/daily/:date', jobController.getDailyJobs);
router.get('/daily', jobController.getDailyJobs);
router.get('/closing-soon', jobController.getClosingSoonJobs);
router.get('/deadline-today', jobController.getDeadlineTodayJobs);
router.get('/todays-jobs', jobController.getTodaysJobs);
router.get('/featured-jobs', jobController.getFeaturedJobs);
router.get('/latest-jobs', jobController.getLatestJobs);
router.get('/updated-circulars', jobController.getUpdatedCirculars);

// 3. Reports & Subscriptions
router.get('/report', jobController.reportJob);
router.post('/report', jobController.reportJob);

// 4. Job specific sub-resource
router.get('/:id/deadline-status', jobController.getDeadlineStatus);
router.get('/:id/download', jobController.downloadJobPdf);

// 5. Dynamic fallback for single job by ID or Slug (MUST BE LAST)
router.get('/:idOrSlug', jobController.getJobDetails);

export const jobRoutes = router;
