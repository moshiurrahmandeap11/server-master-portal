import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import { DocumentType } from '../../../generated/prisma';

const fieldMap: Record<string, string> = {
  photo: 'photoUrl',
  signature: 'signatureUrl',
  nid_front: 'nidFrontUrl',
  nid_back: 'nidBackUrl',
  father_nid: 'fatherNidUrl',
  mother_nid: 'motherNidUrl',
  nagorik_certificate: 'nagorikCertificateUrl',
  birth_certificate: 'birthCertificateUrl',
  character_certificate: 'characterCertificateUrl',
  quota_certificate: 'quotaCertificateUrl',
};

function mapToPrismaDocType(type: string): DocumentType {
  switch (type.toLowerCase()) {
    case 'photo':
      return DocumentType.PHOTO_300x300;
    case 'signature':
      return DocumentType.SIGNATURE_300x80;
    case 'nid_front':
    case 'nid_back':
    case 'father_nid':
    case 'mother_nid':
      return DocumentType.NID_CARD;
    case 'birth_certificate':
      return DocumentType.BIRTH_CERTIFICATE;
    case 'quota_certificate':
      return DocumentType.QUOTA_CERTIFICATE;
    default:
      return DocumentType.OTHER;
  }
}

export const documentController = {
  uploadDocument: catchAsync(async (req: Request, res: Response) => {
    const candidateId = req.user?.candidateId;
    if (!candidateId) {
      return res.status(401).json({ success: false, error: 'অনুগ্রহ করে প্রথমে লগইন করুন।' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'কোনো ফাইল পাওয়া যায়নি।' });
    }

    const docType = (req.body?.docType as string) || 'photo';
    const docTitle = (req.body?.docTitle as string) || 'প্রয়োজনীয় প্রমাণপত্র';
    const replaceDocId = req.body?.replaceDocId as string | undefined;

    // Relative URL accessible both directly and through proxy
    const relativeUrl = `/api/uploads/candidate-documents/${req.file.filename}`;

    // 1. Update Candidate profile field if it's an official standard document
    const candidateField = fieldMap[docType];
    if (candidateField) {
      const updateData: any = { [candidateField]: relativeUrl };
      if (docType === 'photo') {
        updateData.avatarUrl = relativeUrl;
      }
      try {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: updateData,
        });
      } catch (err) {
        console.warn('Candidate field update notice:', err);
      }
    }

    // 2. Save or replace Document record
    const prismaDocType = mapToPrismaDocType(docType);
    let docRecord: any;

    if (replaceDocId) {
      const existing = await prisma.candidateDocument.findFirst({
        where: { id: replaceDocId, candidateId },
      });
      if (existing) {
        docRecord = await prisma.candidateDocument.update({
          where: { id: existing.id },
          data: {
            type: prismaDocType,
            title: docTitle,
            fileUrl: relativeUrl,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            isVerified: false,
          },
        });
      }
    }

    if (!docRecord) {
      docRecord = await prisma.candidateDocument.create({
        data: {
          candidateId,
          type: prismaDocType,
          title: docTitle,
          fileUrl: relativeUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          isVerified: false,
        },
      });
    }

    return res.status(200).json({
      success: true,
      fileUrl: relativeUrl,
      fileName: req.file.filename,
      docType,
      docTitle,
      document: {
        ...docRecord,
        type: docType,
        fileUrl: relativeUrl,
        dataUrl: relativeUrl,
        uploadDate: new Date().toLocaleDateString('bn-BD'),
      },
    });
  }),

  getDocuments: catchAsync(async (req: Request, res: Response) => {
    const candidateId = req.user?.candidateId;
    if (!candidateId) {
      return res.status(401).json({ success: false, error: 'লগইন আবশ্যক।' });
    }

    const docs = await prisma.candidateDocument.findMany({
      where: { candidateId },
      orderBy: { createdAt: 'desc' },
    });

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });

    // Client-compatible normalization
    const mapped = docs.map((d) => ({
      id: d.id,
      title: d.title,
      type: d.type === DocumentType.PHOTO_300x300 ? 'photo' : d.type === DocumentType.SIGNATURE_300x80 ? 'signature' : d.type.toLowerCase(),
      fileUrl: d.fileUrl,
      dataUrl: d.fileUrl,
      fileSize: d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : '100 KB',
      mimeType: d.mimeType || 'image/jpeg',
      isVerified: d.isVerified,
      createdAt: d.createdAt,
      uploadDate: d.createdAt.toLocaleDateString('bn-BD'),
    }));

    return res.status(200).json({
      success: true,
      documents: mapped,
      profile: candidate ? {
        photoUrl: candidate.photoUrl || candidate.avatarUrl,
        avatarUrl: candidate.avatarUrl || candidate.photoUrl,
        signatureUrl: candidate.signatureUrl,
      } : null,
    });
  }),

  deleteDocument: catchAsync(async (req: Request, res: Response) => {
    const candidateId = req.user?.candidateId;
    if (!candidateId) {
      return res.status(401).json({ success: false, error: 'লগইন আবশ্যক।' });
    }

    const docId = (req.params.id || req.body?.id || req.query?.id) as string;
    if (!docId) {
      return res.status(400).json({ success: false, error: 'ডকুমেন্ট আইডি আবশ্যক।' });
    }

    const doc = await prisma.candidateDocument.findFirst({
      where: { id: docId, candidateId },
    });

    if (doc) {
      await prisma.candidateDocument.delete({
        where: { id: doc.id },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'ডকুমেন্ট সফলভাবে মুছে ফেলা হয়েছে।',
    });
  }),
};
