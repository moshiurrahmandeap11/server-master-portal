import { prisma } from '../src/app/lib/prisma';

async function purgeDummyData() {
  console.log('--- STARTING SAFE DUMMY DATA PURGE ---');

  // Pre-purge counts
  const beforeStats = {
    candidates: await prisma.candidate.count(),
    jobs: await prisma.jobCircular.count(),
    applications: await prisma.applicationRequest.count(),
    drafts: await prisma.circularDraft.count(),
    categories: await prisma.category.count(),
  };
  console.log('Before purge stats:', beforeStats);

  // 1. Delete all dummy applications
  const deletedApps = await prisma.applicationRequest.deleteMany({});
  console.log(`Deleted ${deletedApps.count} application requests.`);

  // 2. Delete all dummy saved jobs & reminders if any
  try {
    await prisma.savedJob.deleteMany({});
    await prisma.userJobReminder.deleteMany({});
  } catch (e: any) {
    console.warn('Note on saved jobs/reminders:', e.message);
  }

  // 3. Delete all dummy jobs
  const deletedJobs = await prisma.jobCircular.deleteMany({});
  console.log(`Deleted ${deletedJobs.count} job circulars.`);

  // 4. Delete all dummy drafts
  const deletedDrafts = await prisma.circularDraft.deleteMany({});
  console.log(`Deleted ${deletedDrafts.count} circular drafts.`);

  // 5. Delete synthetic candidates
  const preserveIds = [
    'ADMIN-SUPER',
    'USR-MWDDQGXF-BD2E1F',
    'c75a94c4-11a5-45c0-8545-86187f5e7a62',
    '3ee62856-0224-4ca1-ba71-48a91b6b9aff',
  ];
  const preserveEmails = [
    'admin@chakrisheba.com',
    'moshiurrahmandeap@gmail.com',
    'moshiurbhau@gmail.com',
    'moshiur.tester2026@gmail.com',
  ];

  const deletedCandidates = await prisma.candidate.deleteMany({
    where: {
      AND: [
        { id: { notIn: preserveIds } },
        { email: { notIn: preserveEmails } },
      ],
    },
  });
  console.log(`Deleted ${deletedCandidates.count} synthetic test candidates.`);

  // Post-purge counts
  const afterStats = {
    candidates: await prisma.candidate.count(),
    jobs: await prisma.jobCircular.count(),
    applications: await prisma.applicationRequest.count(),
    drafts: await prisma.circularDraft.count(),
    categories: await prisma.category.count(),
  };
  console.log('After purge stats:', afterStats);

  const remainingCandidates = await prisma.candidate.findMany({
    select: { id: true, email: true, name: true, role: true },
  });
  console.log('Preserved accounts:', remainingCandidates);
  console.log('--- PURGE COMPLETED SUCCESSFULLY ---');
}

purgeDummyData()
  .catch((err) => {
    console.error('Purge error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
