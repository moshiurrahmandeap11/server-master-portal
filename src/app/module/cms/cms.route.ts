import { Router } from 'express';
import { cmsController } from './cms.controller';

const router = Router();

router.get('/settings', cmsController.getPlatformSettings);
router.get('/access-policy', cmsController.getAccessPolicy);
router.get('/public-stats', cmsController.getPublicStats);
router.get('/reviews', cmsController.getPublicReviews);
router.get('/content', cmsController.getContentPosts);
router.get('/content/:slug', cmsController.getContentPostBySlug);
router.get('/pages', cmsController.getAllPages);
router.get('/media', cmsController.getMediaItems);
router.get('/pages/:slug(*)', cmsController.getPage);

export const cmsRoutes = router;
