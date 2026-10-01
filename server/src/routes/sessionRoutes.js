import { Router } from 'express';
import { endSession, getSessionById } from '../controllers/sessionController.js';
import { getSessionFlags } from '../controllers/flagController.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// POST /api/v1/sessions/:id/end
router.post('/:id/end', authenticateJWT, requireRole('candidate'), endSession);

// GET /api/v1/sessions/:id (Session details)
router.get('/:id', authenticateJWT, getSessionById);

// GET /api/v1/sessions/:id/flags
router.get('/:id/flags', authenticateJWT, getSessionFlags);

export default router;
