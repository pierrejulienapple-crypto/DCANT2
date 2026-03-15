// ═══════════════════════════════════════════
// DCANT API — Routes Calculs (historique)
// GET    /api/calculs          — liste paginée
// POST   /api/calculs          — créer
// PUT    /api/calculs/:id      — modifier
// DELETE /api/calculs/:id      — supprimer
// ═══════════════════════════════════════════

import { Router } from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { sanitize, toNumber, isValidUUID } from '../middleware/validate.js';

const router = Router();

// Normalise le domaine : première lettre de chaque mot en majuscule
function normaliseDomaine(str) {
  if (!str) return '';
  return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
}

function buildRow(body) {
  return {
    domaine: normaliseDomaine(sanitize(body.domaine, 200)),
    cuvee: sanitize(body.cuvee, 200),
    appellation: sanitize(body.appellation, 200),
    millesime: sanitize(body.millesime, 10),
    commentaire: sanitize(body.commentaire, 1000),
    prix_achat: toNumber(body.prixAchat),
    charges: toNumber(body.charges),
    cout_revient: toNumber(body.cr),
    mode: sanitize(body.mode, 20),
    mode_value: toNumber(body.modeValue),
    pvht: toNumber(body.pvht),
    marge_euros: toNumber(body.mE),
    marge_pct: toNumber(body.pct),
    coeff: toNumber(body.coeff),
    pvttc: toNumber(body.pvttc)
  };
}

// ── Liste paginée ──

router.get('/', requireAuth, async (req, res) => {
  const offset = Math.max(0, parseInt(req.query.offset) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));

  try {
    const { rows } = await db.query(
      `SELECT * FROM calculs WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );
    res.json({ data: rows, hasMore: rows.length === limit });
  } catch (err) {
    console.error('[CALCULS] get error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── Créer ──

router.post('/', requireAuth, async (req, res) => {
  const row = buildRow(req.body);

  // Champs RGPD optionnels
  const source = req.body.source ? sanitize(req.body.source, 20) : null;
  const partage = req.body.partage_benchmark === true;

  try {
    const { rows } = await db.query(
      `INSERT INTO calculs (user_id, domaine, cuvee, appellation, millesime, commentaire,
        prix_achat, charges, cout_revient, mode, mode_value, pvht, marge_euros, marge_pct,
        coeff, pvttc, source, partage_benchmark)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [req.userId, row.domaine, row.cuvee, row.appellation, row.millesime, row.commentaire,
       row.prix_achat, row.charges, row.cout_revient, row.mode, row.mode_value,
       row.pvht, row.marge_euros, row.marge_pct, row.coeff, row.pvttc,
       source, partage]
    );
    res.status(201).json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('[CALCULS] create error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

// ── Modifier ──

router.put('/:id', requireAuth, async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'ID invalide.' });
  }

  const row = buildRow(req.body);

  try {
    const { rowCount } = await db.query(
      `UPDATE calculs SET domaine=$1, cuvee=$2, appellation=$3, millesime=$4, commentaire=$5,
        prix_achat=$6, charges=$7, cout_revient=$8, mode=$9, mode_value=$10,
        pvht=$11, marge_euros=$12, marge_pct=$13, coeff=$14, pvttc=$15
       WHERE id=$16 AND user_id=$17`,
      [row.domaine, row.cuvee, row.appellation, row.millesime, row.commentaire,
       row.prix_achat, row.charges, row.cout_revient, row.mode, row.mode_value,
       row.pvht, row.marge_euros, row.marge_pct, row.coeff, row.pvttc,
       req.params.id, req.userId]
    );

    if (!rowCount) return res.status(404).json({ ok: false, error: 'Non trouvé.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[CALCULS] update error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

// ── Supprimer ──

router.delete('/:id', requireAuth, async (req, res) => {
  if (!isValidUUID(req.params.id)) {
    return res.status(400).json({ ok: false, error: 'ID invalide.' });
  }

  try {
    await db.query(
      'DELETE FROM calculs WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[CALCULS] delete error:', err.message);
    res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

export default router;
