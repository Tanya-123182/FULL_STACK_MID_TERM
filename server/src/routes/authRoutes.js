import { Router } from 'express';
import {
  login,
  getMe,
  candidateTest,
  proctorTest,
  adminTest,
  listUsers
} from '../controllers/authController.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// Public auth routes
router.post('/login', login);

// Protected routes
router.get('/me', authenticateJWT, getMe);
router.get('/users', authenticateJWT, requireRole('admin'), listUsers);

// Role verification test routes
router.get('/candidate-test', authenticateJWT, requireRole('candidate'), candidateTest);
router.get('/proctor-test', authenticateJWT, requireRole('proctor'), proctorTest);
router.get('/admin-test', authenticateJWT, requireRole('admin'), adminTest);

export default router;
