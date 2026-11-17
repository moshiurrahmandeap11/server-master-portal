export interface ICreateApplicationPayload {
  jobId: string;
  positionIndex?: number;
  positionName?: string;
  postName?: string;
  jobTitle?: string;
  organization?: string;
  govtFee?: number;
  governmentFee?: number;
  serviceFee?: number;
  serviceCharge?: number;
  totalAmount?: number;
  couponCode?: string;
  paymentMethod?: string;
  trxId?: string;
  transactionId?: string;
  senderPhone?: string;
  candidateName?: string;
  candidatePhone?: string;
  candidateDistrict?: string;
  paymentScreenshotUrl?: string;
  attachedDocuments?: any[];
  submittedEducation?: any[];
}
