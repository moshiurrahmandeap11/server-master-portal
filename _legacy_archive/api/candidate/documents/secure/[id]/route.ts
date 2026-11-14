import { getFile } from '@/lib/storage';
import { NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { AdminGovernanceRbac } from '@/lib/governance';
import { serverDB } from '@/lib/db';
import { SyntheticUserManager } from '@/lib/testing/synthetic/synthetic-user-manager';
import path from 'path';

export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const docId = params.id;
    const session = getServerSession(req);
    const adminAuth = AdminGovernanceRbac.authorizeRequest(req, 'certificates.review');

    // 1. Locate the document across database candidate records
    const allCandidates = serverDB.getAllCandidates();
    let targetDoc: any = null;
    let ownerCandidateId: string = '';

    for (const cand of allCandidates) {
      const docs = serverDB.getDocuments(cand.id);
      const found = docs.find((d: any) => d.id === docId || d.fileName?.includes(docId));
      if (found) {
        targetDoc = found;
        ownerCandidateId = cand.id;
        break;
      }
    }

    if (!targetDoc) {
      const synthDoc = SyntheticUserManager.findDocument(docId);
      if (synthDoc) {
        targetDoc = synthDoc.doc;
        ownerCandidateId = synthDoc.candidateId;
      }
    }

    if (!targetDoc) {
      return NextResponse.json({ error: 'ডকুমেন্ট বা সনদপত্রটি খুঁজে পাওয়া যায়নি।' }, { status: 404 });
    }

    // 2. Authorization Guard: Candidate must own document, OR caller must hold admin certificate review permission
    const isOwner = session && session.candidateId === ownerCandidateId;
    const isAdmin = adminAuth.authorized;

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'FORBIDDEN: এই সনদপত্রটি দেখার অনুমতি আপনার নেই।' }, { status: 403 });
    }

    // 3. File retrieval (R2 or Local)
    const safeFileName = path.basename(targetDoc.fileName || '');
    const fileData = await getFile('candidate-documents', safeFileName);

    if (!fileData) {
      // If physical file not found on storage, return document metadata safely
      return NextResponse.json({
        success: true,
        documentMetadata: targetDoc,
        message: 'ডকুমেন্ট মেটাডাটা উপলব্ধ রয়েছে।'
      });
    }

    return new Response(new Uint8Array(fileData.buffer), {
      status: 200,
      headers: {
        'Content-Type': fileData.contentType,
        'Content-Disposition': `inline; filename="${safeFileName}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        'X-Storage-Backend': fileData.storage,
      }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'ডকুমেন্ট অ্যাক্সেস করতে ত্রুটি হয়েছে' },
      { status: 500 }
    );
  }
}

