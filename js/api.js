// ═══════════════════════════════════════════
// DCANT — Appel Claude API via proxy /api/ai
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

  // Référentiel d'appellations officielles pour le matching
  let appellationContext = '';
  if (typeof Appellations !== 'undefined' && Appellations.isReady()) {
    const names = Appellations.getNames();
    if (names.length > 0) {
      appellationContext = `\n\nRÉFÉRENTIEL APPELLATIONS OFFICIELLES (${names.length} entrées) :\n` +
        names.join('\n') +
        `\n\nINSTRUCTION APPELLATION : Pour chaque vin, compare l'appellation lue sur le document avec ce référentiel.
- Si tu trouves un match exact ou quasi-exact (accent, casse, abréviation) → utilise le nom officiel du référentiel et mets "appellation_match": "ok"
- Si tu hésites entre plusieurs appellations ou que l'appellation lue ne correspond à rien dans le référentiel → mets "appellation_match": "unsure" et remplis "appellation_suggestions": [les 3 appellations les plus proches du référentiel]
- Si l'appellation est clairement absente du référentiel (vin étranger rare, etc.) → mets "appellation_match": "unknown" et laisse "appellation_suggestions": []`;
    }
  }

  // Instructions supplémentaires pour les photos de documents
  const photoContext = options.isPhoto ? `

ATTENTION — PHOTO DE DOCUMENT : Cette image est une photo prise avec un téléphone, pas un PDF numérique. Elle peut contenir :
- Du flou, de la distorsion de perspective, des ombres
- Du texte partiellement coupé ou incliné
- Des reflets ou un éclairage inégal
- Des colonnes de prix mal alignées

Stratégie de lecture :
1. Identifie d'abord la STRUCTURE du document (colonnes, lignes, en-têtes)
2. Lis ligne par ligne en suivant la structure identifiée
3. Pour les prix, cherche des patterns numériques (xx,xx ou xx.xx) alignés en colonne
4. Si un mot est illisible, déduis-le du contexte viticole (appellations connues, domaines courants)
5. Privilégie la QUANTITÉ : extrais tous les vins visibles même partiellement, avec des scores de confiance bas si nécessaire
6. Ne saute AUCUNE ligne — mieux vaut une extraction incertaine qu'une omission` : '';

  const prompt = `Tu es un expert en vins. Analyse cette image (${images.length} page${images.length > 1 ? 's' : ''}).

OBJECTIF : Extraire tous les vins mentionnés avec leurs prix. Le document peut être un tarif, une facture, un bon de commande, un catalogue, une carte des vins, un mail, ou tout autre document contenant des vins et des prix. Même si l'image est floue ou de mauvaise qualité, fais de ton mieux pour extraire les informations visibles.${photoContext}

Pour chaque vin trouvé, retourne :
- domaine : nom du domaine/producteur
- cuvee : nom de la cuvée (peut être vide)
- appellation : appellation d'origine (AOC/AOP/IGP, ex: "Savigny-lès-Beaune 1er Cru", "Côtes du Rhône") — peut être vide
- millesime : année (peut être vide)
- prix : prix HT en nombre décimal (si plusieurs prix, prends le prix unitaire HT le plus probable)
- confiance : score 0 à 1 pour chaque champ
- alternatives : valeurs alternatives pour les champs incertains (confiance < 0.8)
- appellation_match : "ok" si l'appellation correspond au référentiel, "unsure" si doute, "unknown" si absente du référentiel
- appellation_suggestions : tableau des 3 appellations officielles les plus proches (si appellation_match est "unsure")${learningContext}${appellationContext}

IMPORTANT : Retourne TOUJOURS le JSON, même si tu n'es pas sûr. Mets des scores de confiance bas si nécessaire. Ne retourne une erreur que si le document ne contient ABSOLUMENT AUCUNE référence à du vin.

Réponds UNIQUEMENT avec un JSON valide, sans texte ni markdown :
{"cuvees": [{"domaine": "X", "cuvee": "", "appellation": "", "millesime": "", "prix": 0, "confiance": {"domaine": 0.9, "cuvee": 1, "appellation": 0.8, "millesime": 0.7, "prix": 0.95}, "alternatives": {}, "appellation_match": "ok", "appellation_suggestions": []}], "nb_total": 1, "avertissement": null}

Max 100 cuvées. Uniquement si AUCUN vin n'est trouvé : {"erreur": "Aucun vin détecté dans ce document."}`;

  // Construit les content blocks : une image par page + le prompt texte
  const content = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.base64 }
  }));
  content.push({ type: 'text', text: prompt });

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
    if (response.status === 401) {
      const detail = await response.text();
      let reason = '';
      try { reason = ' (' + JSON.parse(detail).reason + ')'; } catch(e) {}
      throw new Error('Session expirée' + reason + '. Déconnectez-vous et reconnectez-vous.');
    }
    const err = await response.text();
    throw new Error('Erreur API: ' + err);
  }

  const data = await response.json();
  if (!data.content || !data.content[0]) {
    throw new Error('Réponse API vide ou invalide');
  }
  const text = data.content[0].text.trim();
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  const parsed = JSON.parse(clean);
  if (!parsed.cuvees || parsed.cuvees.length === 0) {
    console.error('API response:', text);
  }
  return parsed;
}
