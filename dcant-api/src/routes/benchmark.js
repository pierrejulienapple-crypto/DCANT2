// ═══════════════════════════════════════════
// DCANT API — Routes Benchmark
// GET /api/benchmark?appellation=...&millesime=...
// POST /api/benchmark/consent   (toggle partage)
// GET  /api/benchmark/count     (nombre de contributeurs)
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize } from '../middleware/validate.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const appellation = sanitize(req.query.appellation, 200);
  const millesime = sanitize(req.query.millesime, 10);

  if (!appellation || !millesime) {
    return res.status(400).json({ error: 'appellation et millesime requis.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT mediane_pvht, mediane_prix_achat, nb_contributeurs
       FROM benchmark_public
       WHERE appellation = $1 AND millesime = $2`,
      [appellation, millesime]
    );
    res.json(rows[0] || null);
  } catch (err) {
    console.error('[BENCHMARK] get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

router.post('/consent', requireAuth, async (req, res) => {
  const consent = req.body.consent === true;

  try {
    await db.query(
      'UPDATE calculs SET partage_benchmark = $1 WHERE user_id = $2',
      [consent, req.userId]
    );
    res.json({ ok: true, consent });
  } catch (err) {
    console.error('[BENCHMARK] consent error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

router.get('/count', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(DISTINCT user_id) AS count FROM calculs WHERE partage_benchmark = true'
    );
    res.json({ count: parseInt(rows[0].count) || 0 });
  } catch (err) {
    res.json({ count: 0 });
  }
});

// Vérifie si le user contribue (a au moins un calcul avec partage=true)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id FROM calculs WHERE user_id = $1 AND partage_benchmark = true LIMIT 1',
      [req.userId]
    );
    res.json({ contributing: rows.length > 0 });
  } catch (err) {
    res.json({ contributing: false });
  }
});

export default router;
