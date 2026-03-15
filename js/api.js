// ═══════════════════════════════════════════
// DCANT — Pipeline IA : Pixtral OCR → Devstral Analyse
// Étape 1 : Pixtral extrait le texte brut du document (vision)
// Étape 2 : Devstral analyse le texte et produit le JSON structuré
// Étape 3 : Matching appellations côté client (post-traitement)
// ═══════════════════════════════════════════

async function callClaudeAPI(images, corrections, options) {
  options = options || {};

  // ════════════════════════════════════════
  // ÉTAPE 1 — Pixtral : OCR (extraction texte brut)
  // ════════════════════════════════════════

  const photoHint = options.isPhoto
    ? ' ATTENTION : photo prise au téléphone (flou, distorsion, ombres possibles). Lis ligne par ligne avec soin.'
    : '';

  const ocrPrompt = `Tu es un OCR expert. Extrais TOUT le texte visible de ce document (${images.length} page${images.length > 1 ? 's' : ''}).${photoHint}

Règles :
- Conserve la structure du document (colonnes, tableaux, en-têtes, pieds de page).
- Pour les tableaux, sépare les colonnes par " | " et les lignes par un retour à la ligne.
- Inclus TOUS les nombres, prix, pourcentages, dates, références.
- Si un texte est flou ou incertain, écris-le quand même suivi de [?].
- N'ajoute aucune interprétation, aucun commentaire. Uniquement le texte extrait.`;

  const ocrContent = images.map(img => ({
    type: 'image_url',
    image_url: { url: `data:${img.media_type};base64,${img.base64}` }
  }));
  ocrContent.push({ type: 'text', text: ocrPrompt });

  console.log('[DCANT] Étape 1/2 — Pixtral OCR...');

  const ocrResponse = await fetch(DCANT_CONFIG.apiUrl + '/api/ai', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: 'pixtral-large-latest',
      max_tokens: 8000,
      temperature: 0,
      messages: [{ role: 'user', content: ocrContent }]
    })
  });

  if (!ocrResponse.ok) {
    const detail = await ocrResponse.text();
    console.error('[API] OCR HTTP', ocrResponse.status, detail);
    if (ocrResponse.status === 401) {
      let reason = '';
      try { const j = JSON.parse(detail); reason = j.reason || j.error || j.message || detail.substring(0, 100); } catch(e) { reason = detail.substring(0, 100); }
      throw new Error('Erreur auth (401): ' + reason);
    }
    throw new Error('Erreur OCR ' + ocrResponse.status + ': ' + detail.substring(0, 200));
  }

  const ocrData = await ocrResponse.json();
  if (!ocrData.choices || !ocrData.choices[0] || !ocrData.choices[0].message) {
    throw new Error('Réponse OCR vide ou invalide');
  }
  const extractedText = ocrData.choices[0].message.content.trim();
  console.log('[DCANT] OCR terminé:', extractedText.length, 'caractères');
  console.log('[DCANT] OCR extrait:', extractedText.substring(0, 300));

  // ════════════════════════════════════════
  // ÉTAPE 2 — Devstral : Analyse structurée
  // ════════════════════════════════════════

  let learningContext = '';
  if (corrections && corrections.length > 0) {
    learningContext = `\n\nCorrections passées (apprends de ces erreurs) :\n` +
      corrections.map(c => `- "${c.original}" corrigé en "${c.corrected}" (champ: ${c.field})`).join('\n');
  }

  const analysePrompt = `Tu es un expert en documents viticoles. Voici un texte extrait par OCR d'une facture/catalogue de vins.

TEXTE DU DOCUMENT :
${extractedText}

TÂCHE : Extrais tous les vins en JSON. Pour chaque vin :
- domaine (str) : producteur
- cuvee (str ou null) : nom de cuvée
- appellation (str) : appellation viticole (cherche partout : en-tête, colonnes, mentions globales)
- millesime (int ou null) : année
- prix_ht_unitaire (float) : prix HT unitaire. Virgule → point (15,50 → 15.50). Prends le prix UNITAIRE, pas le total ligne.
- score_confiance (float 0-1) : certitude de lecture

RÈGLES :
- Si une seule appellation dans le document → applique-la à tous les vins
- TTC → divise par 1.20 pour obtenir HT
- Retourne TOUJOURS du JSON même si incertain (mets score bas)
- Si aucun vin : {"erreur": "Aucun vin détecté"}${learningContext}

FORMAT (JSON uniquement, pas d'explication) :
{"vins": [{"domaine": "", "cuvee": "", "appellation": "", "millesime": 0, "prix_ht_unitaire": 0.0, "score_confiance": 0.9}]}`;

  console.log('[DCANT] Étape 2/2 — Devstral analyse...', analysePrompt.length, 'chars');

  const analyseResponse = await fetch(DCANT_CONFIG.apiUrl + '/api/ai', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: 'devstral-medium-latest',
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: analysePrompt }]
    })
  });

  if (!analyseResponse.ok) {
    const detail = await analyseResponse.text();
    console.error('[API] Analyse HTTP', analyseResponse.status, detail);
    throw new Error('Erreur analyse ' + analyseResponse.status + ': ' + detail.substring(0, 200));
  }

  const analyseData = await analyseResponse.json();
  if (!analyseData.choices || !analyseData.choices[0] || !analyseData.choices[0].message) {
    console.error('[DCANT] Réponse Devstral brute:', JSON.stringify(analyseData).substring(0, 500));
    throw new Error('Réponse analyse vide ou invalide');
  }
  const text = analyseData.choices[0].message.content.trim();
  console.log('[DCANT] Devstral brut:', text.substring(0, 300));
  // Extraire le JSON même si Devstral ajoute du texte autour
  let clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  // Si la réponse commence par du texte, chercher le premier {
  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');
  if (jsonStart > 0 && jsonEnd > jsonStart) {
    clean = clean.substring(jsonStart, jsonEnd + 1);
  }
  let parsed = JSON.parse(clean);

  // ── Normalisation : {vins} → {cuvees} ──
  if (parsed.vins && !parsed.cuvees) {
    parsed = {
      cuvees: parsed.vins.map(v => ({
        domaine: v.domaine || '',
        cuvee: v.cuvee || v.cuvée || '',
        appellation: v.appellation || '',
        millesime: v.millesime || v.millésime || '',
        prix: v.prix_ht_unitaire || v.prix || 0,
        confiance: typeof v.score_confiance === 'number'
          ? { domaine: v.score_confiance, cuvee: v.score_confiance, appellation: v.score_confiance, millesime: v.score_confiance, prix: v.score_confiance }
          : (v.confiance || { domaine: 0.9, cuvee: 0.9, appellation: 0.8, millesime: 0.7, prix: 0.9 }),
        alternatives: Array.isArray(v.alternatives) ? { appellation: v.alternatives } : (v.alternatives || {}),
        appellation_match: v.appellation_match || 'unknown',
        appellation_suggestions: v.alternatives || v.appellation_suggestions || []
      })),
      nb_total: parsed.vins.length,
      avertissement: parsed.metadata?.warnings?.join('. ') || null
    };
  }

  // ── Étape 3 : Matching appellations côté client ──
  if (parsed.cuvees && typeof Appellations !== 'undefined' && Appellations.isReady()) {
    const allNames = Appellations.getNames();
    for (const c of parsed.cuvees) {
      if (!c.appellation) continue;
      const lower = c.appellation.toLowerCase()
        .replace(/^(aop|aoc|igp|doc|docg|do)\s+/i, '')
        .trim();
      // Cherche un match exact
      const exact = allNames.find(n => n.toLowerCase() === lower);
      if (exact) {
        c.appellation = exact;
        c.appellation_match = 'exact';
      } else {
        // Cherche un match partiel (contient)
        const partial = allNames.filter(n => n.toLowerCase().includes(lower) || lower.includes(n.toLowerCase()));
        if (partial.length > 0) {
          c.appellation = partial[0];
          c.appellation_match = 'partial';
          c.appellation_suggestions = partial.slice(0, 3);
        } else {
          c.appellation_match = 'unknown';
        }
      }
    }
  }

  if (!parsed.cuvees || parsed.cuvees.length === 0) {
    console.error('API response:', text);
  }
  return parsed;
}
