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

  // Référentiel d'appellations officielles pour le matching IA (toutes — FR + Europe)
  let appellationContext = '';
  if (typeof Appellations !== 'undefined' && Appellations.isReady()) {
    const names = Appellations.getNames();
    if (names.length > 0) {
      // Format compact : séparés par " | " (~50KB pour 1916 entrées — OK pour l'API)
      const namesStr = names.join(' | ');
      appellationContext = `\n\nRÉFÉRENTIEL APPELLATIONS OFFICIELLES (${names.length} entrées, séparées par " | ") :\n` +
        namesStr +
        `\n\nINSTRUCTION APPELLATION : Compare l'appellation lue avec ce référentiel.
- Match exact/quasi-exact (accent, casse, abréviation) → nom officiel + "appellation_match": "ok"
- Hésitation ou pas dans le référentiel → "appellation_match": "unsure" + "appellation_suggestions": [3 plus proches]
- Clairement absente → "appellation_match": "unknown" + "appellation_suggestions": []`;
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
- appellation : appellation d'origine (AOC/AOP/IGP, ex: "Savigny-lès-Beaune 1er Cru", "Côtes du Rhône", "Terre Siciliane"). IMPORTANT : remplis TOUJOURS ce champ si l'appellation est mentionnée quelque part dans le document (en-tête, bas de page, côté…). Si une seule appellation est mentionnée pour tout le document, applique-la à CHAQUE vin. Ne laisse PAS vide si l'info existe dans le document.
- millesime : année (peut être vide)
- prix : prix HT en nombre décimal (si plusieurs prix, prends le prix unitaire HT le plus probable)
- confiance : score 0 à 1 pour chaque champ
- alternatives : valeurs alternatives pour les champs incertains (confiance < 0.8)
- appellation_match : "ok" si match exact avec le référentiel, "unsure" si doute (TOUJOURS fournir des suggestions dans ce cas), "unknown" si absente du référentiel
- appellation_suggestions : tableau des 3 appellations officielles les plus proches du référentiel. OBLIGATOIRE si appellation_match est "unsure". Utile aussi pour "unknown".${learningContext}${appellationContext}

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
