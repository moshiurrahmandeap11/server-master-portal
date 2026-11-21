import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { env } from '../config/env';

const uploadDir = path.join(env.CHAKRI_UPLOAD_DIR, 'candidate-documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req: any, file, cb) => {
    const candidateId = req.user?.candidateId || req.user?.userId || 'guest';
    const docType = (req.body?.docType || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeExt = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    const filename = `${candidateId}_${docType}_${Date.now()}${safeExt}`;
    cb(null, filename);
  },
});

const allowedDocExt = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'];
const allowedDocMime = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export const documentUpload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedDocExt.includes(ext) && allowedDocMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র PDF, JPG, JPEG, PNG অথবা WEBP ফাইল আপলোড করা যাবে।'));
    }
  },
});

const applicantCopyDir = path.join(env.CHAKRI_UPLOAD_DIR, 'applicant-copies');
if (!fs.existsSync(applicantCopyDir)) {
  fs.mkdirSync(applicantCopyDir, { recursive: true });
}

export const applicantCopyUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, applicantCopyDir),
    filename: (req: any, file, cb) => {
      const appId = String(req.body?.applicationId || req.body?.trackingNumber || 'app').replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext = path.extname(file.originalname).toLowerCase();
      const safeExt = allowedDocExt.includes(ext) ? ext : '.pdf';
      cb(null, `${appId}_copy_${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedDocExt.includes(ext) && allowedDocMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র PDF অথবা ছবি (JPG/PNG/WEBP) ফাইল আপলোড করা যাবে।'));
    }
  },
});

const mediaDir = path.join(env.CHAKRI_UPLOAD_DIR, 'media');
if (!fs.existsSync(mediaDir)) {
  fs.mkdirSync(mediaDir, { recursive: true });
}

export const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, mediaDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'media';
      const safeExt = [...allowedDocExt, '.gif'].includes(ext) ? ext : '.png';
      cb(null, `${safeBase}_${Date.now()}${safeExt}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const okExt = [...allowedDocExt, '.gif'].includes(ext);
    const okMime = [...allowedDocMime, 'image/gif'].includes(file.mimetype);
    if (okExt && okMime) {
      cb(null, true);
    } else {
      cb(new Error('অনুমোদিত ফাইল ফরম্যাট: PDF, JPG, PNG, WEBP, GIF।'));
    }
  },
});

export const circularPdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit for large multi-page circular PDFs
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' && file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('শুধুমাত্র PDF (.pdf) ফাইল আপলোড করা যাবে।'));
    }
  },
});

