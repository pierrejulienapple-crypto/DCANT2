export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

import crypto from 'crypto';

function verifyJWT(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return true; // pas de secret configuré = skip

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Vérifier la signature HMAC-SHA256
    const sig = crypto.createHmac('sha256', secret)
      .update(parts[0] + '.' + parts[1])
      .digest('base64url');
    if (sig !== parts[2]) return false;

    // Vérifier l'expiration
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch (e) {
    return false;
  }
}

// ── Routage Anthropic (modèles claude-*) ──

async function callAnthropic(body, res) {
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });
  }

  const model = body.model;

  // Extraire les messages system et convertir les images du format OpenAI → Anthropic
  let system = '';
  const messages = [];
  for (const msg of body.messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : '';
      continue;
    }
    // Convertir le content si multimodal (array)
    if (Array.isArray(msg.content)) {
      const converted = msg.content.map(block => {
        if (block.type === 'image_url' && block.image_url?.url) {
          // data:image/jpeg;base64,AAAA... → {type: "image", source: {type: "base64", ...}}
          const m = block.image_url.url.match(/^data:(.+?);base64,(.+)$/);
          if (m) {
            return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } };
          }
        }
        return block;
      });
      messages.push({ role: msg.role, content: converted });
    } else {
      messages.push(msg);
    }
  }

  const payload = {
    model: model,
    max_tokens: body.max_tokens || 4096,
    messages: messages
  };
  if (system) payload.system = system;
  if (body.temperature !== undefined) payload.temperature = body.temperature;

  const hdrs = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  // Retry on 529 (Anthropic overload)
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: hdrs, body: JSON.stringify(payload)
    });
    if (response.status !== 529) break;
    await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
  }

  const data = await response.json();

  // Convertir la réponse Anthropic → format OpenAI/Mistral (pour que le client ne change pas)
  if (data.content) {
    const text = data.content.map(c => c.text || '').join('');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({
      choices: [{ message: { role: 'assistant', content: text } }]
    });
  }

  // Erreur Anthropic → pass-through
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(response.status).json(data);
}

// ── Routage Mistral (tous les autres modèles) ──

async function callMistral(body, res) {
  const apiKey = process.env.MISTRAL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'MISTRAL_KEY not configured' });
  }

  const model = body.model || 'devstral-medium-latest';

  const payloadObj = {
    model: model,
    max_tokens: body.max_tokens || 1000,
    messages: body.messages
  };
  payloadObj.temperature = body.temperature !== undefined ? body.temperature : 0.1;
  const payload = JSON.stringify(payloadObj);

  const hdrs = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  // Retry on 429 (rate limit) up to 5 times
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST', headers: hdrs, body: payload
    });
    if (response.status !== 429) break;
    await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
  }

  const data = await response.text();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(response.status).send(data);
}

// ── Handler principal ──

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth check via JWT
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (!verifyJWT(auth.slice(7))) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    const body = req.body;
    if (!body.messages) {
      return res.status(400).json({ error: 'messages required' });
    }

    const model = body.model || 'devstral-medium-latest';

    // Route vers Anthropic si modèle claude-*, sinon Mistral
    if (model.startsWith('claude')) {
      return await callAnthropic(body, res);
    } else {
      return await callMistral(body, res);
    }

  } catch (e) {
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
