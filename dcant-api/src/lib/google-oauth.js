// ═══════════════════════════════════════════
// DCANT API — Google OAuth (Passport)
// ═══════════════════════════════════════════

import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import db from '../db.js';

export function initGoogleOAuth() {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.API_URL}/api/auth/google/callback`
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) return done(new Error('Pas d\'email dans le profil Google'));

      const googleId = profile.id;

      // Cherche par google_id d'abord
      let { rows } = await db.query(
        'SELECT * FROM users WHERE google_id = $1', [googleId]
      );

      if (rows.length) return done(null, rows[0]);

      // Cherche par email (l'utilisateur existe peut-être via email/password)
      ({ rows } = await db.query(
        'SELECT * FROM users WHERE email = $1', [email]
      ));

      if (rows.length) {
        // Lie le google_id au compte existant
        await db.query(
          'UPDATE users SET google_id = $1 WHERE id = $2', [googleId, rows[0].id]
        );
        return done(null, { ...rows[0], google_id: googleId });
      }

      // Nouveau compte
      ({ rows } = await db.query(
        'INSERT INTO users (email, google_id) VALUES ($1, $2) RETURNING *',
        [email, googleId]
      ));

      return done(null, rows[0]);
    } catch (err) {
      return done(err);
    }
  }));
}
