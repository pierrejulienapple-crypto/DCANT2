import crypto from 'crypto';

export const config = {
  maxDuration: 30,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

function b64urlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64');
}

function b64urlEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(b64urlDecode(parts[0]).toString());
    if (header.alg !== 'HS256') return null;
    const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(parts[0] + '.' + parts[1]).digest());
    if (sig !== parts[2]) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]).toString());
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
