import { Router } from 'express';
import { jobController } from './job.controller';

const router = Router();

router.post('/check', jobController.checkEligibility);
router.get('/check', jobController.checkEligibility);

export const eligibilityRoutes = router;
