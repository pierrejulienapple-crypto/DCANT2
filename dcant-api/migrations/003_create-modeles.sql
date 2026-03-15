-- Migration 003: Table modeles (modeles de marge)

CREATE TABLE modeles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom        TEXT NOT NULL,
  mode       TEXT,
  mode_value NUMERIC(10,4),
  transport  NUMERIC(10,2) DEFAULT 0,
  douane     NUMERIC(10,2) DEFAULT 0,
  others     JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_modeles_user ON modeles(user_id, created_at ASC);
