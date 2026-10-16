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
