import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export interface ProcessedImageResult {
  filePath: string;
  fileSize: number;
  mimeType: string;
  width: number;
  height: number;
}

/**
 * Standardizes candidate photo (300x300, <100KB) or signature (300x80, <60KB)
 * to meet Bangladesh Teletalk / Govt recruitment portal requirements.
 */
export async function processCandidateImage(
  filePath: string,
  docType: string,
): Promise<ProcessedImageResult | null> {
  const normalizedType = docType.toLowerCase();
  if (normalizedType !== 'photo' && normalizedType !== 'signature') {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return null;

  const targetWidth = 300;
  const targetHeight = normalizedType === 'photo' ? 300 : 80;
  const maxBytes = normalizedType === 'photo' ? 100 * 1024 : 60 * 1024;

  const inputBuffer = fs.readFileSync(filePath);

  let quality = 88;
  let outputBuffer = await sharp(inputBuffer)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(targetWidth, targetHeight, {
      fit: normalizedType === 'photo' ? 'cover' : 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .jpeg({ quality, mozjpeg: true })
    .toBuffer();

  while (outputBuffer.length > maxBytes && quality > 40) {
    quality -= 10;
    outputBuffer = await sharp(inputBuffer)
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize(targetWidth, targetHeight, {
        fit: normalizedType === 'photo' ? 'cover' : 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  }

  const parsed = path.parse(filePath);
  const outPath = path.join(parsed.dir, `${parsed.name}.jpg`);
  fs.writeFileSync(outPath, outputBuffer);
  if (outPath !== filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }

  return {
    filePath: outPath,
    fileSize: outputBuffer.length,
    mimeType: 'image/jpeg',
    width: targetWidth,
    height: targetHeight,
  };
}
