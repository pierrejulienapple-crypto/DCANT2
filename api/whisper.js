export const config = {
  maxDuration: 30,
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

  const apiKey = process.env.OPENAI_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_KEY not configured' });
  }

  try {
    const { audio, mime } = req.body;
    if (!audio) {
      return res.status(400).json({ error: 'audio (base64) required' });
    }

    const buffer = Buffer.from(audio, 'base64');
    const ext = (mime || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';

    const boundary = '----WhisperBoundary' + Date.now();
    const parts = [];

    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
      `Content-Type: ${mime || 'audio/webm'}\r\n\r\n`
    );
    const fileHeader = Buffer.from(parts[0], 'utf-8');
    const fileFooter = Buffer.from('\r\n', 'utf-8');

    const modelPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`,
      'utf-8'
    );

    const langPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n`,
      'utf-8'
    );

    const closing = Buffer.from(`--${boundary}--\r\n`, 'utf-8');

    const body = Buffer.concat([fileHeader, buffer, fileFooter, modelPart, langPart, closing]);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      },
      body
    });

    const data = await response.json();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Whisper API error' });
    }

    return res.status(200).json({ text: data.text || '' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Whisper proxy error' });
  }
}
