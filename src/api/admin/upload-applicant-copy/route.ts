import { uploadFile } from '@/lib/storage';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { serverDB } from '@/lib/db';

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
    const appId = (formData.get('appId') as string || '').trim();
    if (appId && !/^[a-zA-Z0-9_-]+$/.test(appId)) return NextResponse.json({ error: 'Invalid application ID' }, { status: 400 });

    if (!file) {
      return NextResponse.json({ error: 'কোনো ফাইল পাওয়া যায়নি।' }, { status: 400 });
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'শুধুমাত্র PDF অথবা ছবি (JPG/PNG/WEBP) ফাইল আপলোড করা যাবে।' }, { status: 400 });
    }

    // Limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'ফাইলের আকার সর্বোচ্চ ১০ মেগাবাইট (10MB) হতে পারে।' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const customName = appId ? `${appId}_applicant_copy_${cleanName}` : `applicant_copy_${cleanName}`;

    // Upload via unified storage (R2 / Local + WebP auto-conversion if image)
    const uploadResult = await uploadFile({
      buffer,
      originalName: file.name,
      mimeType: file.type,
      folder: 'applicant-copies',
      isPrivate: true,
      customFileName: customName,
    });

    if (!uploadResult.success) {
      return NextResponse.json({ error: uploadResult.error || 'আপলোড ব্যর্থ হয়েছে।' }, { status: 500 });
    }

    const publicUrl = uploadResult.url;
    const fileName = uploadResult.filename;

    // If appId is provided, immediately link it in database
    if (appId) {
      serverDB.updateAppStatus(
        'ADMIN-SUPER',
        appId,
        'completed',
        'officially_verified',
        'অফিসিয়াল অ্যাপ্লিক্যান্ট কপি (PDF) সার্ভারে আপলোড করা হয়েছে।',
        true,
        { applicantCopyPdfUrl: publicUrl }
      );
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName,
      size: uploadResult.size,
      originalSize: uploadResult.originalSize,
      storage: uploadResult.storage,
      wasOptimized: uploadResult.wasOptimized,
      message: 'ফাইল সফলভাবে সংরক্ষিত হয়েছে।'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'আপলোড ব্যর্থ হয়েছে।' }, { status: 500 });
  }
}
