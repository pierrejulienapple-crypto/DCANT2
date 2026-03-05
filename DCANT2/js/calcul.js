// ═══════════════════════════════════════════
// DCANT — Logique métier
// Aucune dépendance DOM ni stockage
// Réutilisable en React Native, Node, etc.
// ═══════════════════════════════════════════

const Calcul = (() => {

  const TVA = DCANT_CONFIG.tva;

  // Calcul principal — retourne null si invalide
  function calculer(coutRevient, modeValue, mode) {
    if (!coutRevient || coutRevient <= 0) return null;
    if (!modeValue || modeValue <= 0) return null;
    if (!['euros', 'pct', 'coeff'].includes(mode)) return null;

    let pvht, margeEuros;

    switch (mode) {
      case 'euros':
        margeEuros = modeValue;
        pvht = coutRevient + modeValue;
        break;
      case 'pct':
        if (modeValue <= 0 || modeValue >= 100) return null;
        pvht = coutRevient / (1 - modeValue / 100);
        margeEuros = pvht - coutRevient;
        break;
      case 'coeff':
        if (modeValue <= 1) return null;
        pvht = coutRevient * modeValue;
        margeEuros = pvht - coutRevient;
        break;
    }

    if (!isFinite(pvht) || pvht <= 0 || pvht > 1000000) return null;
    if (margeEuros < 0) return null;

    return {
      pvht:       _round(pvht),
      pvttc:      _round(pvht * (1 + TVA)),
      mE:         _round(margeEuros),
      pct:        _round((margeEuros / pvht) * 100, 2),
      coeff:      _round(pvht / coutRevient, 3)
    };
  }

  // Calcule le coût de revient à partir des charges
  function calculerCR(prixAchat, charges) {
    const pa = parseFloat(prixAchat) || 0;
    if (!charges) return pa;
    const total = (parseFloat(charges.transport) || 0)
      + (parseFloat(charges.douane) || 0)
      + (charges.others || []).reduce((s, o) => s + (parseFloat(o.val) || 0), 0);
    return _round(pa + total);
  }

  // Normalise un objet charges — valeurs numériques, total recalculé
  function normaliserCharges(raw) {
    const transport = parseFloat(raw?.transport) || 0;
    const douane = parseFloat(raw?.douane) || 0;
    const others = (raw?.others || [])
      .filter(o => o && parseFloat(o.val) > 0)
      .map(o => ({ label: o.label || 'Autre', val: parseFloat(o.val) }));
    const total = transport + douane + others.reduce((s, o) => s + o.val, 0);
    return { transport, douane, others, total };
  }

  // Formate un nombre en format français
  function formater(n, decimales = 2) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return Number(n).toLocaleString('fr-FR', {
      minimumFractionDigits: decimales,
      maximumFractionDigits: decimales
    });
  }

  // Génère le CSV d'export
  function genererCSV(entries) {
    const headers = [
      'Date', 'Domaine', 'Cuvée', 'Millésime',
      'PA HT (€)', 'Transport (€)', 'Douane (€)', 'Coût de revient (€)',
      'Mode', 'Valeur mode', 'PV HT (€)', 'Marge (€)', 'Marge (%)', 'Coefficient', 'PV TTC (€)',
      'Commentaire'
    ];

    const rows = entries.map(e => [
      e.created_at ? new Date(e.created_at).toLocaleDateString('fr-FR') : '',
      e.domaine || '',
      e.cuvee || '',
      e.millesime || '',
      e.prix_achat,
      e.charges?.transport || 0,
      e.charges?.douane || 0,
      e.cout_revient,
      e.mode,
      e.mode_value,
      e.pvht,
      e.marge_euros,
      e.marge_pct,
      e.coeff,
      e.pvttc,
      e.commentaire || ''
    ].map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';'));

    return '\uFEFF' + [headers.join(';'), ...rows].join('\n');
  }

  function _round(n, dec = 2) {
    return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
  }

  return { calculer, calculerCR, normaliserCharges, formater, genererCSV };

})();
