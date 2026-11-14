import { Router } from 'express';
import { jobController } from './job.controller';

const router = Router();

router.get('/', jobController.getAllJobs);
router.get('/categories', jobController.getCategories);
router.get('/:idOrSlug', jobController.getJobDetails);

export const jobRoutes = router;
