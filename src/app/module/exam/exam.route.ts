import { Router } from 'express';
import { examController } from './exam.controller';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

router.get('/admit-cards', examController.getAdmitCards);
router.get('/notices', examController.getExamNotices);
router.get('/results', examController.getExamResults);
router.get('/viva-notices', examController.getVivaNotices);
router.get('/questions', examController.getQuestions);
router.get('/model-tests', examController.getModelTests);

// Authenticated candidate preparation, performance & real exam calendar
router.post('/model-tests/:id/submit', checkAuth(), examController.submitModelTestAttempt);
router.get('/my-performance', checkAuth(), examController.getCandidatePerformance);
router.get('/calendar', checkAuth(), examController.getCandidateExamCalendar);

export const examRoutes = router;
