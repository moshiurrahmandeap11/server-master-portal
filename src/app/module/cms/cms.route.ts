import { Router } from 'express';
import { cmsController } from './cms.controller';

const router = Router();

router.get('/settings', cmsController.getPlatformSettings);
router.get('/pages', cmsController.getAllPages);
router.get('/media', cmsController.getMediaItems);
router.get('/pages/:slug(*)', cmsController.getPage);

export const cmsRoutes = router;
