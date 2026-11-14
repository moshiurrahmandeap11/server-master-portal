import { Router } from 'express';
import { applicationController } from './application.controller';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

router.use(checkAuth());

router.post('/', applicationController.createApplication);
router.get('/my-applications', applicationController.getMyApplications);
router.get('/:id', applicationController.getApplicationDetails);

export const applicationRoutes = router;
