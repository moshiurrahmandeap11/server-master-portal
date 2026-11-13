import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type UploadFolder = 
  | 'candidate-documents'
  | 'applicant-copies'
  | 'circulars'
  | 'logos'
  | 'media'
  | 'pdfs';

export interface UploadOptions {
  buffer: Buffer;
  originalName: string;
  mimeType?: string;
  folder: UploadFolder;
  isPrivate?: boolean;
  customFileName?: string;
  skipWebpConversion?: boolean;
}

export interface UploadResult {
  success: boolean;
  url: string;
  filename: string;
  key: string;
  folder: UploadFolder;
  mimeType: string;
  size: number;
  originalSize: number;
  checksumSha256: string;
  storage: 'r2' | 'local';
  wasOptimized: boolean;
  error?: string;
}

// ----------------------------------------------------
// Cloudflare R2 Client Initialization & Config Check
// ----------------------------------------------------
const r2AccountId = process.env.R2_ACCOUNT_ID?.trim() || '';
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || '';
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || '';
const r2BucketName = process.env.R2_BUCKET_NAME?.trim() || '';
const r2PublicDomain = (process.env.R2_PUBLIC_DOMAIN?.trim() || '').replace(/\/+$/, '');

export function isR2Configured(): boolean {
  return Boolean(
    r2AccountId &&
    r2AccessKeyId &&
    r2SecretAccessKey &&
    r2BucketName &&
    r2AccountId !== 'your_cloudflare_account_id_here' &&
    r2AccessKeyId !== 'your_r2_access_key_id_here'
  );
}

let s3ClientInstance: S3Client | null = null;

function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: 'auto',
      endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

export function getR2BucketName(): string {
  return r2BucketName;
}

export function getR2PublicDomain(): string {
  return r2PublicDomain;
}

// ----------------------------------------------------
// Image Optimization Engine (Auto WebP Conversion)
// ----------------------------------------------------
const CONVERTIBLE_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp']);
const CONVERTIBLE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/bmp',
  'image/tiff',
  'image/webp'
]);

export async function optimizeImage(
  buffer: Buffer,
  originalName: string,
  declaredMimeType?: string
): Promise<{
  buffer: Buffer;
  mimeType: string;
  filename: string;
  originalSize: number;
  optimizedSize: number;
  wasOptimized: boolean;
}> {
  const originalExt = path.extname(originalName).toLowerCase();
  const originalSize = buffer.length;

  const isConvertible =
    CONVERTIBLE_IMAGE_EXTS.has(originalExt) ||
    (declaredMimeType && CONVERTIBLE_MIME_TYPES.has(declaredMimeType));

  if (!isConvertible) {
    return {
      buffer,
      mimeType: declaredMimeType || 'application/octet-stream',
      filename: originalName,
      originalSize,
      optimizedSize: originalSize,
      wasOptimized: false,
    };
  }

  try {
    // Convert to highly optimized WebP format
    const webpBuffer = await sharp(buffer)
      .rotate() // Auto-orient based on EXIF
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    const baseName = path.basename(originalName, originalExt);
    const newFilename = `${baseName}.webp`;

    return {
      buffer: webpBuffer,
      mimeType: 'image/webp',
      filename: newFilename,
      originalSize,
      optimizedSize: webpBuffer.length,
      wasOptimized: true,
    };
  } catch (err: any) {
    console.warn(`[Storage] WebP conversion fallback for ${originalName}:`, err.message);
    return {
      buffer,
      mimeType: declaredMimeType || 'application/octet-stream',
      filename: originalName,
      originalSize,
      optimizedSize: originalSize,
      wasOptimized: false,
    };
  }
}

// ----------------------------------------------------
// Unified Upload Function
// ----------------------------------------------------
export async function uploadFile(options: UploadOptions): Promise<UploadResult> {
  const { folder, isPrivate = false } = options;

  // 1. Optimize image to WebP if applicable
  let processedBuffer = options.buffer;
  let processedMime = options.mimeType || 'application/octet-stream';
  let processedName = options.customFileName || options.originalName;
  let wasOptimized = false;
  const originalSize = options.buffer.length;

  if (!options.skipWebpConversion) {
    const opt = await optimizeImage(options.buffer, processedName, processedMime);
    processedBuffer = opt.buffer;
    processedMime = opt.mimeType;
    processedName = opt.filename;
    wasOptimized = opt.wasOptimized;
  }

  // 2. Compute cryptographic SHA-256 checksum
  const checksumSha256 = crypto.createHash('sha256').update(processedBuffer).digest('hex');

  // 3. Generate sanitized unique filename
  const cleanExt = path.extname(processedName).toLowerCase();
  const rawBase = path.basename(processedName, cleanExt)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._\-\u0980-\u09FF]/g, '_')
    .slice(0, 80);

  const finalFileName = `${Date.now()}_${rawBase}${cleanExt}`;
  const r2Key = `${folder}/${finalFileName}`;

  // 4. Try Upload to Cloudflare R2 if configured
  const r2 = getR2Client();
  if (r2 && isR2Configured()) {
    try {
      await r2.send(
        new PutObjectCommand({
          Bucket: r2BucketName,
          Key: r2Key,
          Body: processedBuffer,
          ContentType: processedMime,
          Metadata: {
            'original-name': encodeURIComponent(options.originalName),
            'checksum-sha256': checksumSha256,
            'is-private': isPrivate ? 'true' : 'false',
          },
        })
      );

      // Determine public vs private URL
      let publicUrl: string;
      if (!isPrivate && r2PublicDomain) {
        publicUrl = `${r2PublicDomain}/${r2Key}`;
      } else {
        // Private or routed through authenticated Next.js/Express API proxy
        publicUrl = `/api/uploads/${folder}/${finalFileName}`;
      }

      return {
        success: true,
        url: publicUrl,
        filename: finalFileName,
        key: r2Key,
        folder,
        mimeType: processedMime,
        size: processedBuffer.length,
        originalSize,
        checksumSha256,
        storage: 'r2',
        wasOptimized,
      };
    } catch (r2Error: any) {
      console.error('[Storage] R2 upload failed, falling back to local disk:', r2Error.message);
    }
  }

  // 5. Local Disk Fallback
  try {
    const localTargetDir = isPrivate
      ? path.join(process.env.CHAKRI_UPLOAD_DIR || path.join(process.cwd(), 'private', 'uploads'), folder)
      : path.join(process.cwd(), 'public', 'uploads', folder);

    if (!fs.existsSync(localTargetDir)) {
      fs.mkdirSync(localTargetDir, { recursive: true });
    }

    const localFilePath = path.join(localTargetDir, finalFileName);
    fs.writeFileSync(localFilePath, processedBuffer);

    const relativeUrl = isPrivate
      ? `/api/uploads/${folder}/${finalFileName}`
      : `/uploads/${folder}/${finalFileName}`;

    return {
      success: true,
      url: relativeUrl,
      filename: finalFileName,
      key: r2Key,
      folder,
      mimeType: processedMime,
      size: processedBuffer.length,
      originalSize,
      checksumSha256,
      storage: 'local',
      wasOptimized,
    };
  } catch (localError: any) {
    return {
      success: false,
      url: '',
      filename: finalFileName,
      key: r2Key,
      folder,
      mimeType: processedMime,
      size: processedBuffer.length,
      originalSize,
      checksumSha256,
      storage: 'local',
      wasOptimized,
      error: localError.message || 'Storage write failed',
    };
  }
}

// ----------------------------------------------------
// Unified File Retrieval (R2 with Local Fallback)
// ----------------------------------------------------
export async function getFile(
  folder: UploadFolder,
  filename: string
): Promise<{ buffer: Buffer; contentType: string; storage: 'r2' | 'local' } | null> {
  const safeFilename = path.basename(filename);
  const r2Key = `${folder}/${safeFilename}`;

  // 1. Check R2 first if configured
  const r2 = getR2Client();
  if (r2 && isR2Configured()) {
    try {
      const resp = await r2.send(
        new GetObjectCommand({
          Bucket: r2BucketName,
          Key: r2Key,
        })
      );

      if (resp.Body) {
        const streamToBuffer = async (stream: any): Promise<Buffer> => {
          const chunks: any[] = [];
          for await (const chunk of stream) chunks.push(chunk);
          return Buffer.concat(chunks);
        };

        const buffer = await streamToBuffer(resp.Body);
        return {
          buffer,
          contentType: resp.ContentType || 'application/octet-stream',
          storage: 'r2',
        };
      }
    } catch (e: any) {
      // Object not found in R2 or network error, fallback to local disk
    }
  }

  // 2. Check local disk locations
  const candidateLocalPaths = [
    path.join(process.env.CHAKRI_UPLOAD_DIR || path.join(process.cwd(), 'private', 'uploads'), folder, safeFilename),
    path.join(process.cwd(), 'public', 'uploads', folder, safeFilename),
    path.join(process.cwd(), 'public', folder, safeFilename),
    path.join(process.cwd(), 'uploads', folder, safeFilename),
  ];

  for (const lp of candidateLocalPaths) {
    if (fs.existsSync(lp)) {
      const buffer = fs.readFileSync(lp);
      const ext = path.extname(safeFilename).toLowerCase();
      let contentType = 'application/octet-stream';
      if (ext === '.pdf') contentType = 'application/pdf';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
      else if (ext === '.png') contentType = 'image/png';
      else if (ext === '.svg') contentType = 'image/svg+xml';

      return {
        buffer,
        contentType,
        storage: 'local',
      };
    }
  }

  return null;
}

// ----------------------------------------------------
// Presigned Download URL Generator (for private documents)
// ----------------------------------------------------
export async function getSignedDownloadUrl(
  folder: UploadFolder,
  filename: string,
  expiresInSeconds: number = 900 // 15 minutes default
): Promise<string | null> {
  const safeFilename = path.basename(filename);
  const r2Key = `${folder}/${safeFilename}`;

  const r2 = getR2Client();
  if (!r2 || !isR2Configured()) return null;

  try {
    const command = new GetObjectCommand({
      Bucket: r2BucketName,
      Key: r2Key,
    });
    return await getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
  } catch (err: any) {
    console.warn(`[Storage] Failed generating presigned URL for ${r2Key}:`, err.message);
    return null;
  }
}

// ----------------------------------------------------
// Delete File
// ----------------------------------------------------
export async function deleteFile(folder: UploadFolder, filename: string): Promise<boolean> {
  const safeFilename = path.basename(filename);
  const r2Key = `${folder}/${safeFilename}`;
  let deleted = false;

  // 1. Delete from R2
  const r2 = getR2Client();
  if (r2 && isR2Configured()) {
    try {
      await r2.send(
        new DeleteObjectCommand({
          Bucket: r2BucketName,
          Key: r2Key,
        })
      );
      deleted = true;
    } catch (e) {}
  }

  // 2. Delete from local disk
  const candidateLocalPaths = [
    path.join(process.env.CHAKRI_UPLOAD_DIR || path.join(process.cwd(), 'private', 'uploads'), folder, safeFilename),
    path.join(process.cwd(), 'public', 'uploads', folder, safeFilename),
  ];

  for (const lp of candidateLocalPaths) {
    if (fs.existsSync(lp)) {
      try {
        fs.unlinkSync(lp);
        deleted = true;
      } catch (e) {}
    }
  }

  return deleted;
}
