import { Router } from 'express';
import { adminController } from './admin.controller';
import { checkAuth } from '../../middleware/checkAuth';
import { UserRole } from '../../../generated/prisma';

const router = Router();

// Admin and Operator guard
router.use(checkAuth(UserRole.ADMIN, UserRole.OPERATOR));

// Dashboard Stats & Candidate Management
router.get('/stats', adminController.getStats);
router.get('/candidates', adminController.getCandidates);
router.get('/candidates/:id', adminController.getCandidateById);

// Applications
router.get('/applications', adminController.getApplications);
router.put('/applications/:id/status', adminController.updateApplicationStatus);

// Jobs CRUD
router.get('/jobs', adminController.getJobs);
router.post('/jobs', adminController.createJob);
router.put('/jobs/:id', adminController.updateJob);
router.delete('/jobs/:id', adminController.deleteJob);

// Categories CRUD
router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.createCategory);
router.post('/categories/bulk-assign', adminController.getCategories);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// Sources & Crawlers
router.get('/sources/drafts', adminController.getSourceDrafts);
router.post('/sources/run', adminController.runSourceSpider);
router.post('/sources/:id/run', adminController.runSourceSpider);
router.get('/sources', adminController.getSources);
router.post('/sources', adminController.createSource);
router.put('/sources/:id', adminController.updateSource);
router.delete('/sources/:id', adminController.deleteSource);

// Companies
router.get('/companies', adminController.getCompanies);
router.post('/companies', adminController.createCompany);
router.put('/companies/:id', adminController.updateCompany);
router.delete('/companies/:id', adminController.deleteCompany);

// Coupons & Raffles
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);
router.get('/raffles', adminController.getRaffles);
router.post('/raffles', adminController.createRaffle);

// Pages & CMS
router.get('/pages', adminController.getPages);
router.post('/pages', adminController.createPage);
router.put('/pages/:id', adminController.updatePage);
router.delete('/pages/:id', adminController.deletePage);

// Media
router.get('/media', adminController.getMedia);
router.delete('/media/:id', adminController.deleteMedia);

// Settings
router.get('/settings', adminController.getPlatformSettings);
router.put('/settings', adminController.updatePlatformSettings);

// Audit & Impersonation
router.get('/audit-logs', adminController.getAuditLogs);
router.post('/impersonate', adminController.impersonateCandidate);
router.delete('/impersonate', adminController.stopImpersonation);

// Wallet Transactions
router.get('/wallet-transactions', adminController.getWalletTransactions);

// Job Reports
router.get('/reports', adminController.getJobReports);
router.get('/job-reports', adminController.getJobReports);
router.put('/reports/:id', adminController.updateJobReportStatus);
router.put('/job-reports/:id', adminController.updateJobReportStatus);

// Sub-Hub Analytics / Automation / Governance / Operations mocks
router.get('/analytics/overview', adminController.getAnalyticsOverview);
router.get('/analytics/data-quality', adminController.getAnalyticsOverview);
router.get('/automation/overview', adminController.getAutomationOverview);
router.get('/automation/rules', adminController.getAutomationOverview);
router.get('/automation/tasks', adminController.getAutomationOverview);
router.get('/governance/overview', adminController.getGovernanceOverview);
router.get('/governance/health', adminController.getGovernanceOverview);
router.get('/operations/expenses', adminController.getOperationsOverview);
router.get('/operations/budget', adminController.getOperationsOverview);
router.get('/operations/usage', adminController.getOperationsOverview);

export const adminRoutes = router;
