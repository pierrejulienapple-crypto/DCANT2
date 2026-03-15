-- Migration 005: Table export_history

CREATE TABLE export_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT,
  instruction     TEXT,
  interpretation  TEXT,
  selected_format TEXT,
  template_custom TEXT,
  generated_html  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_export_history_user ON export_history(user_id, created_at DESC);
