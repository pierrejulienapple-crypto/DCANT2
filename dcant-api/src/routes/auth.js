// ═══════════════════════════════════════════
// DCANT API — Routes Auth
// POST /api/auth/register
// POST /api/auth/login
// POST /api/auth/refresh
// POST /api/auth/logout
// GET  /api/auth/google
// GET  /api/auth/google/callback
// GET  /api/auth/me
// ═══════════════════════════════════════════

import { Router } from 'express';
import bcrypt from 'bcrypt';
import passport from 'passport';
import db from '../db.js';
import { signAccessToken, createRefreshToken, verifyRefreshToken, revokeAllRefreshTokens } from '../lib/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { isValidEmail, isValidPassword } from '../middleware/validate.js';

const router = Router();
const SALT_ROUNDS = 12;
const REFRESH_COOKIE = 'dcant_refresh';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    maxAge: REFRESH_MAX_AGE,
    path: '/api/auth'
  });
}

// ── Inscription ──

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Email invalide.' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum).' });
  }

  try {
    // Vérifie si l'email existe déjà
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé.' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase().trim(), hash]
    );
    const user = rows[0];

    const accessToken = signAccessToken(user);
    const refresh = await createRefreshToken(user.id);
    setRefreshCookie(res, refresh.token);

    res.status(201).json({
      user: { id: user.id, email: user.email },
      accessToken
    });
  } catch (err) {
    console.error('[AUTH] register error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── Login ──

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email et mot de passe requis.' });
  }

  try {
    const { rows } = await db.query(
      'SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const user = rows[0];

    if (!user.password_hash) {
      return res.status(401).json({
        error: 'Ce compte utilise Google. Connectez-vous avec le bouton Google.'
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
    }

    const accessToken = signAccessToken(user);
    const refresh = await createRefreshToken(user.id);
    setRefreshCookie(res, refresh.token);

    res.json({
      user: { id: user.id, email: user.email },
      accessToken
    });
  } catch (err) {
    console.error('[AUTH] login error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── Refresh token ──

router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) {
    return res.status(401).json({ error: 'No refresh token', code: 'NO_REFRESH' });
  }

  try {
    const userId = await verifyRefreshToken(raw);
    if (!userId) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      return res.status(401).json({ error: 'Invalid refresh token', code: 'INVALID_REFRESH' });
    }

    const { rows } = await db.query(
      'SELECT id, email FROM users WHERE id = $1', [userId]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = rows[0];
    const accessToken = signAccessToken(user);
    const refresh = await createRefreshToken(user.id);
    setRefreshCookie(res, refresh.token);

    res.json({
      user: { id: user.id, email: user.email },
      accessToken
    });
  } catch (err) {
    console.error('[AUTH] refresh error:', err.message);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// ── Logout ──

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await revokeAllRefreshTokens(req.userId);
  } catch (_) {}
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ ok: true });
});

// ── Google OAuth ──

router.get('/google', passport.authenticate('google', {
  scope: ['email', 'profile'],
  session: false
}));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}?auth_error=google` }),
  async (req, res) => {
    try {
      const user = req.user;
      const accessToken = signAccessToken(user);
      const refresh = await createRefreshToken(user.id);
      setRefreshCookie(res, refresh.token);

      // Redirige vers le frontend avec le token dans un fragment (pas dans l'URL serveur)
      res.redirect(`${process.env.FRONTEND_URL}?access_token=${accessToken}`);
    } catch (err) {
      console.error('[AUTH] google callback error:', err.message);
      res.redirect(`${process.env.FRONTEND_URL}?auth_error=server`);
    }
  }
);

// ── Me (info user courant) ──

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, created_at FROM users WHERE id = $1', [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

export default router;
