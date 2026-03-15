-- Migration 002: Table calculs (historique des calculs)

CREATE TABLE calculs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domaine           TEXT NOT NULL DEFAULT '',
  cuvee             TEXT DEFAULT '',
  appellation       TEXT DEFAULT '',
  millesime         TEXT DEFAULT '',
  commentaire       TEXT DEFAULT '',
  prix_achat        NUMERIC(10,2),
  charges           NUMERIC(10,2),
  cout_revient      NUMERIC(10,2),
  mode              TEXT,
  mode_value        NUMERIC(10,4),
  pvht              NUMERIC(10,2),
  marge_euros       NUMERIC(10,2),
  marge_pct         NUMERIC(10,4),
  coeff             NUMERIC(10,4),
  pvttc             NUMERIC(10,2),
  source            TEXT,
  partage_benchmark BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_calculs_user_date ON calculs(user_id, created_at DESC);
CREATE INDEX idx_calculs_benchmark ON calculs(appellation, millesime)
  WHERE partage_benchmark = true AND appellation != '' AND millesime != '';
