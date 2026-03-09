export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

async function verifySupabaseToken(token) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://cwpmlsmgckxooqtbwbpd.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cG1sc21nY2t4b29xdGJ3YnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDM4NjgsImV4cCI6MjA4ODI3OTg2OH0.h0Rcfc5ISk7MRYzcS9YL6Uy-8sdJxvYpTnpCZheGZFs';
  if (!supabaseKey) return true;

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseKey
    }
  });
  return resp.ok;
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

  // Auth check via Supabase API
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const tokenValid = await verifySupabaseToken(auth.slice(7));
  if (!tokenValid) {
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
