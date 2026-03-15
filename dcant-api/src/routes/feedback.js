// ═══════════════════════════════════════════
// DCANT API — Routes Feedback
// POST /api/feedback
// GET  /api/feedback          (admin)
// GET  /api/feedback/done/:n  (vérifie si déjà répondu)
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize } from '../middleware/validate.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
  const { question, reponse, commentaire } = req.body;
  const questionN = parseInt(question);
  if (!questionN || questionN < 1 || questionN > 10) {
    return res.status(400).json({ ok: false, error: 'Question invalide.' });
  }

  try {
    await db.query(
      'INSERT INTO feedback (user_id, question, reponse, commentaire) VALUES ($1, $2, $3, $4)',
      [req.userId, questionN, sanitize(String(reponse), 500), sanitize(commentaire, 2000)]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[FEEDBACK] create error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM feedback ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.get('/done/:n', requireAuth, async (req, res) => {
  const n = parseInt(req.params.n);
  if (!n) return res.json({ done: false });

  try {
    const { rows } = await db.query(
      'SELECT id FROM feedback WHERE user_id = $1 AND question = $2 LIMIT 1',
      [req.userId, n]
    );
    res.json({ done: rows.length > 0 });
  } catch (err) {
    res.json({ done: false });
  }
});

export default router;
