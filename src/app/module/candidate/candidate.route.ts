import { Router } from 'express';
import { candidateController } from './candidate.controller';
import { documentController } from './document.controller';
import { candidateValidation } from './candidate.validation';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';
import { documentUpload, circularPdfUpload } from '../../utils/upload';

const router = Router();

// All candidate routes require authentication
router.use(checkAuth());

router.get('/', candidateController.getProfile);
router.get('/profile', candidateController.getProfile);
router.put('/', validateRequest(candidateValidation.updateProfile), candidateController.updateProfile);
router.put('/profile', validateRequest(candidateValidation.updateProfile), candidateController.updateProfile);

// AI Resume / CV PDF Import & Auto-Fill
router.post('/import-resume', circularPdfUpload.single('file'), candidateController.importResume);

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

// Skills
router.get('/skills', candidateController.getSkills);
router.post('/skills', candidateController.addSkill);
router.delete('/skills/:id', candidateController.deleteSkill);

// Experience
router.get('/experience', candidateController.getExperience);
router.post('/experience', candidateController.addExperience);
router.delete('/experience/:id', candidateController.deleteExperience);

// Career Preferences
router.get('/career-preferences', candidateController.getCareerPreferences);
router.put('/career-preferences', candidateController.updateCareerPreferences);
router.patch('/career-preferences', candidateController.updateCareerPreferences);

// Recommendations
router.get('/recommendations', candidateController.getRecommendations);
router.post('/recommendations/feedback', candidateController.recommendationFeedback);

// Reminders & Alerts
router.get('/job-reminders', candidateController.getJobReminders);
router.post('/job-reminders', candidateController.addJobReminder);
router.delete('/job-reminders', candidateController.deleteJobReminder);
router.delete('/job-reminders/:jobId', candidateController.deleteJobReminder);

router.get('/alerts', candidateController.getAlertPreferences);
router.post('/alerts', candidateController.saveAlertPreferences);
router.post('/alerts/test', candidateController.saveAlertPreferences);

export const candidateRoutes = router;
