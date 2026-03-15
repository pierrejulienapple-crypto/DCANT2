-- Migration 007: Vue benchmark_public (medianes marche)

CREATE VIEW benchmark_public AS
  SELECT
    appellation,
    millesime,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY pvht)       AS mediane_pvht,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prix_achat)  AS mediane_prix_achat,
    COUNT(DISTINCT user_id)                                   AS nb_contributeurs
  FROM calculs
  WHERE partage_benchmark = true
    AND appellation != ''
    AND millesime != ''
  GROUP BY appellation, millesime;
