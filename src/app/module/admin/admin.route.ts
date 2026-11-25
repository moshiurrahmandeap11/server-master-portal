import { Router } from 'express';
import { adminController } from './admin.controller';
import { adminExtendedController } from './admin.extended.controller';
import { adminContentRouter } from './admin.content.controller';
import { checkAuth } from '../../middleware/checkAuth';
import { UserRole } from '../../../generated/prisma';
import { applicantCopyUpload, circularPdfUpload, mediaUpload } from '../../utils/upload';

const router = Router();

// Admin and Operator guard
router.use(checkAuth(UserRole.ADMIN, UserRole.OPERATOR));

// Dashboard Stats & Candidate Management
router.get('/stats', adminController.getStats);
router.get('/candidates', adminController.getCandidates);
router.post('/candidates', adminExtendedController.createCandidate);
router.patch('/candidates', adminExtendedController.updateCandidate);
router.get('/candidates/:id', adminController.getCandidateById);
router.patch('/candidates/:id', adminExtendedController.updateCandidate);
router.put('/candidates/:id', adminExtendedController.updateCandidate);
router.delete('/candidates/:id', adminExtendedController.deleteCandidate);

// Applications & Applicant Copy Upload
router.get('/applications', adminController.getApplications);
router.put('/applications/:id/status', adminController.updateApplicationStatus);
router.post('/upload-applicant-copy', applicantCopyUpload.single('file'), adminExtendedController.uploadApplicantCopy);

// Jobs CRUD & AI Generator
router.get('/jobs', adminController.getJobs);
router.post('/jobs', adminController.createJob);
router.patch('/jobs', adminController.bulkUpdateJobStatus);
router.delete('/jobs', adminController.bulkDeleteJobs);
router.put('/jobs/:id', adminController.updateJob);
router.patch('/jobs/:id', adminController.updateJob);
router.delete('/jobs/:id', adminController.deleteJob);
router.post('/ai/generate-job-content', adminExtendedController.generateJobContentAi);

// Categories CRUD
router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.createCategory);
router.post('/categories/bulk-assign', adminExtendedController.bulkAssignCategory);
router.put('/categories/:id', adminController.updateCategory);
router.patch('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

// Collector / Spider & Drafts
router.post('/collector/sync', adminExtendedController.syncCollector);
router.post('/drafts/action', adminController.handleDraftAction);
router.get('/spider/gemini-browser', adminController.getSpiderGeminiBrowser);
router.post('/spider/gemini-browser', adminController.postSpiderGeminiBrowser);
router.post('/spider/upload-pdf-parse', circularPdfUpload.single('file'), adminController.uploadCircularPdfAndParse);
router.post('/gemini/parse-circular', adminController.parseCircularWithGemini);

// Sources & Crawlers
router.get('/sources/runs', adminController.getSourceRuns);
router.get('/sources/drafts', adminController.getSourceDrafts);
router.post('/sources/drafts', adminController.handleDraftAction);
router.post('/sources/drafts/:id/publish', adminController.publishDraft);
router.post('/sources/run', adminController.runSourceSpider);
router.post('/sources/run-all', adminController.runAllSources);
router.post('/sources/:id/run', adminController.runSourceSpider);
router.post('/sources/:id/test', adminController.testSource);
router.post('/sources/:id/toggle', adminController.toggleSource);
router.post('/sources/:id/ingest', adminController.ingestSource);
router.get('/sources', adminController.getSources);
router.post('/sources', adminController.createSource);
router.put('/sources/:id', adminController.updateSource);
router.delete('/sources/:id', adminController.deleteSource);

// Verification Hub & Certificates Queue
router.post('/verification/run', adminController.runVerification);
router.post('/verification/:id/approve', adminController.approveVerification);
router.post('/verification/:id/reject', adminController.rejectVerification);
router.post('/verification/:id/resolve-conflict', adminController.resolveConflict);
router.post('/verification/:id/correct-field', adminController.correctField);
router.get('/verification/usage', adminExtendedController.getOperationsOverview);
router.get('/certificates/queue', adminExtendedController.getCertificatesQueue);
router.post('/certificates/verify', adminExtendedController.verifyCertificate);

// Testing Spider Hub
router.get('/testing/runs', adminController.getTestingRuns);
router.post('/testing/runs', adminController.executeTestingRun);
router.get('/testing/personas', adminController.getTestingPersonas);

// Companies
router.get('/companies', adminController.getCompanies);
router.post('/companies', adminController.createCompany);
router.patch('/companies', adminExtendedController.patchCompany);
router.put('/companies/:id', adminController.updateCompany);
router.patch('/companies/:id', adminExtendedController.patchCompany);
router.delete('/companies/:id', adminController.deleteCompany);

// Coupons & Raffles
router.get('/coupons', adminController.getCoupons);
router.post('/coupons', adminController.createCoupon);
router.patch('/coupons/:id', adminExtendedController.updateCoupon);
router.delete('/coupons/:id', adminController.deleteCoupon);
router.get('/raffles', adminController.getRaffles);
router.post('/raffles', adminController.createRaffle);
router.patch('/raffles/:id', adminExtendedController.updateRaffle);

// Pages & CMS
router.get('/pages', adminController.getPages);
router.post('/pages', adminController.createPage);
router.put('/pages/:id', adminController.updatePage);
router.delete('/pages/:id', adminController.deletePage);

// Media (upload, update, query/param delete)
router.get('/media', adminController.getMedia);
router.post('/media', mediaUpload.single('file'), adminExtendedController.createMedia);
router.patch('/media', adminExtendedController.updateMedia);
router.patch('/media/:id', adminExtendedController.updateMedia);
router.delete('/media', adminExtendedController.deleteMediaQueryOrParam);
router.delete('/media/:id', adminExtendedController.deleteMediaQueryOrParam);

// Settings
router.get('/settings', adminController.getPlatformSettings);
router.put('/settings', adminController.updatePlatformSettings);
router.patch('/settings', adminController.updatePlatformSettings);

// Audit & Impersonation
router.get('/audit', adminController.getAudit);
router.post('/audit', adminController.postAudit);
router.get('/audit-logs', adminController.getAuditLogs);
router.post('/impersonate', adminController.impersonateCandidate);
router.delete('/impersonate', adminController.stopImpersonation);

// Wallet Transactions
router.get('/wallet-transactions', adminController.getWalletTransactions);
router.patch('/wallet-transactions', adminExtendedController.updateWalletTransaction);
router.patch('/wallet-transactions/:id', adminExtendedController.updateWalletTransaction);

// Job Reports & Support Tickets
router.get('/reports', adminExtendedController.getJobReportsExtended);
router.get('/job-reports', adminExtendedController.getJobReportsExtended);
router.put('/reports/:id', adminController.updateJobReportStatus);
router.put('/job-reports/:id', adminController.updateJobReportStatus);
router.patch('/job-reports', adminExtendedController.patchJobReport);
router.patch('/job-reports/:id', adminExtendedController.patchJobReport);
router.get('/support-tickets', adminExtendedController.getSupportTickets);
router.patch('/support-tickets', adminExtendedController.updateSupportTicket);
router.patch('/support-tickets/:id', adminExtendedController.updateSupportTicket);

// Deadlines, Monitoring, Changes & Notifications
router.get('/deadlines', adminExtendedController.getDeadlines);
router.post('/monitoring/run', adminExtendedController.runMonitoring);
router.get('/circular-changes', adminExtendedController.getCircularChanges);
router.post('/circular-changes', adminExtendedController.createCircularChange);
router.post('/circular-changes/:id/apply', adminExtendedController.resolveCircularChange);
router.post('/circular-changes/:id/dismiss', adminExtendedController.resolveCircularChange);
router.get('/notifications/deliveries', adminExtendedController.getNotificationDeliveries);
router.post('/notifications/send', adminExtendedController.sendNotification);

// Content Studio
router.get('/content-studio/queue', adminExtendedController.getContentStudioQueue);
router.get('/content-studio/state', adminExtendedController.getContentStudioState);
router.post('/content-studio/generate', adminExtendedController.generateContentStudio);
router.post('/content-studio/validate', adminExtendedController.validateContentStudio);
router.post('/content-studio/approve', adminExtendedController.approveContentStudio);
router.get('/content-studio/revisions', adminExtendedController.getContentStudioRevisions);

// Featured Jobs, Job Feeds, Job Matching & Publishing
router.get('/featured-jobs', adminExtendedController.getFeaturedJobs);
router.post('/featured-jobs', adminExtendedController.createFeaturedJob);
router.delete('/featured-jobs/:id', adminExtendedController.deleteFeaturedJob);
router.get('/job-feeds', adminExtendedController.getJobFeeds);
router.post('/job-feeds', adminExtendedController.upsertJobFeed);
router.patch('/job-feeds/:id', adminExtendedController.upsertJobFeed);
router.delete('/job-feeds/:id', adminExtendedController.deleteJobFeed);
router.post('/job-feeds/rebuild', adminExtendedController.rebuildJobFeeds);
router.get('/job-matching/config', adminExtendedController.getMatchingConfig);
router.put('/job-matching/config', adminExtendedController.updateMatchingConfig);
router.patch('/job-matching/config', adminExtendedController.updateMatchingConfig);
router.get('/job-matching/health', adminExtendedController.getMatchingConfig);
router.post('/job-matching/rebuild', adminExtendedController.rebuildMatching);
router.get('/publishing/queue', adminExtendedController.getPublishingData);
router.post('/publishing/schedule', adminExtendedController.schedulePublishing);
router.post('/publishing/publish', adminExtendedController.schedulePublishing);
router.get('/publishing/redirects', adminExtendedController.manageRedirects);
router.post('/publishing/redirects', adminExtendedController.manageRedirects);
router.delete('/publishing/redirects', adminExtendedController.manageRedirects);
router.delete('/publishing/redirects/:id', adminExtendedController.manageRedirects);
router.get('/publishing/seo', adminExtendedController.getPublishingData);

// Real Analytics, Automation, Governance, Search & Operations
router.get('/analytics/overview', adminExtendedController.getAnalyticsOverview);
router.get('/analytics/data-quality', adminExtendedController.getAnalyticsOverview);
router.get('/search/analytics', adminExtendedController.getSearchAnalytics);
router.get('/governance/search', adminExtendedController.getSearchAnalytics);
router.get('/automation/overview', adminExtendedController.getAutomationOverview);
router.get('/automation/rules', adminExtendedController.getAutomationOverview);
router.get('/automation/tasks', adminController.getAutomationTasks);
router.post('/automation/tasks', adminController.postAutomationTasks);
router.patch('/automation/tasks', adminController.patchAutomationTasks);
router.get('/governance/overview', adminExtendedController.getGovernanceOverview);
router.get('/governance/health', adminExtendedController.getGovernanceOverview);
router.get('/operations/expenses', adminExtendedController.getOperationsOverview);
router.post('/operations/expenses', adminExtendedController.addExpense);
router.delete('/operations/expenses', adminExtendedController.deleteExpense);
router.delete('/operations/expenses/:id', adminExtendedController.deleteExpense);
router.get('/operations/budget', adminExtendedController.getOperationsOverview);
router.post('/operations/budget', adminExtendedController.updateBudget);
router.get('/operations/usage', adminExtendedController.getOperationsOverview);

// Staff & Roles Management
router.get('/staff', adminExtendedController.getStaffMembers);
router.post('/staff', adminExtendedController.createStaffMember);
router.delete('/staff/:id', adminExtendedController.deleteStaffMember);

// Dynamic Content, Exam, Review & Organization CRUD
router.use('/', adminContentRouter);

export const adminRoutes = router;
