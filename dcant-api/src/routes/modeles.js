// ═══════════════════════════════════════════
// DCANT API — Routes Modeles de marge
// GET    /api/modeles
// POST   /api/modeles
// DELETE /api/modeles/:id
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize, toNumber, isValidUUID } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM modeles WHERE user_id = $1 ORDER BY created_at ASC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[MODELES] get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, mode, modeValue, transport, douane, others } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO modeles (user_id, nom, mode, mode_value, transport, douane, others)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.userId,
        sanitize(name, 100),
        sanitize(mode, 20),
        toNumber(modeValue),
        toNumber(transport) || 0,
        toNumber(douane) || 0,
        JSON.stringify(Array.isArray(others) ? others : [])
      ]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[MODELES] create error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'ID invalide.' });
  }

  try {
    await db.query(
      'DELETE FROM modeles WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[MODELES] delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

export default router;
