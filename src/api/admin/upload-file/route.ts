import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { uploadFile, UploadFolder } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = getServerSession(req);
  if (!session || session.role !== 'admin') {
    return NextResponse.json({ error: 'FORBIDDEN: Admin privileges required.' }, { status: 403 });
  }

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'অনুরোধটি multipart/form-data ফরম্যাটে হওয়া আবশ্যক।' }, { status: 400 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadType = (formData.get('type') as string || 'image').toLowerCase();

    if (!file) {
      return NextResponse.json({ error: 'কোনো ফাইল নির্বাচন করা হয়নি।' }, { status: 400 });
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|svg|gif)$/i.test(file.name);

    if (!isPdf && !isImage) {
      return NextResponse.json({ error: 'শুধুমাত্র PDF অথবা ছবি (JPG, PNG, WEBP, SVG) ফাইল অনুমোদিত।' }, { status: 400 });
    }

    const maxBytes = isPdf ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ error: 'ফাইলের আকার অতিরিক্ত বড়।' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    let folder: UploadFolder = 'circulars';
    if (isPdf || uploadType === 'pdf') {
      folder = 'pdfs';
    } else if (uploadType === 'logo') {
      folder = 'logos';
    } else {
      folder = 'circulars';
    }

    // Skip WebP conversion for SVG files (preserve vector markup)
    const isSvg = file.name.toLowerCase().endsWith('.svg') || file.type === 'image/svg+xml';

    const uploadResult = await uploadFile({
      buffer,
      originalName: file.name,
      mimeType: file.type,
      folder,
      isPrivate: false,
      skipWebpConversion: isSvg,
    });

    if (!uploadResult.success) {
      return NextResponse.json({ error: uploadResult.error || 'ফাইল আপলোডে ত্রুটি হয়েছে' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'ফাইল সফলভাবে আপলোড হয়েছে',
      url: uploadResult.url,
      filename: uploadResult.filename,
      originalName: file.name,
      size: uploadResult.size,
      originalSize: uploadResult.originalSize,
      mimeType: uploadResult.mimeType,
      storage: uploadResult.storage,
      wasOptimized: uploadResult.wasOptimized,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'ফাইল আপলোডে ত্রুটি হয়েছে' }, { status: 500 });
  }
}
