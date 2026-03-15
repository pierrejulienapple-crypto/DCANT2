// ═══════════════════════════════════════════
// DCANT — Authentification
// API propre (remplace Supabase Auth)
// ═══════════════════════════════════════════

const Auth = (() => {

  let _accessToken = null;
  let _user = null;
  let _listeners = [];
  let _refreshTimer = null;

  function _apiUrl(path) {
    return DCANT_CONFIG.apiUrl + '/api/auth' + path;
  }

  function _notify() {
    _listeners.forEach(cb => { try { cb(_user); } catch(e) {} });
  }

  function _setSession(data) {
    _accessToken = data.accessToken;
    _user = data.user;
    // Refresh automatique 1 min avant expiration (token = 15min)
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(() => _refresh(), 13 * 60 * 1000);
    _notify();
  }

  function _clearSession() {
    _accessToken = null;
    _user = null;
    clearTimeout(_refreshTimer);
    _notify();
  }

  async function _refresh() {
    try {
      const resp = await fetch(_apiUrl('/refresh'), {
        method: 'POST',
        credentials: 'include'
      });
      if (!resp.ok) { _clearSession(); return; }
      const data = await resp.json();
      _setSession(data);
    } catch (e) {
      _clearSession();
    }
  }

  // ── Init : tente un refresh au chargement ──

  async function init() {
    await _refresh();
    return _user;
  }

  // ── Getters ──

  function getAccessToken() { return _accessToken; }

  async function getSession() {
    if (_accessToken && _user) return { user: _user, access_token: _accessToken };
    return null;
  }

  async function getUser() {
    return _user;
  }

  // ── Register ──

  async function register(email, password) {
    try {
      const resp = await fetch(_apiUrl('/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await resp.json();
      if (!resp.ok) return { ok: false, message: data.error || 'Une erreur est survenue.' };
      _setSession(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, message: 'Erreur réseau. Réessayez.' };
    }
  }

  // ── Login ──

  async function login(email, password) {
    try {
      const resp = await fetch(_apiUrl('/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await resp.json();
      if (!resp.ok) return { ok: false, message: data.error || 'Une erreur est survenue.' };
      _setSession(data);
      return { ok: true, user: data.user };
    } catch (e) {
      return { ok: false, message: 'Erreur réseau. Réessayez.' };
    }
  }

  // ── Google OAuth ──

  function loginWithGoogle() {
    window.location.href = _apiUrl('/google');
    return { ok: true };
  }

  // Appelé au chargement si ?access_token= est dans l'URL (retour Google)
  async function handleGoogleCallback() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('access_token');
    const error = params.get('auth_error');

    if (error) {
      window.history.replaceState({}, '', window.location.pathname);
      return { ok: false, message: 'Erreur Google: ' + error };
    }

    if (token) {
      _accessToken = token;
      // Récupère les infos user
      try {
        const resp = await fetch(_apiUrl('/me'), {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (resp.ok) {
          const data = await resp.json();
          _user = data.user;
          // Planifie le refresh
          clearTimeout(_refreshTimer);
          _refreshTimer = setTimeout(() => _refresh(), 13 * 60 * 1000);
          _notify();
        }
      } catch (e) {}
      // Nettoie l'URL
      window.history.replaceState({}, '', window.location.pathname + window.location.hash);
      return { ok: true, user: _user };
    }

    return null; // Pas de callback Google en cours
  }

  // ── Logout ──

  async function logout() {
    try {
      await fetch(_apiUrl('/logout'), {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + _accessToken },
        credentials: 'include'
      });
    } catch (e) {}
    _clearSession();
  }

  // ── Listener ──

  function onAuthChange(callback) {
    _listeners.push(callback);
  }

  return {
    init, getSession, getUser, getAccessToken,
    register, login, loginWithGoogle, handleGoogleCallback,
    logout, onAuthChange
  };

})();
