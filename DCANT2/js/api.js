// ═══════════════════════════════════════════
// DCANT — Appel Claude API direct
// ═══════════════════════════════════════════

async function callClaudeAPI(imageBase64, mediaType, corrections) {
  const apiKey = DCANT_CONFIG.anthropic.key;
  if (!apiKey || apiKey.includes('COLLER')) {
    throw new Error('Clé Anthropic manquante dans config.js');
  }

  let learningContext = '';
  if (corrections && corrections.length > 0) {
    learningContext = `\n\nCorrections passées (apprends de ces erreurs) :\n` +
      corrections.map(c => `- "${c.original}" corrigé en "${c.corrected}" (champ: ${c.field})`).join('\n');
  }

  const prompt = `Tu es un expert en analyse de tarifs de vins. Analyse ce document et extrais TOUTES les cuvées présentes.

Pour chaque cuvée, retourne un objet JSON avec :
- domaine : nom du domaine/producteur
- cuvee : nom de la cuvée (peut être vide)
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
      "millesime": "2020",
      "prix": 12.50,
      "confiance": { "domaine": 0.95, "cuvee": 0.9, "millesime": 0.8, "prix": 0.99 },
      "alternatives": { "millesime": ["2019", "2021"] }
    }
  ],
  "nb_total": 1,
  "avertissement": null
}

Limite à 100 cuvées maximum. Si ce n'est pas un tarif de vins, retourne { "erreur": "Ce document ne semble pas être un tarif de vins." }`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Erreur API: ' + err);
  }

  const data = await response.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
  return JSON.parse(clean);
}
