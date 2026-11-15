import { Router } from 'express';
import { authController } from './auth.controller';
import { authValidation } from './auth.validation';
import { validateRequest } from '../../middleware/validateRequest';
import { checkAuth } from '../../middleware/checkAuth';

const router = Router();

router.post('/register', validateRequest(authValidation.signUp), authController.signUp);
router.post('/signup', validateRequest(authValidation.signUp), authController.signUp);
router.post('/login', validateRequest(authValidation.login), authController.login);
router.post('/verify-email', validateRequest(authValidation.verifyOtp), authController.verifyEmail);
router.post('/resend-verification', validateRequest(authValidation.resendOtp), authController.resendOtp);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/me', checkAuth(), authController.getMe);
router.post('/change-password', checkAuth(), validateRequest(authValidation.changePassword), authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/social/google', validateRequest(authValidation.googleSignIn), authController.googleSignIn);

export const authRoutes = router;
