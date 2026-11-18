import { Router } from 'express';
import { walletController } from './wallet.controller';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

router.use(checkAuth());

router.get('/', walletController.getWalletOverview);
router.get('/transactions', walletController.getTransactions);
router.post('/transactions', walletController.rechargeWallet);
router.post('/recharge', walletController.rechargeWallet);
router.post('/validate-coupon', walletController.validateCoupon);

export const walletRoutes = router;
