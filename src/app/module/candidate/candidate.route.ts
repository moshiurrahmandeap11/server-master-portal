import { Router } from 'express';
import { candidateController } from './candidate.controller';
import { candidateValidation } from './candidate.validation';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

// All candidate routes require authentication
router.use(checkAuth());

router.get('/profile', candidateController.getProfile);
router.put('/profile', validateRequest(candidateValidation.updateProfile), candidateController.updateProfile);

router.post('/educations', validateRequest(candidateValidation.addEducation), candidateController.addEducation);
router.delete('/educations/:id', candidateController.deleteEducation);

router.post('/documents', validateRequest(candidateValidation.addDocument), candidateController.addDocument);
router.delete('/documents/:id', candidateController.deleteDocument);

router.post('/saved-jobs/:jobId', candidateController.toggleSaveJob);
router.get('/saved-jobs', candidateController.getSavedJobs);

export const candidateRoutes = router;
