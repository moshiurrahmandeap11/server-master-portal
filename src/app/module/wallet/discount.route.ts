import { Router } from 'express';
import { discountController } from './discount.controller';

const router = Router();

router.get('/available', discountController.getAvailableDiscounts);
router.post('/validate', discountController.validateDiscount);

export const discountRoutes = router;
