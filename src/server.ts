import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { createApiRouter } from './router';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 6969;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3050';

// Global CORS Configuration
app.use(cors({
  origin: [
    FRONTEND_URL,
    'http://localhost:3050',
    'http://127.0.0.1:3050',
    'http://localhost:3000',
    'https://chakrisheba.com',
    'https://www.chakrisheba.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-secret', 'x-user-id', 'x-user-role', 'Cache-Control']
}));

// Body Parsers (Support rich JSON payloads for batch jobs and base64 documents)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads serving for candidate photos, signatures, NID, etc.
const uploadsDir = process.env.CHAKRI_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Root landing endpoint (Dedicated Backend Status Dashboard)
app.get('/', (req, res) => {
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
          <div class="badge">● ONLINE & RUNNING</div>
          <h1>Chakri Sheba Backend Engine</h1>
          <p>Decoupled REST API & Automation Server for Chakri Sheba Platform</p>
          <div class="grid">
            <div class="item">
              <div class="label">Listening Port</div>
              <div class="val">${PORT}</div>
            </div>
            <div class="item">
              <div class="label">Environment</div>
              <div class="val">${process.env.NODE_ENV || 'development'}</div>
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
            <a href="${FRONTEND_URL}" target="_blank">↗ Open Frontend UI (${FRONTEND_URL})</a>
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
    port: PORT,
    frontend: FRONTEND_URL,
    health: '/health',
    api: '/api'
  });
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'chakri-sheba-backend'
  });
});

async function startServer() {
  try {
    // Mount the 174 auto-discovered API routes under /api
    const apiRouter = await createApiRouter(path.join(__dirname, 'api'));
    app.use('/api', apiRouter);

    app.listen(PORT, () => {
      console.log('====================================================');
      console.log(`🚀 Chakri Sheba Backend Server Started!`);
      console.log(`📡 Listening on: http://localhost:${PORT}`);
      console.log(`🔗 API Base:    http://localhost:${PORT}/api`);
      console.log(`📂 Uploads:     http://localhost:${PORT}/uploads`);
      console.log(`❤️  Health:      http://localhost:${PORT}/health`);
      console.log('====================================================');
    });
  } catch (err) {
    console.error('Fatal error starting server:', err);
    process.exit(1);
  }
}

startServer();
