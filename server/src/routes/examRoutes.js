import { Router } from 'express';
import {
  createExam,
  getExamById,
  updateExam,
  getExams
} from '../controllers/examController.js';
import {
  startSession,
  getExamSessions
} from '../controllers/sessionController.js';
import { getExamFlags } from '../controllers/flagController.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// Exam management routes
router.post('/', authenticateJWT, requireRole('admin'), createExam);
router.get('/', authenticateJWT, getExams);
router.get('/:id', authenticateJWT, getExamById);
router.patch('/:id', authenticateJWT, requireRole('admin'), updateExam);

// Session routes nested under exam
router.post('/:id/sessions', authenticateJWT, requireRole('candidate'), startSession);
router.get('/:id/sessions', authenticateJWT, requireRole('proctor', 'admin'), getExamSessions);

// Flag routes nested under exam
router.get('/:id/flags', authenticateJWT, requireRole('proctor', 'admin'), getExamFlags);

export default router;
