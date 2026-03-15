// ═══════════════════════════════════════════
// DCANT API — Routes Corrections (apprentissage IA)
// GET  /api/corrections
// POST /api/corrections
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM corrections WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[CORRECTIONS] get error:', err.message);
    res.json([]);
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { original, corrected, field } = req.body;

  try {
    await db.query(
      'INSERT INTO corrections (user_id, field, original, corrected) VALUES ($1, $2, $3, $4)',
      [req.userId, sanitize(field, 50), sanitize(original, 500), sanitize(corrected, 500)]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[CORRECTIONS] create error:', err.message);
    res.status(500).json({ ok: false });
  }
});

export default router;
