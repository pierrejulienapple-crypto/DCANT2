// ═══════════════════════════════════════════
// DCANT — Pipeline IA : Pixtral OCR → Devstral Analyse
// Étape 1 : Pixtral extrait le texte brut du document (vision)
// Étape 2 : Devstral analyse le texte et produit le JSON structuré
// ═══════════════════════════════════════════

async function callClaudeAPI(images, corrections, options) {
  // images = tableau de { base64, media_type }
  // options = { isPhoto: bool } — indique si c'est une photo prise au téléphone
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

  // ════════════════════════════════════════
  // ÉTAPE 2 — Devstral : Analyse structurée
  // ════════════════════════════════════════

  let learningContext = '';
  if (corrections && corrections.length > 0) {
    learningContext = `\n\nCorrections passées (apprends de ces erreurs) :\n` +
      corrections.map(c => `- "${c.original}" corrigé en "${c.corrected}" (champ: ${c.field})`).join('\n');
  }

  let appellationContext = '';
  if (typeof Appellations !== 'undefined' && Appellations.isReady()) {
    const names = Appellations.getNames();
    if (names.length > 0) {
      const namesStr = names.join(' | ');
      appellationContext = `\n\nRÉFÉRENTIEL APPELLATIONS OFFICIELLES (${names.length} entrées) :\n` +
        namesStr +
        `\nUtilise TOUJOURS le nom exact de ce référentiel pour le champ "appellation". Ignore les préfixes (IGP, AOP, AOC, DOC, DOCG) et suffixes (Biologico, Bio, Superiore) pour le matching.`;
    }
  }

  const analysePrompt = `[Contexte] Tu es un expert en analyse de documents viticoles, spécialisé dans l'extraction de données structurées à partir de textes de factures, catalogues ou listes de vins. Tu connais les appellations officielles françaises et internationales.

[Document extrait par OCR]
${extractedText}

[Tâche] Analyse ce texte et extrais **tous les vins** sous forme de JSON.
Pour chaque vin, détermine :
- domaine (str) : Nom du domaine/producteur.
- cuvée (str ou null) : Nom de la cuvée si présent.
- appellation (str) : Doit matcher exactement une appellation du référentiel si fourni. Si ambiguïté, retourne la plus probable avec un score_confiance < 1.0. RÈGLE ABSOLUE : remplis ce champ pour CHAQUE vin. Cherche partout (en-tête, pied de page, colonne, mention globale). Si UNE SEULE appellation dans tout le document, applique-la à TOUS les vins.
- millésime (int ou null) : Année de récolte.
- prix_ht_unitaire (float) : Prix HT unitaire (convertis les virgules européennes en points : "15,50€" → 15.50). Si plusieurs colonnes de prix (qté, prix unit., total), prends le PRIX UNITAIRE HT. Si seul le TTC est présent, calcule HT avec TVA 20%. Si > 500€/bouteille, vérifie virgule décimale vs séparateur de milliers.
- score_confiance (float) : [0.0-1.0] selon la clarté (1.0 = parfait, 0.5 = flou, 0.1 = incertain).
- alternatives (array) : Liste de 1-3 appellations possibles si score_confiance < 0.8.

[Format de sortie]
{"vins": [{"domaine": "str", "cuvee": "str ou null", "appellation": "str", "millesime": "int ou null", "prix_ht_unitaire": "float", "score_confiance": "float", "alternatives": ["str"]}], "metadata": {"pages_analysées": "int", "warnings": ["str"]}}

[Règles]
- Gère les multi-colonnes et les tableaux (associe chaque ligne à un vin).
- Pour les prix : priorité aux valeurs "€ HT" ou "HT".
- Si un champ est illisible : mets null et ajoute un warning dans metadata.warnings.
- Max 100 vins.
- Retourne TOUJOURS le JSON, même si tu n'es pas sûr. Mets des scores bas si nécessaire.
- Uniquement si AUCUN vin n'est trouvé : {"erreur": "Aucun vin détecté dans ce document."}${learningContext}${appellationContext}

[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.`;

  console.log('[DCANT] Étape 2/2 — Devstral analyse...');

  const analyseResponse = await fetch(DCANT_CONFIG.apiUrl + '/api/ai', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: 'devstral-medium-latest',
      max_tokens: 8000,
      temperature: 0.1,
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
    throw new Error('Réponse analyse vide ou invalide');
  }
  const text = analyseData.choices[0].message.content.trim();
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  let parsed = JSON.parse(clean);

  // ── Normalisation : nouveau format {vins} → ancien format {cuvees} ──
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
        appellation_match: v.appellation_match || (Array.isArray(v.alternatives) && v.alternatives.length ? 'unsure' : 'unknown'),
        appellation_suggestions: v.alternatives || v.appellation_suggestions || []
      })),
      nb_total: parsed.vins.length,
      avertissement: parsed.metadata?.warnings?.join('. ') || null
    };
  }

  if (!parsed.cuvees || parsed.cuvees.length === 0) {
    console.error('API response:', text);
  }
  return parsed;
}
