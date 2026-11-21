import { prisma } from '../lib/prisma';
import { JobStatus } from '../../generated/prisma';
import { geminiUtils } from './gemini';

function normalizeDecimalString(val: any, fallback = '0'): string {
  const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  let s = String(val ?? '').trim();
  bnDigits.forEach((d, idx) => { s = s.split(d).join(String(idx)); });
  const match = s.match(/\d+(?:\.\d+)?/);
  return match ? match[0] : fallback;
}

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

export interface NormalizedRawJob {
  title: string;
  org: string;
  posts?: number;
  fee?: number;
  deadline?: string;
  summary?: string;
  url: string;
  pdfUrl?: string;
}

export interface PortalSourceDef {
  id: string;
  name: string;
  orgNameBn: string;
  targetUrl: string;
  type: 'teletalk-json' | 'national-portal-html';
  trustScore: number;
}

export const OFFICIAL_PORTAL_SOURCES: PortalSourceDef[] = [
  {
    id: 'teletalk-alljobs-live',
    name: 'Teletalk Alljobs Govt Portal',
    orgNameBn: 'টেলিটক অলজবস সরকারি পোর্টাল',
    targetUrl: 'https://alljobs.teletalk.com.bd/api/v1/govt-jobs/org-list',
    type: 'teletalk-json',
    trustScore: 98,
  },
  {
    id: 'bpsc-notices-live',
    name: 'BPSC (বাংলাদেশ সরকারি কর্ম কমিশন)',
    orgNameBn: 'বাংলাদেশ সরকারি কর্ম কমিশন (বিপিএসসি)',
    targetUrl: 'https://bpsc.gov.bd/site/view/notices',
    type: 'national-portal-html',
    trustScore: 99,
  },
  {
    id: 'mopa-notices-live',
    name: 'MoPA (জনপ্রশাসন মন্ত্রণালয়)',
    orgNameBn: 'জনপ্রশাসন মন্ত্রণালয়',
    targetUrl: 'https://mopa.gov.bd/site/view/notices',
    type: 'national-portal-html',
    trustScore: 97,
  },
  {
    id: 'dghs-notices-live',
    name: 'DGHS (স্বাস্থ্য অধিদপ্তর)',
    orgNameBn: 'স্বাস্থ্য অধিদপ্তর (DGHS)',
    targetUrl: 'https://dghs.gov.bd/site/view/notices',
    type: 'national-portal-html',
    trustScore: 96,
  },
  {
    id: 'railway-notices-live',
    name: 'Bangladesh Railway (বাংলাদেশ রেলওয়ে)',
    orgNameBn: 'বাংলাদেশ রেলওয়ে',
    targetUrl: 'https://railway.gov.bd/site/view/notices',
    type: 'national-portal-html',
    trustScore: 96,
  },
];

export interface ScrapedResult {
  sourceName: string;
  sourceUrl: string;
  sourcesChecked?: number;
  foundCount: number;
  draftsCreated: number;
  newJobsAdded: number;
  updatedJobs: number;
  items: any[];
}

const MAX_NEW_ITEMS_PER_SOURCE = 3;

async function fetchWithTimeout(url: string, accept: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: accept,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchTeletalkJobs(source: PortalSourceDef): Promise<NormalizedRawJob[]> {
  const res = await fetchWithTimeout(source.targetUrl, 'application/json');
  if (!res.ok) return [];
  const json: any = await res.json();
  const orgList: any[] = Array.isArray(json)
    ? json
    : json.govtOrgJobs || json.data || json.orgs || [];

  const normalized: NormalizedRawJob[] = [];
  for (const org of orgList) {
    const orgName = org.name_bn || org.name || org.orgName || source.orgNameBn;
    const orgWebsite = org.website || source.targetUrl;
    const nestedJobs: any[] = Array.isArray(org.govt_jobs) ? org.govt_jobs : [org];

    for (const j of nestedJobs) {
      const title = j.job_title || j.title || j.circularTitle;
      if (!title) continue;
      normalized.push({
        title: String(title).trim(),
        org: String(orgName).trim(),
        posts: Number(j.total_vacancies || j.posts || 1) || 1,
        fee: Number(j.fee || j.application_fee || 200) || 200,
        deadline: j.end_date || j.deadline || j.application_end_date || undefined,
        summary: j.summary || j.description || `${orgName} এর অধীনে ${title} পদে নিয়োগ বিজ্ঞপ্তি।`,
        url: j.apply_url || orgWebsite,
        pdfUrl: j.circular_pdf || j.pdfUrl || undefined,
      });
    }
  }
  return normalized;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchNationalPortalNotices(source: PortalSourceDef): Promise<NormalizedRawJob[]> {
  const res = await fetchWithTimeout(source.targetUrl, 'text/html');
  if (!res.ok) return [];
  const html = await res.text();
  const origin = new URL(source.targetUrl).origin;

  const rows = html.match(/<tr[^>]*class="[^"]*table-tr[^"]*"[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const jobKeywords = /(নিয়োগ|নিয়োগ|বিজ্ঞপ্তি|পদে|পদসংখ্যা|সার্কুলার|circular|recruitment|vacancy|job)/i;
  const normalized: NormalizedRawJob[] = [];

  for (const row of rows) {
    const titleMatch = row.match(/<td[^>]*data-column="title"[^>]*>([\s\S]*?)<\/td>/i);
    if (!titleMatch) continue;
    const title = stripHtmlTags(titleMatch[1]);
    if (!title || !jobKeywords.test(title)) continue;

    const pdfMatch = row.match(/href="([^"]+\.pdf[^"]*)"/i);
    const linkMatch = row.match(/href="(\/pages\/notices\/[^"]+)"/i);
    const dateMatch = row.match(/<td[^>]*data-column="publish_date"[^>]*>([\s\S]*?)<\/td>/i);
    const pubDate = dateMatch ? stripHtmlTags(dateMatch[1]) : '';

    const pdfUrl = pdfMatch
      ? (pdfMatch[1].startsWith('http') ? pdfMatch[1] : `${origin}${pdfMatch[1]}`)
      : undefined;
    const detailUrl = linkMatch ? `${origin}${linkMatch[1]}` : source.targetUrl;

    normalized.push({
      title,
      org: source.orgNameBn,
      summary: `${source.orgNameBn} কর্তৃক প্রকাশিত নিয়োগ সংক্রান্ত বিজ্ঞপ্তি (${pubDate || 'সাম্প্রতিক'}): ${title}`,
      url: detailUrl,
      pdfUrl,
    });
  }
  return normalized;
}

async function ingestNormalizedItems(
  source: PortalSourceDef,
  rawItems: NormalizedRawJob[],
): Promise<{
  foundCount: number;
  draftsCreated: number;
  updatedJobs: number;
  items: any[];
}> {
  let newlyCreatedCount = 0;
  let updatedCount = 0;
  const processedItems: any[] = [];

  // Process up to MAX_NEW_ITEMS_PER_SOURCE fresh items so Gemini quota & response time stay optimal
  let geminiCalls = 0;

  for (const item of rawItems) {
    if (geminiCalls >= MAX_NEW_ITEMS_PER_SOURCE) break;

    const existingDraft = await prisma.circularDraft.findFirst({
      where: {
        OR: [
          { title: item.title },
          { title: { contains: item.title.slice(0, 45) } },
        ],
      },
    });

    if (existingDraft) {
      updatedCount++;
      continue;
    }

    geminiCalls++;
    const itemText = `
প্রতিষ্ঠানের নাম: ${item.org}
বিজ্ঞপ্তির শিরোনাম: ${item.title}
মোট শূন্য পদ: ${item.posts || 1}
আবেদনের শেষ তারিখ: ${item.deadline || 'বিজ্ঞপ্তি অনুযায়ী'}
আবেদন ফি: ${item.fee || 200}
উৎস লিংক: ${item.url}
পিডিএফ লিংক: ${item.pdfUrl || 'প্রযোজ্য নয়'}
সারসংক্ষেপ: ${item.summary || item.title}
    `;

    try {
      const parsed = await geminiUtils.parseCircularContent(itemText, {
        sourceUrl: item.url || source.targetUrl,
        pdfUrl: item.pdfUrl || undefined,
      });

      const titleToMatch = parsed.titleBn || parsed.title || item.title;
      const draft = await prisma.circularDraft.create({
        data: {
          id: `draft-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
          title: titleToMatch,
          rawSourceData: parsed as any,
          status: 'draft',
        },
      });
      newlyCreatedCount++;

      const existingJob = await prisma.jobCircular.findFirst({
        where: {
          OR: [{ title: parsed.title }, { titleBn: titleToMatch }],
        },
      });

      if (!existingJob) {
        const jobId = `job-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
        const slug = `${titleToMatch.toLowerCase().replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')}-${Date.now().toString().slice(-4)}`;
        const positions = Array.isArray(parsed.positions) ? parsed.positions : [];
        const firstPos: any = positions[0] || {};
        const totalPositions =
          Number(
            parsed.totalPositions ||
              positions.reduce((acc: number, p: any) => acc + (Number(p.posts || p.vacancies) || 0), 0),
          ) ||
          Number(item.posts) ||
          1;

        await prisma.jobCircular.create({
          data: {
            id: jobId,
            slug,
            title: parsed.title || titleToMatch,
            titleBn: titleToMatch,
            organization: parsed.organization || item.org,
            deadline: parseDeadlineSafe(parsed.deadline || item.deadline),
            totalPositions,
            officialFee: normalizeDecimalString(parsed.officialFee ?? firstPos.govtFee ?? item.fee, '200'),
            serviceFee: normalizeDecimalString(parsed.serviceFee, '50'),
            sourceUrl: item.url || source.targetUrl,
            officialPdfUrl: item.pdfUrl || null,
            positions,
            eligibility: parsed.eligibility || {},
            instructions: parsed.instructions || null,
            status: JobStatus.DRAFT,
          },
        });
      }

      processedItems.push({
        draftId: draft.id,
        source: source.name,
        title: draft.title,
        organization: parsed.organization || item.org,
        deadline: parsed.deadline,
        positionsCount: parsed.positions?.length || 1,
      });
    } catch (err: any) {
      console.error(`[Scraper Parse Error - ${source.id}]:`, err.message);
    }
  }

  return {
    foundCount: rawItems.length,
    draftsCreated: newlyCreatedCount,
    updatedJobs: updatedCount,
    items: processedItems,
  };
}

export const scraperEngine = {
  /** Ensures all 5 real Bangladesh job portal sources exist in the JobSource table. */
  ensureDefaultSources: async () => {
    for (const src of OFFICIAL_PORTAL_SOURCES) {
      await prisma.jobSource.upsert({
        where: { id: src.id },
        update: {
          name: src.name,
          targetUrl: src.targetUrl,
          type: src.type,
          trustScore: src.trustScore,
        },
        create: {
          id: src.id,
          name: src.name,
          targetUrl: src.targetUrl,
          type: src.type,
          frequency: 'hourly',
          isEnabled: true,
          trustScore: src.trustScore,
          healthStatus: 'healthy',
        },
      });
    }
  },

  /** Fetches & Gemini-parses a single official portal by sourceId. */
  scrapeSource: async (sourceId: string): Promise<ScrapedResult> => {
    await scraperEngine.ensureDefaultSources();
    const def = OFFICIAL_PORTAL_SOURCES.find((s) => s.id === sourceId);
    const dbSrc = await prisma.jobSource.findUnique({ where: { id: sourceId } });

    const target: PortalSourceDef = def || {
      id: sourceId,
      name: dbSrc?.name || sourceId,
      orgNameBn: dbSrc?.name || 'সরকারি প্রতিষ্ঠান',
      targetUrl: dbSrc?.targetUrl || '',
      type: dbSrc?.type === 'teletalk-json' ? 'teletalk-json' : 'national-portal-html',
      trustScore: dbSrc?.trustScore || 90,
    };

    if (!target.targetUrl) {
      return {
        sourceName: target.name,
        sourceUrl: '',
        foundCount: 0,
        draftsCreated: 0,
        newJobsAdded: 0,
        updatedJobs: 0,
        items: [],
      };
    }

    try {
      const rawItems =
        target.type === 'teletalk-json'
          ? await fetchTeletalkJobs(target)
          : await fetchNationalPortalNotices(target);

      const ingested = await ingestNormalizedItems(target, rawItems);

      await prisma.jobSource.update({
        where: { id: target.id },
        data: {
          lastRunAt: new Date(),
          healthStatus: rawItems.length > 0 ? 'healthy' : 'warning',
          lastError: rawItems.length > 0 ? null : 'কোনো চলমান বিজ্ঞপ্তি পাওয়া যায়নি।',
        },
      }).catch(() => {});

      return {
        sourceName: target.name,
        sourceUrl: target.targetUrl,
        sourcesChecked: 1,
        foundCount: ingested.foundCount,
        draftsCreated: ingested.draftsCreated,
        newJobsAdded: ingested.draftsCreated,
        updatedJobs: ingested.updatedJobs,
        items: ingested.items,
      };
    } catch (err: any) {
      await prisma.jobSource.update({
        where: { id: target.id },
        data: {
          lastRunAt: new Date(),
          healthStatus: 'unreachable',
          lastError: err?.message || 'Fetch failed',
        },
      }).catch(() => {});

      return {
        sourceName: target.name,
        sourceUrl: target.targetUrl,
        sourcesChecked: 1,
        foundCount: 0,
        draftsCreated: 0,
        newJobsAdded: 0,
        updatedJobs: 0,
        items: [],
      };
    }
  },

  /** Fetches & Gemini-parses ALL 5 active official websites directly via HTTP + Gemini API (no browser needed). */
  scrapeAllActiveSources: async (): Promise<ScrapedResult> => {
    await scraperEngine.ensureDefaultSources();
    const enabledSources = await prisma.jobSource.findMany({
      where: { isEnabled: true },
    });

    const sourceIds =
      enabledSources.length > 0
        ? enabledSources.map((s) => s.id)
        : OFFICIAL_PORTAL_SOURCES.map((s) => s.id);

    const results = await Promise.allSettled(
      sourceIds.map((id) => scraperEngine.scrapeSource(id)),
    );

    let foundCount = 0;
    let draftsCreated = 0;
    let updatedJobs = 0;
    const allItems: any[] = [];

    for (const r of results) {
      if (r.status === 'fulfilled') {
        foundCount += r.value.foundCount;
        draftsCreated += r.value.draftsCreated;
        updatedJobs += r.value.updatedJobs;
        allItems.push(...r.value.items);
      }
    }

    return {
      sourceName: `${sourceIds.length}টি সরকারি ও চাকরি পোর্টাল (Gemini AI)`,
      sourceUrl: 'multi-source://official-portals',
      sourcesChecked: sourceIds.length,
      foundCount,
      draftsCreated,
      newJobsAdded: draftsCreated,
      updatedJobs,
      items: allItems,
    };
  },

  // Backwards-compatible alias
  scrapeGovernmentJobs: async (): Promise<ScrapedResult> => {
    return await scraperEngine.scrapeAllActiveSources();
  },

  // Publishes an approved draft into the official JobCircular table
  publishDraft: async (draftId: string) => {
    const draft = await prisma.circularDraft.findUnique({
      where: { id: draftId },
    });

    if (!draft) throw new Error('খসড়া সার্কুলার পাওয়া যায়নি।');

    const raw =
      typeof draft.rawSourceData === 'object' && draft.rawSourceData !== null
        ? (draft.rawSourceData as any)
        : {};

    const positions = Array.isArray(raw.positions) ? raw.positions : [];
    const firstPos = positions[0] || {};
    const eligibility =
      typeof raw.eligibility === 'object' && raw.eligibility !== null ? raw.eligibility : {};

    const titleBn = draft.title || raw.titleBn || raw.title || 'সরকারি সার্কুলার';
    const titleEn = raw.title || titleBn;
    const organization = raw.organization || raw.orgName || 'বাংলাদেশ সরকার';
    const totalPositions =
      Number(
        raw.totalPositions ||
          raw.vacancies ||
          positions.reduce((acc: number, p: any) => acc + (Number(p.posts || p.vacancies) || 0), 0),
      ) || 1;
    const officialFee = normalizeDecimalString(raw.officialFee ?? firstPos.govtFee, '200');
    const serviceFee = normalizeDecimalString(raw.serviceFee, '50');

    const existing = await prisma.jobCircular.findFirst({
      where: {
        OR: [{ titleBn }, { title: titleEn }],
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
