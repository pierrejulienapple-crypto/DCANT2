// ═══════════════════════════════════════════
// DCANT API — Serveur Express
// ═══════════════════════════════════════════

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { initGoogleOAuth } from './src/lib/google-oauth.js';
import { cleanExpiredTokens } from './src/lib/jwt.js';
import db from './src/db.js';

// Routes
import authRoutes from './src/routes/auth.js';
import calculsRoutes from './src/routes/calculs.js';
import modelesRoutes from './src/routes/modeles.js';
import feedbackRoutes from './src/routes/feedback.js';
import exportRoutes from './src/routes/export.js';
import benchmarkRoutes from './src/routes/benchmark.js';
import aiRoutes from './src/routes/ai.js';
import whisperRoutes from './src/routes/whisper.js';
import correctionsRoutes from './src/routes/corrections.js';
import appellationsRoutes from './src/routes/appellations.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ── Sécurité ──

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5500',
  credentials: true
}));

// ── Body parsers ──

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── Rate limiting ──

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 10,
  message: { error: 'Trop de requêtes IA. Réessayez dans 1 minute.' }
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});

// ── Passport (Google OAuth) ──

app.use(passport.initialize());
initGoogleOAuth();

// ── Routes ──

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/calculs', generalLimiter, calculsRoutes);
app.use('/api/modeles', generalLimiter, modelesRoutes);
app.use('/api/feedback', generalLimiter, feedbackRoutes);
app.use('/api/exports', generalLimiter, exportRoutes);
app.use('/api/benchmark', generalLimiter, benchmarkRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/whisper', aiLimiter, whisperRoutes);
app.use('/api/corrections', generalLimiter, correctionsRoutes);
app.use('/api/appellations', generalLimiter, appellationsRoutes);

// ── Health check ──

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', version: '3.0.0' });
  } catch (err) {
    res.status(503).json({ status: 'db_error', error: err.message });
  }
});

// ── 404 ──

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler global ──

app.use((err, _req, res, _next) => {
  console.error('[SERVER] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Démarrage ──

app.listen(PORT, () => {
  console.log(`[DCANT API] Running on port ${PORT}`);

  // Nettoyage des refresh tokens expirés toutes les heures
  cleanExpiredTokens().catch(() => {});
  setInterval(() => cleanExpiredTokens().catch(() => {}), 60 * 60 * 1000);
});
