import fs from 'fs';
import path from 'path';
import { Request, Response } from 'express';
import { catchAsync } from '../../shared/catchAsync';
import { prisma } from '../../lib/prisma';
import { env } from '../../config/env';
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
    case 'nid_card':
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

    const docType = ((req.body?.docType as string) || 'photo').trim();
    const docTitle = ((req.body?.docTitle as string) || 'প্রয়োজনীয় প্রমাণপত্র').trim();
    const category = ((req.body?.category as string) || docType).trim();
    const replaceDocId = req.body?.replaceDocId as string | undefined;

    // Relative URL accessible through authenticated upload route
    const relativeUrl = `/api/uploads/candidate-documents/${req.file.filename}`;

    // 1. Update Candidate profile field if it's an official standard document
    const candidateField = fieldMap[docType];
    if (candidateField) {
      const updateData: any = { [candidateField]: relativeUrl };
      if (docType === 'photo') {
        updateData.avatarUrl = relativeUrl;
      }
      await prisma.candidate.update({
        where: { id: candidateId },
        data: updateData,
      });
    }

    // 2. Save or replace Document record
    const prismaDocType = mapToPrismaDocType(docType);
    let docRecord: any;

    if (replaceDocId) {
      const existing = await prisma.candidateDocument.findFirst({
        where: { id: replaceDocId, candidateId },
      });
      if (existing) {
        if (existing.fileUrl) {
          const oldPath = path.join(env.CHAKRI_UPLOAD_DIR, 'candidate-documents', path.basename(existing.fileUrl));
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        docRecord = await prisma.candidateDocument.update({
          where: { id: existing.id },
          data: {
            type: prismaDocType,
            slotType: docType,
            category,
            title: docTitle,
            fileUrl: relativeUrl,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            isVerified: false,
            verificationStatus: 'pending',
          },
        });
      }
    }

    if (!docRecord) {
      docRecord = await prisma.candidateDocument.create({
        data: {
          candidateId,
          type: prismaDocType,
          slotType: docType,
          category,
          title: docTitle,
          fileUrl: relativeUrl,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          isVerified: false,
          verificationStatus: 'pending',
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
        slotType: docType,
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

    const mapped = docs.map((d) => {
      const resolvedType =
        d.slotType ||
        (d.type === DocumentType.PHOTO_300x300
          ? 'photo'
          : d.type === DocumentType.SIGNATURE_300x80
          ? 'signature'
          : d.type.toLowerCase());
      return {
        id: d.id,
        title: d.title,
        type: resolvedType,
        slotType: resolvedType,
        category: d.category || resolvedType,
        fileUrl: d.fileUrl,
        dataUrl: d.fileUrl,
        fileSize: d.fileSize ? `${Math.round(d.fileSize / 1024)} KB` : '100 KB',
        mimeType: d.mimeType || 'image/jpeg',
        isVerified: d.isVerified,
        verificationStatus: d.verificationStatus,
        verificationRemarks: d.verificationRemarks,
        createdAt: d.createdAt,
        uploadDate: d.createdAt.toLocaleDateString('bn-BD'),
      };
    });

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
      if (doc.fileUrl) {
        const diskPath = path.join(env.CHAKRI_UPLOAD_DIR, 'candidate-documents', path.basename(doc.fileUrl));
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      }

      const candidateField = doc.slotType ? fieldMap[doc.slotType] : undefined;
      if (candidateField) {
        const clearData: any = { [candidateField]: null };
        if (doc.slotType === 'photo') clearData.avatarUrl = null;
        await prisma.candidate.update({
          where: { id: candidateId },
          data: clearData,
        }).catch(() => {});
      }

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
