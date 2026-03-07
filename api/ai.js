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
  if (!supabaseKey) return true; // pas de clé configurée = skip auth

  const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': supabaseKey
    }
  });
  return resp.ok;
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

  // Auth check via Supabase API
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const tokenValid = await verifySupabaseToken(auth.slice(7));
  if (!tokenValid) {
    return res.status(401).json({ error: 'Invalid or expired token' });
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

    const payload = JSON.stringify({
      model: body.model,
      max_tokens: body.max_tokens || 1000,
      ...(body.system ? { system: body.system } : {}),
      messages: body.messages
    });
    const hdrs = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    };

    // Retry on 529 (overloaded) up to 3 times with backoff
    let response, data;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: hdrs, body: payload
      });
      if (response.status !== 529) break;
      const wait = (attempt + 1) * 2000; // 2s, 4s, 6s
      await new Promise(r => setTimeout(r, wait));
    }

    data = await response.text();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(response.status).send(data);
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Proxy error' });
  }
}
