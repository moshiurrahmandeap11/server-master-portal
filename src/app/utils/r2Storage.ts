import fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';

let cachedClient: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME &&
      !env.R2_ACCOUNT_ID.includes('your_'),
  );
}

function getR2Client(): S3Client | null {
  if (!isR2Configured()) return null;
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return cachedClient;
}

/**
 * Uploads a local file to Cloudflare R2 if configured.
 * Returns the public CDN URL on success, or null when R2 is not configured.
 */
export async function uploadFileToR2IfConfigured(
  localFilePath: string,
  objectKey: string,
  contentType: string,
): Promise<string | null> {
  const client = getR2Client();
  if (!client || !env.R2_BUCKET_NAME) return null;

  try {
    const body = fs.readFileSync(localFilePath);
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
      }),
    );

    if (env.R2_PUBLIC_DOMAIN) {
      return `${env.R2_PUBLIC_DOMAIN.replace(/\/+$/, '')}/${objectKey}`;
    }
    return `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${objectKey}`;
  } catch (err: any) {
    console.warn('[r2Storage] Upload failed, keeping local disk copy:', err?.message);
    return null;
  }
}
