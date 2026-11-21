import { Router } from 'express';
import { jobController } from './job.controller';
import { optionalAuth } from '../../middleware/checkAuth';

const router = Router();

router.use(optionalAuth);
router.post('/check', jobController.checkEligibility);
router.get('/check', jobController.checkEligibility);

export const eligibilityRoutes = router;
