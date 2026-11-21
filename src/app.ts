import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './app/config/env';
import { IndexRoutes } from './app/routes';
import { globalErrorHandler } from './app/middleware/globalErrorHandler';
import { notFound } from './app/middleware/notFound';
import { checkAuth } from './app/middleware/checkAuth';
import { prisma } from './app/lib/prisma';
import { UserRole } from './generated/prisma';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app: Application = express();

// Allowed Origins for CORS
const allowedOrigins = [
  env.FRONTEND_URL,
  'http://localhost:3050',
  'http://127.0.0.1:3050',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://chakrisheba.com',
  'https://www.chakrisheba.com',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    if (env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'Cache-Control'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Normalize redundant slashes in incoming URLs (e.g. //api/... -> /api/...)
app.use((req: Request, _res: Response, next) => {
  if (req.url && req.url.includes('//')) {
    req.url = req.url.replace(/\/{2,}/g, '/');
  }
  next();
});

// Protected private uploads (candidate documents & applicant copies)
const uploadsDir = env.CHAKRI_UPLOAD_DIR;

const serveProtectedCandidateDoc = (req: Request, res: Response) => {
  const safeFile = path.basename(req.params.filename || '');
  if (!safeFile) return res.status(400).json({ success: false, message: 'Invalid file' });
  const isStaff = req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.OPERATOR;
  const ownsPrefix = Boolean(req.user?.candidateId && safeFile.startsWith(`${req.user.candidateId}_`));
  if (!isStaff && !ownsPrefix) {
    return res.status(403).json({ success: false, message: 'এই নথিতে প্রবেশের অনুমতি নেই।' });
  }
  const filePath = path.join(uploadsDir, 'candidate-documents', safeFile);
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'ফাইল পাওয়া যায়নি।' });
  });
};

const serveProtectedApplicantCopy = async (req: Request, res: Response) => {
  const safeFile = path.basename(req.params.filename || '');
  if (!safeFile) return res.status(400).json({ success: false, message: 'Invalid file' });
  const isStaff = req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.OPERATOR;
  if (!isStaff) {
    const ownedApp = await prisma.applicationRequest.findFirst({
      where: {
        candidateId: req.user?.candidateId,
        OR: [
          { applicantCopyPdfUrl: { contains: safeFile } },
          { admitCardUrl: { contains: safeFile } },
        ],
      },
      select: { id: true },
    });
    if (!ownedApp) {
      return res.status(403).json({ success: false, message: 'এই অ্যাডমিট/কপিতে প্রবেশের অনুমতি নেই।' });
    }
  }
  const filePath = path.join(uploadsDir, 'applicant-copies', safeFile);
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'ফাইল পাওয়া যায়নি।' });
  });
};

app.get('/uploads/candidate-documents/:filename', checkAuth(), serveProtectedCandidateDoc);
app.get('/api/uploads/candidate-documents/:filename', checkAuth(), serveProtectedCandidateDoc);
app.get('/uploads/applicant-copies/:filename', checkAuth(), serveProtectedApplicantCopy);
app.get('/api/uploads/applicant-copies/:filename', checkAuth(), serveProtectedApplicantCopy);

// Public CMS/marketing media uploads only
app.use('/uploads/media', express.static(path.join(uploadsDir, 'media')));
app.use('/api/uploads/media', express.static(path.join(uploadsDir, 'media')));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'chakri-sheba-backend',
    database: 'Neon PostgreSQL (Connected via Prisma)',
  });
});

// Root landing endpoint (Dedicated Backend Status Dashboard)
app.get('/', (req: Request, res: Response) => {
  if (req.accepts('html') && !req.query.json) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Chakri Sheba Backend API</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 32px; max-width: 600px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .badge { display: inline-block; background: #065f46; color: #34d399; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
          h1 { margin: 0 0 8px 0; font-size: 24px; color: #ffffff; }
          p { color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
          .item { background: #0f172a; padding: 12px 16px; border-radius: 8px; border: 1px solid #334155; }
          .label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; margin-bottom: 4px; }
          .val { font-size: 14px; color: #38bdf8; font-family: monospace; word-break: break-all; }
          a { color: #10b981; text-decoration: none; font-weight: 500; }
          a:hover { text-decoration: underline; }
          .links { border-top: 1px solid #334155; padding-top: 16px; display: flex; gap: 16px; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">● ONLINE & RUNNING (Aviro Modular Pattern)</div>
          <h1>Chakri Sheba Backend Engine</h1>
          <p>Enterprise Modular REST API & PostgreSQL Database Server</p>
          <div class="grid">
            <div class="item">
              <div class="label">Listening Port</div>
              <div class="val">${env.PORT}</div>
            </div>
            <div class="item">
              <div class="label">Database</div>
              <div class="val">Neon PostgreSQL (Prisma)</div>
            </div>
            <div class="item">
              <div class="label">API Base</div>
              <div class="val"><a href="/api/jobs" target="_blank">/api</a></div>
            </div>
            <div class="item">
              <div class="label">Health Check</div>
              <div class="val"><a href="/health" target="_blank">/health</a></div>
            </div>
          </div>
          <div class="links">
            <a href="${env.FRONTEND_URL}" target="_blank">↗ Open Frontend UI (${env.FRONTEND_URL})</a>
            <a href="/health" target="_blank">↗ View Health JSON</a>
            <a href="/api/jobs" target="_blank">↗ Test API Jobs</a>
          </div>
        </div>
      </body>
      </html>
    `);
  }
  res.json({
    service: 'chakri-sheba-backend',
    status: 'online',
    pattern: 'Avirosoft Modular Monolith',
    database: 'Neon PostgreSQL (Prisma)',
    port: env.PORT,
    frontend: env.FRONTEND_URL,
    health: '/health',
    api: '/api',
  });
});

// Mount Routes
app.use('/api', IndexRoutes);
app.use('/api/v1', IndexRoutes);

// Error Handlers
app.use(globalErrorHandler);
app.use(notFound);

export default app;
