import { Router } from 'express';
import { examController } from './exam.controller';

const router = Router();

router.get('/admit-cards', examController.getAdmitCards);
router.get('/notices', examController.getExamNotices);
router.get('/results', examController.getExamResults);
router.get('/questions', examController.getQuestions);
router.get('/model-tests', examController.getModelTests);

export const examRoutes = router;
