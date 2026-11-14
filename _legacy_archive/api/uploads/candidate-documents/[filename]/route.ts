import { getFile } from '@/lib/storage';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { AdminGovernanceRbac } from '@/lib/governance';
import { serverDB } from '@/lib/db';
import { SyntheticUserManager } from '@/lib/testing/synthetic/synthetic-user-manager';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ filename: string }> }) {
  const params = await props.params;
  try {
    const rawFilename = params.filename;
    if (
      !rawFilename ||
      rawFilename.includes('..') ||
      rawFilename.includes('/') ||
      rawFilename.includes('\\') ||
      rawFilename.includes('%2e') ||
      rawFilename.includes('%2f') ||
      rawFilename.includes('%5c')
    ) {
      return NextResponse.json({ error: 'Invalid filename or path traversal detected' }, { status: 400 });
    }

    const filename = path.basename(rawFilename);

    // Identify owner candidate
    let ownerCandidateId: string = '';
    let targetDoc: any = null;

    const synthDoc = SyntheticUserManager.findDocument(filename);
    if (synthDoc) {
      ownerCandidateId = synthDoc.candidateId;
      targetDoc = synthDoc.doc;
    } else {
      const allCandidates = serverDB.getAllCandidates();
      for (const cand of allCandidates) {
        const docs = serverDB.getDocuments(cand.id);
        const found = docs.find((d: any) => d.fileName === filename || d.fileName?.includes(filename));
        if (found) {
          targetDoc = found;
          ownerCandidateId = cand.id;
          break;
        }
      }
    }

    if (!ownerCandidateId) {
      const match = filename.match(/^([a-zA-Z0-9_-]+?)_[a-zA-Z0-9_-]+_\d+\.[a-zA-Z0-9]+$/);
      if (match) {
        ownerCandidateId = match[1];
      }
    }

    // Authorization Guard
    const session = getServerSession(req);
    const adminAuth = AdminGovernanceRbac.authorizeRequest(req, 'certificates.review');
    const isAdmin = adminAuth.authorized;
    const isOwner = session && session.candidateId && (session.candidateId === ownerCandidateId);

    if (!isAdmin && !isOwner) {
      return NextResponse.json(
        { error: 'FORBIDDEN: You do not have permission to access this candidate document.' },
        { status: 403 }
      );
    }

    const fileData = await getFile('candidate-documents', filename);
    if (!fileData) {
      return NextResponse.json({ error: 'Document file not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': fileData.contentType,
        'Content-Disposition': 'inline; filename="' + filename + '"',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-cache, no-store, must-revalidate',
        'X-Storage-Backend': fileData.storage,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error serving document' }, { status: 500 });
  }
}
