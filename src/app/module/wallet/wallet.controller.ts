import { Request, Response } from 'express';
import status from 'http-status';
import { catchAsync } from '../../shared/catchAsync';
import { sendResponse } from '../../shared/sendResponse';
import { walletService } from './wallet.service';

export const walletController = {
  getWalletOverview: catchAsync(async (req: Request, res: Response) => {
    const result = await walletService.getWalletOverview(req.user!.candidateId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ওয়ালেট বিবরণী লোড সফল হয়েছে।',
      data: result,
    });
  }),

  rechargeWallet: catchAsync(async (req: Request, res: Response) => {
    const { amount, method, trxId } = req.body;
    const result = await walletService.rechargeWallet(req.user!.candidateId, Number(amount), method, trxId);

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: 'ওয়ালেট রিচার্জ সফল হয়েছে!',
      data: result,
    });
  }),

  validateCoupon: catchAsync(async (req: Request, res: Response) => {
    const { code, serviceFee } = req.body;
    const result = await walletService.validateCoupon(req.user!.candidateId, code, Number(serviceFee || 50));

    sendResponse(res, {
      httpStatusCode: status.OK,
      success: true,
      message: result.message,
      data: result,
    });
  }),
};
