import { Router } from 'express';
import { applicationController } from './application.controller';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

router.use(checkAuth());

router.get('/', applicationController.getMyApplications);
router.get('/my-applications', applicationController.getMyApplications);
router.post('/', applicationController.createApplication);
router.patch('/:id', applicationController.updateApplication);
router.get('/:id', applicationController.getApplicationDetails);

export const applicationRoutes = router;
