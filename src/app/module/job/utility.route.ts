import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
import { checkAuth } from '../../middleware/checkAuth';
import { catchAsync } from '../../shared/catchAsync';
import { JobStatus, UserRole } from '../../../generated/prisma';

const router = Router();

const escapeXml = (str: string) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const isSafePublicHttpUrl = (rawUrl: string): boolean => {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      host.endsWith('.local') ||
      host.endsWith('.internal')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

router.get(
  '/pdf-proxy',
  catchAsync(async (req: Request, res: Response) => {
    const rawUrl = String(req.query.url || '').trim();
    const download = req.query.download === '1' || req.query.download === 'true';
    const filename = path.basename(String(req.query.filename || 'circular.pdf')).replace(/[^a-zA-Z0-9._-]/g, '_');

    if (!rawUrl || !isSafePublicHttpUrl(rawUrl)) {
      return res.status(400).json({ success: false, message: 'অবৈধ বা অনিরাপদ পিডিএফ লিংক।' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const upstream = await fetch(rawUrl, {
        headers: { 'User-Agent': 'ChakriSheba-PDF-Viewer/1.0' },
        signal: controller.signal,
      });
      if (!upstream.ok) {
        return res.status(upstream.status).json({ success: false, message: 'পিডিএফ ফাইল লোড করা যায়নি।' });
      }
      const contentType = upstream.headers.get('content-type') || 'application/pdf';
      if (!contentType.includes('pdf') && !rawUrl.toLowerCase().includes('.pdf')) {
        return res.status(415).json({ success: false, message: 'লিঙ্কটি একটি বৈধ PDF ফাইল নয়।' });
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
      return res.status(200).send(buf);
    } finally {
      clearTimeout(timeout);
    }
  })
);

router.get(
  '/circulars/:id/:pageFile',
  catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const job = await prisma.jobCircular.findFirst({
      where: {
        status: JobStatus.PUBLISHED,
        OR: [{ id }, { slug: id }],
      },
    });

    if (!job) {
      return res.status(404).send('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><text x="40" y="60">Circular Not Found</text></svg>');
    }

    const positions = Array.isArray(job.positions) ? (job.positions as any[]).slice(0, 6) : [];
    const deadlineStr = job.deadline ? new Date(job.deadline).toISOString().split('T')[0] : 'N/A';

    const rowsSvg = positions
      .map((p, idx) => {
        const y = 260 + idx * 54;
        return `
          <rect x="48" y="${y}" width="704" height="44" rx="6" fill="#f8fafc" stroke="#e2e8f0" />
          <text x="64" y="${y + 27}" font-size="14" font-weight="600" fill="#0f172a">${idx + 1}. ${escapeXml(p.title || 'পদবী')}</text>
          <text x="470" y="${y + 27}" font-size="13" fill="#334155">পদ: ${escapeXml(String(p.posts || 1))}</text>
          <text x="580" y="${y + 27}" font-size="13" fill="#047857">ফি: ৳${escapeXml(String(p.govtFee ?? job.officialFee))}</text>
        `;
      })
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="680" viewBox="0 0 800 680">
      <rect width="800" height="680" fill="#ffffff" />
      <rect x="24" y="24" width="752" height="632" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" />
      <rect x="24" y="24" width="752" height="100" rx="12" fill="#064e3b" />
      <text x="48" y="68" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(job.organization)}</text>
      <text x="48" y="98" font-size="15" fill="#d1fae5">অফিসিয়াল নিয়োগ সার্কুলার সারসংক্ষেপ • শেষ তারিখ: ${escapeXml(deadlineStr)}</text>
      <text x="48" y="164" font-size="18" font-weight="700" fill="#0f172a">${escapeXml((job.titleBn || job.title).slice(0, 72))}</text>
      <text x="48" y="196" font-size="14" fill="#475569">মোট শূন্যপদ: ${escapeXml(String(job.totalPositions))} টি  |  সরকারি ফি: ৳${escapeXml(String(job.officialFee))}  |  সার্ভিস চার্জ: ৳${escapeXml(String(job.serviceFee))}</text>
      <text x="48" y="240" font-size="15" font-weight="700" fill="#065f46">পদসমূহের তালিকা:</text>
      ${rowsSvg || '<text x="48" y="280" font-size="14" fill="#64748b">বিস্তারিত তথ্যের জন্য অফিসিয়াল বিজ্ঞপ্তি দেখুন।</text>'}
      <text x="48" y="625" font-size="12" fill="#64748b">Chakri Sheba Verified Digital Circular Sheet • ID: ${escapeXml(job.id)}</text>
    </svg>`;

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).send(svg);
  })
);

router.get(
  '/download',
  checkAuth(),
  catchAsync(async (req: Request, res: Response) => {
    const fileParam = String(req.query.file || req.query.url || '').trim();
    if (!fileParam) {
      return res.status(400).json({ success: false, message: 'ফাইল পাথ প্রদান করুন।' });
    }

    const normalized = fileParam.replace(/^\/?(api\/)?uploads\//, '');
    const safeSegments = normalized.split('/').filter((s) => s && s !== '.' && s !== '..');
    if (safeSegments.length < 2) {
      return res.status(400).json({ success: false, message: 'অবৈধ ফাইল পাথ।' });
    }

    const folder = safeSegments[0];
    const filename = path.basename(safeSegments[safeSegments.length - 1]);
    const isStaff = req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.OPERATOR;

    if (!isStaff) {
      if (folder === 'candidate-documents' && !filename.startsWith(`${req.user?.candidateId}_`)) {
        return res.status(403).json({ success: false, message: 'অনুমতি নেই।' });
      }
      if (folder === 'applicant-copies') {
        const owns = await prisma.applicationRequest.findFirst({
          where: {
            candidateId: req.user?.candidateId,
            OR: [{ applicantCopyPdfUrl: { contains: filename } }, { admitCardUrl: { contains: filename } }],
          },
          select: { id: true },
        });
        if (!owns) {
          return res.status(403).json({ success: false, message: 'অনুমতি নেই।' });
        }
      }
    }

    const targetPath = path.join(env.CHAKRI_UPLOAD_DIR, folder, filename);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ success: false, message: 'ফাইল পাওয়া যায়নি।' });
    }

    return res.download(targetPath, filename);
  })
);

export const utilityRoutes = router;
