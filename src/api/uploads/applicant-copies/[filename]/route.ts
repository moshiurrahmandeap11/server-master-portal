import { getServerSession } from '@/lib/auth';
import { serverDB } from '@/lib/db';
import { getFile } from '@/lib/storage';
import { NextResponse } from 'next/server';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ filename: string }> }) {
  const params = await props.params;
  try {
    const session = getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Login required' }, { status: 401 });
    const filename = path.basename(params.filename);
    if (session.role !== 'admin' && !serverDB.getApplications(session.candidateId).some(app => {
      const url = app.applicantCopyPdfUrl || '';
      return url.split('/').pop() === filename;
    })) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const fileData = await getFile('applicant-copies', filename);
    if (!fileData) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': fileData.contentType,
        'Content-Disposition': 'inline; filename="' + filename + '"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Storage-Backend': fileData.storage,
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
