import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prisma } from '../src/app/lib/prisma';
import { UserRole, UserStatus, JobStatus, ApplicationStatus, DocumentType } from '../src/generated/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseBengaliDate(dateStr?: string): Date {
  if (!dateStr) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let norm = String(dateStr);
  bnDigits.forEach((d, idx) => { norm = norm.split(d).join(String(idx)); });
  const direct = Date.parse(norm);
  if (!isNaN(direct)) return new Date(direct);

  const monthMap: Record<string, string> = {
    'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04',
    'মে': '05', 'জুন': '06', 'জুলাই': '07', 'আগস্ট': '08',
    'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12'
  };
  for (const [bnMonth, numMonth] of Object.entries(monthMap)) {
    if (norm.includes(bnMonth)) {
      const match = norm.match(/(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
      if (match) {
        const day = match[1].padStart(2, '0');
        const year = match[3];
        return new Date(`${year}-${numMonth}-${day}T23:59:59.000Z`);
      }
    }
  }
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

const catMap: Record<string, string> = {
  'govt': 'cat-govt',
  'bank': 'cat-bank',
  'teacher': 'cat-teacher',
  'health': 'cat-health',
  'it': 'cat-it',
  'engineer': 'cat-engineer',
  'defense': 'cat-defense',
  'ngo': 'cat-ngo',
  'private': 'cat-private',
  'company': 'cat-private',
  'international': 'cat-international',
};

async function main() {
  const archiveJsonPath = path.join(__dirname, '../_legacy_archive/db/local_store.json');
  const clientJsonPath = path.join(__dirname, '../../client-master-portal/src/db/local_store.json');
  const legacyJsonPath = path.join(__dirname, '../src/db/local_store.json');
  const jsonPath = fs.existsSync(clientJsonPath) ? clientJsonPath : (fs.existsSync(archiveJsonPath) ? archiveJsonPath : legacyJsonPath);
  if (!fs.existsSync(jsonPath)) {
    console.log('No local_store.json found to migrate.');
    return;
  }

  console.log(`Reading ${jsonPath} for migration to Neon PostgreSQL...`);
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // 1. Categories
  const categories = Object.values(data.categories || {});
  console.log(`Migrating ${categories.length} categories...`);
  for (const cat of categories as any[]) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {
        slug: cat.slug || cat.id,
        titleBn: cat.name_bn || cat.titleBn || 'ক্যাটাগরি',
        titleEn: cat.name_en || cat.titleEn || cat.slug,
        icon: cat.icon || null,
        orderIndex: cat.display_order || 0,
      },
      create: {
        id: cat.id,
        slug: cat.slug || cat.id,
        titleBn: cat.name_bn || cat.titleBn || 'ক্যাটাগরি',
        titleEn: cat.name_en || cat.titleEn || cat.slug,
        icon: cat.icon || null,
        orderIndex: cat.display_order || 0,
      },
    });
  }

  // 2. Candidates
  const candidates = Object.values(data.candidates || {});
  console.log(`Migrating ${candidates.length} candidates...`);
  for (const c of candidates as any[]) {
    if (!c.email && !c.username) continue;
    const cleanEmail = (c.email || `usr_${c.id}@placeholder.com`).toLowerCase().trim();
    const cleanUsername = (c.username || c.id || `usr_${Date.now()}`).toLowerCase().trim();

    const candidate = await prisma.candidate.upsert({
      where: { id: c.id },
      update: {
        email: cleanEmail,
        name: c.name || c.nameBn || 'প্রার্থী',
        nameBn: c.nameBn || null,
        phone: c.phone || null,
        username: cleanUsername,
        passwordHash: c.passwordHash || 'default_hash',
        role: c.role === 'admin' ? UserRole.ADMIN : UserRole.CANDIDATE,
        isEmailVerified: !!c.isEmailVerified,
        walletBalance: Number(c.walletBalance) || 0,
        district: c.district || null,
        division: c.division || null,
        avatarUrl: c.photoUrl || null,
      },
      create: {
        id: c.id,
        email: cleanEmail,
        name: c.name || c.nameBn || 'প্রার্থী',
        nameBn: c.nameBn || null,
        phone: c.phone || null,
        username: cleanUsername,
        passwordHash: c.passwordHash || 'default_hash',
        role: c.role === 'admin' ? UserRole.ADMIN : UserRole.CANDIDATE,
        isEmailVerified: !!c.isEmailVerified,
        walletBalance: Number(c.walletBalance) || 0,
        district: c.district || null,
        division: c.division || null,
        avatarUrl: c.photoUrl || null,
      },
    });

    // Migrate educations
    if (Array.isArray(c.education)) {
      for (const edu of c.education) {
        if (!edu.level && !edu.degree) continue;
        await prisma.educationRecord.create({
          data: {
            candidateId: candidate.id,
            level: edu.level || 'SSC',
            examTitle: edu.degree || edu.examTitle || 'পরীক্ষা',
            boardUniversity: edu.boardOrUni || edu.board || null,
            institute: edu.institute || null,
            rollNumber: edu.roll ? String(edu.roll) : null,
            regNumber: edu.reg ? String(edu.reg) : null,
            passingYear: parseInt(edu.year || '2020') || 2020,
            resultType: edu.result || 'GPA',
            groupMajor: edu.majorSubject || null,
          },
        }).catch(() => {});
      }
    }
  }

  // 3. Job Circulars
  const jobs = Object.values(data.jobs || {});
  console.log(`Migrating ${jobs.length} jobs...`);
  for (const j of jobs as any[]) {
    const slug = j.slug || j.id;
    const deadlineDate = parseBengaliDate(j.deadline);
    const categoryId = catMap[j.category] || (j.category?.startsWith('cat-') ? j.category : null);
    const positions = (Array.isArray(j.positions) && j.positions.length > 0)
      ? j.positions
      : [{
          title: j.title || 'অফিসার',
          grade: j.grade || '১০ম গ্রেড',
          posts: Number(j.totalPosts) || 1,
          salary: j.salary || 'জাতীয় বেতন স্কেল',
          minEducation: j.minEducation || 'স্নাতক',
          govtFee: Number(j.govtFee) || 0,
        }];

    await prisma.jobCircular.upsert({
      where: { id: j.id },
      update: {
        slug,
        title: j.title || 'চাকরির বিজ্ঞপ্তি',
        titleBn: j.title || null,
        organization: j.organization || 'সরকারি সংস্থা',
        organizationSlug: j.organizationEn ? j.organizationEn.toLowerCase().replace(/[^a-z0-9]/g, '-') : null,
        categoryId,
        deadline: deadlineDate,
        totalPositions: Number(j.totalPosts) || positions.reduce((acc: number, p: any) => acc + (Number(p.posts) || 0), 0) || 1,
        officialFee: Number(j.govtFee) || 0,
        serviceFee: Number(j.serviceFee) || 50,
        sourceUrl: j.officialLink || j.applicationUrl || null,
        officialPdfUrl: j.pdfUrl || j.circularPdfUrl || null,
        bannerUrl: j.logo || null,
        positions,
        eligibility: {
          minAge: j.minAge,
          maxAge: j.maxAge,
          districts: j.districts,
          education: j.minEducation,
        },
        status: JobStatus.PUBLISHED,
      },
      create: {
        id: j.id,
        slug,
        title: j.title || 'চাকরির বিজ্ঞপ্তি',
        titleBn: j.title || null,
        organization: j.organization || 'সরকারি সংস্থা',
        organizationSlug: j.organizationEn ? j.organizationEn.toLowerCase().replace(/[^a-z0-9]/g, '-') : null,
        categoryId,
        deadline: deadlineDate,
        totalPositions: Number(j.totalPosts) || positions.reduce((acc: number, p: any) => acc + (Number(p.posts) || 0), 0) || 1,
        officialFee: Number(j.govtFee) || 0,
        serviceFee: Number(j.serviceFee) || 50,
        sourceUrl: j.officialLink || j.applicationUrl || null,
        officialPdfUrl: j.pdfUrl || j.circularPdfUrl || null,
        bannerUrl: j.logo || null,
        positions,
        eligibility: {
          minAge: j.minAge,
          maxAge: j.maxAge,
          districts: j.districts,
          education: j.minEducation,
        },
        status: JobStatus.PUBLISHED,
      },
    }).catch(err => console.error(`Job ${j.id} failed:`, err.message));
  }

  // 4. Applications
  const applicationsGroup = Object.values(data.applications || {});
  const flatApplications: any[] = [];
  for (const group of applicationsGroup) {
    if (Array.isArray(group)) {
      flatApplications.push(...group);
    }
  }
  console.log(`Migrating ${flatApplications.length} applications...`);
  for (const app of flatApplications) {
    if (!app.candidateId || !app.jobId) continue;
    await prisma.applicationRequest.upsert({
      where: { id: app.id },
      update: {
        positionName: app.positionName || app.jobTitle || 'পদবি',
        trackingNumber: app.trackingNumber || `CS-${Math.floor(10000 + Math.random() * 90000)}`,
        status: app.status === 'COMPLETED' ? ApplicationStatus.COMPLETED : ApplicationStatus.PENDING,
        govtFee: Number(app.govtFee) || 0,
        serviceFee: Number(app.serviceFee) || 50,
        totalPaid: Number(app.totalAmount || app.totalPaid) || 50,
        applicantCopyPdfUrl: app.applicantCopyPdfUrl || null,
        teletalkUserId: app.teletalkUserId || null,
      },
      create: {
        id: app.id,
        candidateId: app.candidateId,
        jobId: app.jobId,
        positionName: app.positionName || app.jobTitle || 'পদবি',
        trackingNumber: app.trackingNumber || `CS-${Math.floor(10000 + Math.random() * 90000)}`,
        status: app.status === 'COMPLETED' ? ApplicationStatus.COMPLETED : ApplicationStatus.PENDING,
        govtFee: Number(app.govtFee) || 0,
        serviceFee: Number(app.serviceFee) || 50,
        totalPaid: Number(app.totalAmount || app.totalPaid) || 50,
        applicantCopyPdfUrl: app.applicantCopyPdfUrl || null,
        teletalkUserId: app.teletalkUserId || null,
      },
    }).catch(() => {});
  }

  // 5. Pages
  const pages = Object.values(data.pages || {});
  console.log(`Migrating ${pages.length} pages...`);
  for (const p of pages as any[]) {
    await prisma.pageRecord.upsert({
      where: { id: p.id },
      update: {
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle || null,
        metaDescription: p.metaDescription || null,
        sections: Array.isArray(p.sections) ? p.sections : [],
        isSystemPage: !!p.isSystemPage,
      },
      create: {
        id: p.id,
        slug: p.slug,
        title: p.title,
        metaTitle: p.metaTitle || null,
        metaDescription: p.metaDescription || null,
        sections: Array.isArray(p.sections) ? p.sections : [],
        isSystemPage: !!p.isSystemPage,
      },
    }).catch(() => {});
  }

  console.log('✅ Migration to Neon PostgreSQL completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
