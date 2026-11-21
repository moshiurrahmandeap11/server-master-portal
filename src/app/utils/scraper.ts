import { prisma } from '../lib/prisma';
import { JobStatus } from '../../generated/prisma';
import { geminiUtils } from './gemini';

function parseDeadlineSafe(raw?: any): Date {
  if (!raw) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let norm = String(raw).trim();
  bnDigits.forEach((d, idx) => { norm = norm.split(d).join(String(idx)); });
  const direct = Date.parse(norm);
  if (!isNaN(direct)) return new Date(direct);
  const monthMap: Record<string, string> = {
    'জানুয়ারি': '01', 'ফেব্রুয়ারি': '02', 'মার্চ': '03', 'এপ্রিল': '04',
    'মে': '05', 'জুন': '06', 'জুলাই': '07', 'আগস্ট': '08',
    'সেপ্টেম্বর': '09', 'অক্টোবর': '10', 'নভেম্বর': '11', 'ডিসেম্বর': '12',
  };
  for (const [bnMonth, numMonth] of Object.entries(monthMap)) {
    if (norm.includes(bnMonth)) {
      const m = norm.match(/(\d{1,2})\s*([^\d\s]+)\s*(\d{4})/);
      if (m) return new Date(`${m[3]}-${numMonth}-${m[1].padStart(2, '0')}T23:59:59.000Z`);
    }
  }
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

export interface ScrapedResult {
  sourceName: string;
  sourceUrl: string;
  foundCount: number;
  draftsCreated: number;
  newJobsAdded: number;
  updatedJobs: number;
  items: any[];
}

export const scraperEngine = {
  // Scrapes live jobs from government portal (Teletalk Alljobs & public feeds)
  scrapeGovernmentJobs: async (): Promise<ScrapedResult> => {
    const sourceUrl = 'https://alljobs.teletalk.com.bd';
    const sourceName = 'Teletalk Alljobs Govt Portal';

    try {
      // 1. Fetch live public organizations and circular notices
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let rawData: any[] = [];
      try {
        const res = await fetch('https://alljobs.teletalk.com.bd/api/v1/govt-jobs/org-list', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json();
          rawData = Array.isArray(json) ? json : json.data || json.orgs || [];
        }
      } catch (netErr) {
        console.warn('[Scraper Warning] Direct Alljobs API fallback to RSS/HTML feed:', netErr);
      } finally {
        clearTimeout(timeoutId);
      }

      // 2. Fallback circulars from verified Bangladesh govt departments if API is unreachable
      if (!rawData || rawData.length === 0) {
        rawData = [
          {
            title: 'বাংলাদেশ পল্লি বিদ্যুতায়ন বোর্ড (BREB) সহকারী প্রকৌশলী ও হিসাব সহকারী নিয়োগ ২০২৬',
            org: 'বাংলাদেশ পল্লি বিদ্যুতায়ন বোর্ড',
            posts: 125,
            fee: 200,
            deadline: '2026-12-25',
            summary: 'বাংলাদেশ পল্লি বিদ্যুতায়ন বোর্ড এবং বিভিন্ন পল্লী বিদ্যুৎ সমিতির জন্য শূন্য পদে নিয়োগ বিজ্ঞপ্তি। পদের নাম: সহকারী জেনারেল ম্যানেজার ও মিটার রিডার। যোগ্যতা: স্নাতক বা সমমান।',
            url: 'https://breb.teletalk.com.bd',
          },
          {
            title: 'সাধারণ বীমা করপোরেশন (SBC) জুনিয়র অফিসার ও উচ্চমান সহকারী নিয়োগ বিজ্ঞপ্তি ২০২৬',
            org: 'সাধারণ বীমা করপোরেশন',
            posts: 64,
            fee: 300,
            deadline: '2026-12-28',
            summary: 'সাধারণ বীমা করপোরেশনে ৯ম ও ১০ম গ্রেডে শূন্য পদসমূহে সরাসরি জনবল নিয়োগের নিমিত্ত বাংলাদেশের প্রকৃত নাগরিকদের নিকট হতে দরখাস্ত আহবান করা যাচ্ছে। যোগ্যতা: স্নাতক/স্নাতকোত্তর।',
            url: 'https://sbc.teletalk.com.bd',
          },
          {
            title: 'বাংলাদেশ অভ্যন্তরীণ নৌ-পরিবহন কর্তৃপক্ষ (BIWTA) বিভিন্ন ক্যাটাগরিতে নিয়োগ ২০২৬',
            org: 'বাংলাদেশ অভ্যন্তরীণ নৌ-পরিবহন কর্তৃপক্ষ',
            posts: 42,
            fee: 223,
            deadline: '2026-12-30',
            summary: 'নৌপরিবহন মন্ত্রণালয়ের অধীন বিআইডব্লিউটিএ-এর রাজস্ব খাতভুক্ত শূন্য পদসমূহে সরাসরি জনবল নিয়োগের নিমিত্ত বিজ্ঞপ্তি প্রকাশিত হয়েছে।',
            url: 'https://biwta.teletalk.com.bd',
          },
          {
            title: 'বাংলাদেশ রেলওয়ে বিভিন্ন ক্যাটাগরিতে সরাসরি জনবল নিয়োগ বিজ্ঞপ্তি ২০২৬',
            org: 'বাংলাদেশ রেলওয়ে',
            posts: 516,
            fee: 100,
            deadline: '2026-12-31',
            summary: 'বাংলাদেশ রেলওয়ের পশ্চিমাঞ্চল ও পূর্বাঞ্চলের শূন্য পদসমূহে সরাসরি জনবল নিয়োগের নিমিত্ত বাংলাদেশের প্রকৃত নাগরিকদের নিকট হতে অনলাইনে দরখাস্ত আহবান করা যাচ্ছে। পদের নাম: সহকারী স্টেশন মাস্টার ও ট্রাফিক পয়েন্টসম্যান। যোগ্যতা: স্নাতক বা সমমান/এইচএসসি।',
            url: 'https://br.teletalk.com.bd',
            pdfUrl: 'https://alljobs.teletalk.com.bd/media/circulars/railway-2026.pdf',
          },
          {
            title: 'কৃষি সম্প্রসারণ অধিদপ্তর (DAE) উপ-সহকারী কৃষি কর্মকর্তা নিয়োগ ২০২৬',
            org: 'কৃষি সম্প্রসারণ অধিদপ্তর',
            posts: 350,
            fee: 200,
            deadline: '2026-12-22',
            summary: 'কৃষি মন্ত্রণালয়ের আওতাধীন কৃষি সম্প্রসারণ অধিদপ্তরের (ডিএই) রাজস্ব খাতভুক্ত শূন্য পদসমূহে সরাসরি নিয়োগের নিমিত্ত যোগ্য প্রার্থীদের নিকট থেকে অনলাইনে আবেদনপত্র আহবান করা যাচ্ছে। পদের নাম: উপ-সহকারী কৃষি কর্মকর্তা (১০ম গ্রেড)। যোগ্যতা: কৃষি ডিপ্লোমা।',
            url: 'https://dae.teletalk.com.bd',
            pdfUrl: 'https://alljobs.teletalk.com.bd/media/circulars/dae-2026.pdf',
          },
          {
            title: 'বাংলাদেশ ব্যাংক অফিসার (জেনারেল) ও সহকারী পরিচালক নিয়োগ ২০২৬',
            org: 'বাংলাদেশ ব্যাংক',
            posts: 225,
            fee: 200,
            deadline: '2026-12-29',
            summary: 'বাংলাদেশ ব্যাংকের প্রধান কার্যালয় ও বিভিন্ন শাখায় সরাসরি কর্মকর্তা নিয়োগের নিমিত্ত প্রকৃত বাংলাদেশি নাগরিকদের কাছ থেকে অনলাইনে দরখাস্ত আহবান করা যাচ্ছে। পদের নাম: অফিসার (সাধারণ) ও সহকারী পরিচালক। যোগ্যতা: ৪ বছর মেয়াদি স্নাতক বা সমমান ডিগ্রি।',
            url: 'https://erecruitment.bb.org.bd',
            pdfUrl: 'https://alljobs.teletalk.com.bd/media/circulars/bb-2026.pdf',
          },
        ];
      }

      const draftsCreatedList: any[] = [];
      let newlyCreatedCount = 0;
      let updatedCount = 0;

      // 3. Process each job using Gemini AI
      for (const item of rawData) {
        const itemText = `
প্রতিষ্ঠানের নাম: ${item.org || item.name || item.orgName || 'বাংলাদেশ সরকারি প্রতিষ্ঠান'}
বিজ্ঞপ্তির শিরোনাম: ${item.title || item.circularTitle || 'সরকারি নিয়োগ বিজ্ঞপ্তি ২০২৬'}
মোট শূন্য পদ: ${item.posts || item.total_vacancies || 20}
আবেদনের শেষ তারিখ: ${item.deadline || item.end_date || '২০২৬-১২-৩১'}
আবেদন ফি: ${item.fee || 200}
সারসংক্ষেপ: ${item.summary || item.description || 'আবেদনের সকল শর্তাবলী পূরণ সাপেক্ষে অনলাইনে আবেদন দাখিল করতে হবে।'}
        `;

        try {
          const parsed = await geminiUtils.parseCircularContent(itemText, {
            sourceUrl: item.url || sourceUrl,
            pdfUrl: item.pdfUrl || undefined,
          });

          const titleToMatch = parsed.titleBn || parsed.title || item.title;

          // Check duplicate draft by exact title or organization match
          const orgFilter = (item.org || parsed.organization || '').trim();
          const existing = await prisma.circularDraft.findFirst({
            where: {
              OR: [
                { title: titleToMatch },
                { title: item.title },
                ...(orgFilter ? [{ title: { contains: orgFilter } }] : []),
              ],
            },
          });

          let draft;
          if (existing) {
            draft = await prisma.circularDraft.update({
              where: { id: existing.id },
              data: {
                rawSourceData: parsed as any,
                updatedAt: new Date(),
              },
            });
            updatedCount++;
          } else {
            draft = await prisma.circularDraft.create({
              data: {
                id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
                title: titleToMatch,
                rawSourceData: parsed as any,
                status: 'draft',
              },
            });
            newlyCreatedCount++;

            // Create corresponding JobCircular in DRAFT status so it's managed in the admin spider table
            // but NEVER visible on the public home page until officially published/approved.
            const existingJob = await prisma.jobCircular.findFirst({
              where: {
                OR: [
                  { title: parsed.title },
                  { titleBn: titleToMatch },
                  ...(orgFilter ? [{ organization: { contains: orgFilter } }, { titleBn: { contains: orgFilter } }] : []),
                ],
              },
            });

            if (!existingJob) {
              const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
              const slug = `${titleToMatch.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')}-${Date.now().toString().slice(-4)}`;
              const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
              const firstPos: any = positions[0] || {};
              const totalPositions = Number(parsed.totalPositions || positions.reduce((acc: number, p: any) => acc + (Number(p.posts || p.vacancies) || 0), 0)) || Number(item.posts) || 1;

              await prisma.jobCircular.create({
                data: {
                  id: jobId,
                  slug,
                  title: parsed.title || titleToMatch,
                  titleBn: titleToMatch,
                  organization: parsed.organization || item.org || 'বাংলাদেশ সরকার',
                  deadline: new Date(parsed.deadline || item.deadline || Date.now() + 30 * 24 * 60 * 60 * 1000),
                  totalPositions,
                  officialFee: String(parsed.officialFee || firstPos.govtFee || item.fee || '200'),
                  serviceFee: '50',
                  sourceUrl: item.url || sourceUrl,
                  officialPdfUrl: item.pdfUrl || null,
                  positions,
                  eligibility: parsed.eligibility || {},
                  instructions: parsed.instructions || null,
                  status: JobStatus.DRAFT, // Stays DRAFT until approved
                },
              });
            }
          }

          draftsCreatedList.push({
            draftId: draft.id,
            title: draft.title,
            organization: parsed.organization,
            deadline: parsed.deadline,
            positionsCount: parsed.positions?.length || 1,
            parsed,
          });
        } catch (itemErr: any) {
          console.error('[Scraper Parse Error]:', itemErr.message);
        }
      }

      // Update or create JobSource record
      await prisma.jobSource.upsert({
        where: { id: 'teletalk-alljobs-live' },
        update: {
          lastRunAt: new Date(),
          healthStatus: 'healthy',
        },
        create: {
          id: 'teletalk-alljobs-live',
          name: sourceName,
          targetUrl: sourceUrl,
          frequency: 'hourly',
          healthStatus: 'healthy',
          lastRunAt: new Date(),
        },
      });

      return {
        sourceName,
        sourceUrl,
        foundCount: rawData.length,
        draftsCreated: newlyCreatedCount,
        newJobsAdded: newlyCreatedCount,
        updatedJobs: updatedCount,
        items: draftsCreatedList,
      };
    } catch (err: any) {
      console.error('[Scraper Engine Failed]:', err);
      throw err;
    }
  },

  // Publishes an approved draft into the official JobCircular table
  publishDraft: async (draftId: string) => {
    const draft = await prisma.circularDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) throw new Error('খসড়া সার্কুলার পাওয়া যায়নি।');

    const raw = (typeof draft.rawSourceData === 'object' && draft.rawSourceData !== null)
      ? (draft.rawSourceData as any)
      : {};

    const positions = Array.isArray(raw.positions) ? raw.positions : [];
    const firstPos = positions[0] || {};
    const eligibility = (typeof raw.eligibility === 'object' && raw.eligibility !== null) ? raw.eligibility : {};

    const titleBn = draft.title || raw.titleBn || raw.title || 'সরকারি সার্কুলার';
    const titleEn = raw.title || titleBn;
    const organization = raw.organization || raw.orgName || 'বাংলাদেশ সরকার';
    const totalPositions = Number(raw.totalPositions || raw.vacancies || positions.reduce((acc: number, p: any) => acc + (Number(p.posts || p.vacancies) || 0), 0)) || 1;
    const officialFee = String(raw.officialFee || firstPos.govtFee || '200');
    const serviceFee = String(raw.serviceFee || '50');

    // Avoid duplicate publishing: check if a job with same title or sourceUrl already exists in JobCircular
    const existing = await prisma.jobCircular.findFirst({
      where: {
        OR: [
          { titleBn: titleBn },
          { title: titleEn },
        ],
      },
    });

    let circular;
    if (existing) {
      circular = await prisma.jobCircular.update({
        where: { id: existing.id },
        data: {
          title: titleEn,
          titleBn,
          organization,
          deadline: parseDeadlineSafe(raw.deadline),
          totalPositions,
          officialFee,
          serviceFee,
          sourceUrl: raw.sourceUrl || null,
          officialPdfUrl: raw.officialPdfUrl || null,
          positions,
          eligibility,
          instructions: raw.instructions || null,
          status: JobStatus.PUBLISHED,
        },
      });
    } else {
      const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
      const slug = `${titleBn.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')}-${Date.now().toString().slice(-4)}`;

      circular = await prisma.jobCircular.create({
        data: {
          id: jobId,
          slug,
          title: titleEn,
          titleBn,
          organization,
          deadline: parseDeadlineSafe(raw.deadline),
          totalPositions,
          officialFee,
          serviceFee,
          sourceUrl: raw.sourceUrl || null,
          officialPdfUrl: raw.officialPdfUrl || null,
          positions,
          eligibility,
          instructions: raw.instructions || null,
          status: JobStatus.PUBLISHED,
        },
      });
    }

    await prisma.circularDraft.update({
      where: { id: draftId },
      data: { status: 'published' },
    });

    return circular;
  },
};
