// ═══════════════════════════════════════════
// DCANT — Appel Mistral API via proxy /api/ai
// ═══════════════════════════════════════════

async function callClaudeAPI(images, corrections, options) {
  // images = tableau de { base64, media_type }
  // options = { isPhoto: bool } — indique si c'est une photo prise au téléphone
  options = options || {};

  let learningContext = '';
  if (corrections && corrections.length > 0) {
    learningContext = `\n\nCorrections passées (apprends de ces erreurs) :\n` +
      corrections.map(c => `- "${c.original}" corrigé en "${c.corrected}" (champ: ${c.field})`).join('\n');
  }

  // Référentiel d'appellations officielles pour le matching IA (toutes — FR + Europe)
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

  // Instructions supplémentaires pour les photos de documents
  const photoContext = options.isPhoto ? `\nATTENTION — PHOTO DE DOCUMENT : image prise au téléphone (flou, distorsion, ombres possibles). Identifie la structure du document, lis ligne par ligne, privilégie la quantité d'extraction même avec des scores bas.` : '';

  const prompt = `[Contexte] Tu es un expert en analyse de documents viticoles, spécialisé dans l'extraction de données structurées à partir d'images ou de textes de factures, catalogues ou listes de vins. Tu connais les appellations officielles françaises et internationales.

[Tâche] Analyse ce document (${images.length} page${images.length > 1 ? 's' : ''}) et extrais **tous les vins** sous forme de JSON.
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
- Uniquement si AUCUN vin n'est trouvé : {"erreur": "Aucun vin détecté dans ce document."}${photoContext}${learningContext}${appellationContext}

[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.`;

  // Construit les content blocks : une image par page + le prompt texte (format OpenAI/Mistral)
  const content = images.map(img => ({
    type: 'image_url',
    image_url: { url: `data:${img.media_type};base64,${img.base64}` }
  }));
  content.push({ type: 'text', text: prompt });

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',  // Anthropic Sonnet 4.6 (vision) — routé automatiquement par le proxy
      max_tokens: 8000,
      temperature: 0.1,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('[API] HTTP', response.status, detail);
    if (response.status === 401) {
      let reason = '';
      try {
        const j = JSON.parse(detail);
        reason = j.reason || j.error || j.message || detail.substring(0, 100);
      } catch(e) {
        reason = detail.substring(0, 100);
      }
      throw new Error('Erreur auth (401): ' + reason);
    }
    throw new Error('Erreur API ' + response.status + ': ' + detail.substring(0, 200));
  }

  const data = await response.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Réponse API vide ou invalide');
  }
  const text = data.choices[0].message.content.trim();
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
