import { Router } from 'express';
import { contactController } from './contact.controller';

const router = Router();

router.post('/', contactController.submitMessage);
router.get('/', contactController.getMessagesOrTrack);

export const contactRoutes = router;
