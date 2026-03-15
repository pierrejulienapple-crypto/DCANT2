// ═══════════════════════════════════════════
// DCANT API — Routes Export History
// GET    /api/exports
// POST   /api/exports
// DELETE /api/exports/:id
// DELETE /api/exports (batch, body: { ids: [...] })
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize, isValidUUID } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM export_history WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('[EXPORT] get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const { name, instruction, interpretation, selected_format, template_custom, generated_html } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO export_history (user_id, name, instruction, interpretation, selected_format, template_custom, generated_html)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        req.userId,
        sanitize(name, 200),
        sanitize(instruction, 5000),
        sanitize(interpretation, 5000),
        sanitize(selected_format, 50),
        sanitize(template_custom, 50000),
        sanitize(generated_html, 50000)
      ]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[EXPORT] create error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

router.delete('/batch', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every(isValidUUID)) {
    return res.status(400).json({ ok: false, error: 'IDs invalides.' });
  }

  try {
    await db.query(
      'DELETE FROM export_history WHERE id = ANY($1) AND user_id = $2',
      [ids, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[EXPORT] batch delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'ID invalide.' });
  }

  try {
    await db.query(
      'DELETE FROM export_history WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[EXPORT] delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

export default router;
