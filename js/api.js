// ═══════════════════════════════════════════
// DCANT — Appel Claude API via proxy /api/ai
// ═══════════════════════════════════════════

async function callClaudeAPI(images, corrections) {
  // images = tableau de { base64, media_type }
  let learningContext = '';
  if (corrections && corrections.length > 0) {
    learningContext = `\n\nCorrections passées (apprends de ces erreurs) :\n` +
      corrections.map(c => `- "${c.original}" corrigé en "${c.corrected}" (champ: ${c.field})`).join('\n');
  }

  const prompt = `Tu es un expert en analyse de tarifs de vins. Analyse ce document (${images.length} page${images.length > 1 ? 's' : ''}) et extrais TOUTES les cuvées présentes.

Pour chaque cuvée, retourne un objet JSON avec :
- domaine : nom du domaine/producteur
- cuvee : nom de la cuvée (peut être vide)
- appellation : appellation d'origine (AOC/AOP/IGP, ex: "Savigny-lès-Beaune 1er Cru", "Côtes du Rhône") — peut être vide
- millesime : année (peut être vide)
- prix : prix d'achat HT en nombre décimal
- confiance : objet avec un score de 0 à 1 pour chaque champ (1 = très sûr, 0.5 = incertain)
- alternatives : objet avec des valeurs alternatives pour les champs incertains (confiance < 0.8)${learningContext}

Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans balises markdown :
{
  "cuvees": [
    {
      "domaine": "Nom domaine",
      "cuvee": "Nom cuvée",
      "appellation": "Appellation",
      "millesime": "2020",
      "prix": 12.50,
      "confiance": { "domaine": 0.95, "cuvee": 0.9, "appellation": 0.85, "millesime": 0.8, "prix": 0.99 },
      "alternatives": { "millesime": ["2019", "2021"] }
    }
  ],
  "nb_total": 1,
  "avertissement": null
}

Limite à 100 cuvées maximum. Si ce n'est pas un tarif de vins, retourne { "erreur": "Ce document ne semble pas être un tarif de vins." }`;

  // Construit les content blocks : une image par page + le prompt texte
  const content = images.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.base64 }
  }));
  content.push({ type: 'text', text: prompt });

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content }]
    })
  });

  if (!response.ok) {
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
