// ═══════════════════════════════════════════
// DCANT API — Proxy IA (Anthropic + Mistral)
// POST /api/ai
// Identique à l'ancien api/ai.js Vercel
// ═══════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

async function callAnthropic(body) {
  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_KEY not configured');

  let system = '';
  const messages = [];

  for (const msg of body.messages) {
    if (msg.role === 'system') {
      system = typeof msg.content === 'string' ? msg.content : '';
      continue;
    }
    if (Array.isArray(msg.content)) {
      const converted = msg.content.map(block => {
        if (block.type === 'image_url' && block.image_url?.url) {
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
    model: body.model,
    max_tokens: body.max_tokens || 4096,
    messages
  };
  if (system) payload.system = system;
  if (body.temperature !== undefined) payload.temperature = body.temperature;

  const hdrs = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: hdrs, body: JSON.stringify(payload)
    });
    if (response.status !== 529) break;
    await new Promise(r => setTimeout(r, (attempt + 1) * 5000));
  }

  const data = await response.json();

  if (data.content) {
    const text = data.content.map(c => c.text || '').join('');
    return { status: 200, body: { choices: [{ message: { role: 'assistant', content: text } }] } };
  }

  return { status: response.status, body: data };
}

async function callMistral(body) {
  const apiKey = process.env.MISTRAL_KEY;
  if (!apiKey) throw new Error('MISTRAL_KEY not configured');

  const payload = {
    model: body.model || 'devstral-medium-latest',
    max_tokens: body.max_tokens || 1000,
    temperature: body.temperature !== undefined ? body.temperature : 0.1,
    messages: body.messages
  };
  if (body.response_format) payload.response_format = body.response_format;

  let response;
  const delays = [5000, 15000, 30000, 60000, 60000];
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    if (response.status !== 429) break;
    console.log(`[AI] Mistral 429, retry ${attempt + 1}/5 in ${delays[attempt]/1000}s`);
    await new Promise(r => setTimeout(r, delays[attempt]));
  }

  const data = await response.text();
  return { status: response.status, body: data, raw: true };
}

router.post('/', requireAuth, async (req, res) => {
  try {
    if (!req.body.messages) {
      return res.status(400).json({ error: 'messages required' });
    }

    const model = req.body.model || 'devstral-medium-latest';
    // Log la taille du body et le modèle
    const bodySize = JSON.stringify(req.body).length;
    console.log(`[AI] model=${model}, body=${(bodySize/1024).toFixed(0)}KB`);
    const result = model.startsWith('claude')
      ? await callAnthropic(req.body)
      : await callMistral(req.body);
    console.log(`[AI] result status=${result.status}, size=${(result.raw ? result.body.length : JSON.stringify(result.body).length)/1024|0}KB`);

    if (result.raw) {
      return res.status(result.status).type('json').send(result.body);
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[AI] proxy error:', err.message);
    return res.status(500).json({ error: err.message || 'Proxy error' });
  }
});

export default router;
