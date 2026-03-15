// ═══════════════════════════════════════════
// DCANT API — Script de migration SQL
// Usage: node migrate.js
// Exécute les fichiers migrations/*.sql en ordre
// ═══════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL requis. Ex: DATABASE_URL=postgresql://dcant:pass@localhost/dcant node migrate.js');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

async function run() {
  await client.connect();
  console.log('[MIGRATE] Connecté à PostgreSQL');

  // Table de tracking des migrations
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  const { rows: applied } = await client.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.map(r => r.name));

  const dir = path.join(import.meta.dirname, 'migrations');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  [SKIP] ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
    console.log(`  [RUN]  ${file}`);

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      count++;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  [FAIL] ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`[MIGRATE] Terminé — ${count} migration(s) appliquée(s)`);
  await client.end();
}

run().catch(err => {
  console.error('[MIGRATE] Fatal:', err);
  process.exit(1);
});
