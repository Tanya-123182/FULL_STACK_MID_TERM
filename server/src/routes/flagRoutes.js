import { Router } from 'express';
import { getFlagById, reviewFlag } from '../controllers/flagController.js';
import { authenticateJWT, requireRole } from '../middleware/auth.js';

const router = Router();

// GET /api/v1/flags/:id
router.get('/:id', authenticateJWT, getFlagById);

// PATCH /api/v1/flags/:id (Proctor / Admin only)
router.patch('/:id', authenticateJWT, requireRole('proctor', 'admin'), reviewFlag);

export default router;
