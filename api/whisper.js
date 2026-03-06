export const config = {
  maxDuration: 30,
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    }
  }
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    // Convert base64 to Buffer
    const buffer = Buffer.from(audio, 'base64');

    // Determine file extension from mime type
    const ext = (mime || 'audio/webm').includes('mp4') ? 'mp4' : 'webm';

    // Build multipart form data manually
    const boundary = '----WhisperBoundary' + Date.now();
    const parts = [];

    // file part
    parts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="audio.${ext}"\r\n` +
      `Content-Type: ${mime || 'audio/webm'}\r\n\r\n`
    );
    const fileHeader = Buffer.from(parts[0], 'utf-8');
    const fileFooter = Buffer.from('\r\n', 'utf-8');

    // model part
    const modelPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`,
      'utf-8'
    );

    // language part
    const langPart = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfr\r\n`,
      'utf-8'
    );

    // closing boundary
    const closing = Buffer.from(`--${boundary}--\r\n`, 'utf-8');

    // Concatenate all parts
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
