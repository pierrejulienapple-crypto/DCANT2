// ═══════════════════════════════════════════
// DCANT API — JWT helpers
// ═══════════════════════════════════════════

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import db from '../db.js';

const ACCESS_EXPIRES = '15m';
const REFRESH_EXPIRES_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

export function signAccessToken(user) {
  return jwt.sign(
    { userId: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export async function createRefreshToken(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_MS);

  await db.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, expiresAt]
  );

  return { token: raw, expiresAt };
}

export async function verifyRefreshToken(raw) {
  const hash = crypto.createHash('sha256').update(raw).digest('hex');

  const { rows } = await db.query(
    'DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now() RETURNING user_id',
    [hash]
  );

  if (!rows.length) return null;
  return rows[0].user_id;
}

/** Supprime tous les refresh tokens d'un user (logout all devices) */
export async function revokeAllRefreshTokens(userId) {
  await db.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

/** Nettoyage des tokens expirés (appelé par cron ou au démarrage) */
export async function cleanExpiredTokens() {
  await db.query('DELETE FROM refresh_tokens WHERE expires_at < now()');
}
