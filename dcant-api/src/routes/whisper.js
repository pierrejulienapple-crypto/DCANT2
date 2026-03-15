// ═══════════════════════════════════════════
// DCANT API — Proxy Whisper (speech-to-text)
// POST /api/whisper
// ═══════════════════════════════════════════

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/', requireAuth, async (req, res) => {
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

    const fileHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mime || 'audio/webm'}\r\n\r\n`,
      'utf-8'
    );
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

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Whisper API error' });
    }

    res.json({ text: data.text || '' });
  } catch (err) {
    console.error('[WHISPER] error:', err.message);
    res.status(500).json({ error: err.message || 'Whisper proxy error' });
  }
});

export default router;
