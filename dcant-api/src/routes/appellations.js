// ═══════════════════════════════════════════
// DCANT API — Routes Appellations (référentiel)
// GET /api/appellations — liste complète (public, pas d'auth)
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';

const router = Router();

// Cache en mémoire (les appellations changent rarement)
let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1h

router.get('/', async (req, res) => {
  try {
    // Charge le cache si nécessaire
    if (!_cache || Date.now() - _cacheTime >= CACHE_TTL) {
      const { rows } = await db.query(
        'SELECT nom, pays, region, type FROM appellations ORDER BY nom'
      );
      _cache = rows;
      _cacheTime = Date.now();
    }

    const q = req.query.q;
    if (q) {
      const lower = q.toLowerCase();
      const filtered = _cache
        .filter(a => a.nom.toLowerCase().includes(lower))
        .slice(0, 20);
      return res.json(filtered);
    }

    res.json(_cache);
  } catch (err) {
    console.error('[APPELLATIONS] error:', err.message);
    res.status(500).json([]);
  }
});

export default router;
