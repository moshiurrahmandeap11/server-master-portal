import { DocumentType } from '../../../generated/prisma';

export interface IUpdateCandidateProfilePayload {
  name?: string;
  nameBn?: string;
  phone?: string;
  district?: string;
  division?: string;
  avatarUrl?: string;
}

export interface IEducationPayload {
  level: string;
  examTitle: string;
  groupMajor?: string;
  boardUniversity?: string;
  institute?: string;
  rollNumber?: string;
  regNumber?: string;
  passingYear: number;
  resultType?: string;
  gpaCgpa?: number;
  scale?: number;
}

export interface IDocumentPayload {
  type: DocumentType;
  title: string;
  fileUrl: string;
  fileSize?: number;
  mimeType?: string;
}
