import { Router } from 'express';
import { jobController } from './job.controller';

const router = Router();

router.get('/', jobController.subscribeJobAlerts);
router.post('/', jobController.subscribeJobAlerts);

export const jobAlertRoutes = router;
