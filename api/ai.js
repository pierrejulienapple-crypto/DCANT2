import crypto from 'crypto';

export const config = {
  maxDuration: 60,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (header.alg !== 'HS256') return null;
    const sig = crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest('base64url');
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}

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

  // Auth check
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;
  if (jwtSecret) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = verifyJWT(auth.slice(7), jwtSecret);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  const apiKey = process.env.ANTHROPIC_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_KEY not configured' });
  }

  try {
    const body = req.body;

    if (!body.model || !body.messages) {
      return res.status(400).json({ error: 'model and messages required' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: body.model,
        max_tokens: body.max_tokens || 1000,
        ...(body.system ? { system: body.system } : {}),
        messages: body.messages
      })
    });

    const data = await response.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(response.status).send(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
