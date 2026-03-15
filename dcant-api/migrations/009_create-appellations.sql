-- Migration 009: Table appellations (référentiel)

CREATE TABLE appellations (
  id     SERIAL PRIMARY KEY,
  nom    TEXT NOT NULL,
  pays   TEXT DEFAULT '',
  region TEXT DEFAULT '',
  type   TEXT DEFAULT ''
);

CREATE INDEX idx_appellations_nom ON appellations(nom);
