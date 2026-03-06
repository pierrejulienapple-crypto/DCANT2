// ═══════════════════════════════════════════
// DCANT — Authentification
// ═══════════════════════════════════════════

const Auth = (() => {

  async function getSession() {
    try {
      const { data, error } = await window.supabase.auth.getSession();
      if (error || !data.session) return null;
      return data.session;
    } catch (e) { return null; }
  }

  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  async function register(email, password) {
    const { data, error } = await window.supabase.auth.signUp({ email, password });
    if (error) return { ok: false, message: _friendlyError(error.message) };
    return { ok: true, user: data.user };
  }

  async function login(email, password) {
    const { data, error } = await window.supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: _friendlyError(error.message) };
    return { ok: true, user: data.user };
  }

  async function loginWithGoogle() {
    const { error } = await window.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'https://dcant.vercel.app' }
    });
    if (error) return { ok: false, message: _friendlyError(error.message) };
    return { ok: true };
  }

  async function logout() {
    await window.supabase.auth.signOut();
  }

  function onAuthChange(callback) {
    window.supabase.auth.onAuthStateChange((_event, session) => {
      callback(session ? session.user : null);
    });
  }

  function _friendlyError(msg) {
    if (!msg) return 'Une erreur est survenue.';
    if (msg.includes('Invalid login')) return 'Email ou mot de passe incorrect. Si vous vous êtes connecté avec Google, utilisez le bouton Google.';
    if (msg.includes('already registered')) return 'Cet email est déjà utilisé.';
    if (msg.includes('Password should')) return 'Mot de passe trop court (6 caractères minimum).';
    if (msg.includes('valid email')) return 'Email invalide.';
    if (msg.includes('Email not confirmed')) return 'Vérifiez votre boîte mail.';
    return 'Une erreur est survenue. Réessayez.';
  }

  return { getSession, getUser, register, login, loginWithGoogle, logout, onAuthChange };

})();
