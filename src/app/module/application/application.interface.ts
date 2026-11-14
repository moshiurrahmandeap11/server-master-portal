export interface ICreateApplicationPayload {
  jobId: string;
  positionIndex: number;
  positionName: string;
  govtFee: number;
  serviceFee: number;
  couponCode?: string;
  paymentMethod?: string;
}
