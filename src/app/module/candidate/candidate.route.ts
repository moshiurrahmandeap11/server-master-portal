import { Router } from 'express';
import { candidateController } from './candidate.controller';
import { documentController } from './document.controller';
import { candidateValidation } from './candidate.validation';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import { documentUpload } from '../../utils/upload';

const router = Router();

// All candidate routes require authentication
router.use(checkAuth());

router.get('/', candidateController.getProfile);
router.get('/profile', candidateController.getProfile);
router.put('/', validateRequest(candidateValidation.updateProfile), candidateController.updateProfile);
router.put('/profile', validateRequest(candidateValidation.updateProfile), candidateController.updateProfile);

// Document upload & retrieval routes
router.post('/upload-document', documentUpload.single('file'), documentController.uploadDocument);
router.get('/documents', documentController.getDocuments);
router.post('/documents', validateRequest(candidateValidation.addDocument), candidateController.addDocument);
router.delete('/documents', documentController.deleteDocument);
router.delete('/documents/:id', documentController.deleteDocument);

router.post('/educations', validateRequest(candidateValidation.addEducation), candidateController.addEducation);
router.delete('/educations/:id', candidateController.deleteEducation);

router.post('/saved-jobs/:jobId', candidateController.toggleSaveJob);
router.get('/saved-jobs', candidateController.getSavedJobs);
router.get('/notifications', candidateController.getNotifications);

export const candidateRoutes = router;
