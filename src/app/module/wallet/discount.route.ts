import { Router } from 'express';
import { discountController } from './discount.controller';
import { optionalAuth } from '../../middleware/checkAuth';

const router = Router();

router.get('/available', discountController.getAvailableDiscounts);
router.post('/validate', optionalAuth, discountController.validateDiscount);

export const discountRoutes = router;
