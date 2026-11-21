import { Router } from 'express';
import { contactController } from './contact.controller';
import { checkAuth, optionalAuth } from '../../middleware/checkAuth';

const router = Router();

router.post('/', contactController.submitMessage);
router.get('/', optionalAuth, contactController.getMessagesOrTrack);

export const contactRoutes = router;
