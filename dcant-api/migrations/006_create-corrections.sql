-- Migration 006: Table corrections (apprentissage IA)

CREATE TABLE corrections (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  field     TEXT NOT NULL,
  original  TEXT,
  corrected TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_corrections_field ON corrections(field);
