// ═══════════════════════════════════════════
// DCANT API — Validation des entrées
// ═══════════════════════════════════════════

/** Validation email basique */
export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Validation mot de passe (6 chars min, comme Supabase) */
export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

/** Vérifie qu'un UUID est valide */
export function isValidUUID(str) {
  return typeof str === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

/** Nettoie un string pour la DB (trim, max length) */
export function sanitize(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen);
}

/** Nettoie un nombre */
export function toNumber(val) {
  const n = Number(val);
  return isFinite(n) ? n : null;
}
