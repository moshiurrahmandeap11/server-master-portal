import { DocumentType } from '../../../generated/prisma';

export interface IUpdateCandidateProfilePayload {
  name?: string;
  nameBn?: string;
  phone?: string;
  district?: string;
  division?: string;
  avatarUrl?: string;
  fatherName?: string;
  fatherNameBn?: string;
  motherName?: string;
  motherNameBn?: string;
  fatherNid?: string;
  motherNid?: string;
  dob?: string;
  gender?: string;
  nid?: string;
  address?: string;
  permanentAddress?: string;
  sameAsPresentAddress?: boolean;
  maritalStatus?: string;
  religion?: string;
  nationality?: string;
  signatureUrl?: string;
  quota?: string;
  quotaCertificateUrl?: string;
  skills?: any;
  experiences?: any;
  presentAddressDetails?: any;
  permanentAddressDetails?: any;
  careerObjective?: string;
  professionalSummary?: string;
  currentPosition?: string;
  currentOrganization?: string;
  careerPreferences?: any;
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
