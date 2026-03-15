// ═══════════════════════════════════════════
// DCANT API — Connexion PostgreSQL
// ═══════════════════════════════════════════

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/** Raccourci query — usage: const { rows } = await db.query('SELECT ...', [param]) */
export default {
  query: (text, params) => pool.query(text, params),
  pool
};
