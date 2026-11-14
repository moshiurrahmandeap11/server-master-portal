import { Router } from 'express';
import { adminController } from './admin.controller';
import { checkAuth } from '../../middleware/checkAuth';
import { UserRole } from '../../../generated/prisma';

const router = Router();

// Admin and Operator guard
router.use(checkAuth(UserRole.ADMIN, UserRole.OPERATOR));

router.get('/stats', adminController.getStats);
router.get('/candidates', adminController.getCandidates);
router.get('/applications', adminController.getApplications);
router.put('/applications/:id/status', adminController.updateApplicationStatus);
router.get('/audit-logs', adminController.getAuditLogs);

export const adminRoutes = router;
