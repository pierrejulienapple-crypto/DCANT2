// ═══════════════════════════════════════════
// DCANT — État global
// Doit être chargé en premier
// ═══════════════════════════════════════════

const App = {
  user: null,
  historique: [],
  modeles: [],
  selectedIds: new Set(),
  currentPage: 'calcul',
  calc: {
    mode: 'euros',
    chargesOpen: false,
    chargeCount: 0,
    sheetShown: false,
    sheetTimer: null
  },
  detail: {
    currentId: null,
    editMode: false,
    editModeCalc: 'euros',
    editOtherCount: 100
  },
  ui: {
    modelDropOpen: false,
    confirmCallback: null
  }
};

function g(id) { return document.getElementById(id); }
function s(id, v) { const e = g(id); if (e) e.textContent = v; }
function fmt(n) { return n !== null && n !== undefined && !isNaN(n) ? Number(n).toLocaleString('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}) : '—'; }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, dur) {
  const e = g('toast');
  if (!e) return;
  e.textContent = msg;
  e.classList.add('show');
  setTimeout(() => e.classList.remove('show'), dur || 2800);
}

function askConfirm(msg, cb, btnLabel) {
  s('confirmMsg', msg);
  App.ui.confirmCallback = cb;
  g('confirmBtn').textContent = btnLabel || 'Supprimer';
  g('confirmOverlay').classList.add('open');
}
function confirmDo() {
  g('confirmOverlay').classList.remove('open');
  if (App.ui.confirmCallback) App.ui.confirmCallback();
  App.ui.confirmCallback = null;
}
function confirmCancel() {
  g('confirmOverlay').classList.remove('open');
  App.ui.confirmCallback = null;
}

async function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  try {
    let { data } = await window.supabase.auth.getSession();
    // Si pas de session ou token expiré, forcer un refresh
    if (!data?.session?.access_token ||
        (data.session.expires_at && data.session.expires_at < Math.floor(Date.now() / 1000) + 30)) {
      console.log('[AUTH] Session absente ou expirée, refresh...');
      const refresh = await window.supabase.auth.refreshSession();
      if (refresh.data?.session) data = refresh.data;
    }
    if (data?.session?.access_token) {
      h['Authorization'] = 'Bearer ' + data.session.access_token;
    } else {
      console.warn('[AUTH] Pas de token — requête envoyée sans Authorization');
    }
  } catch (e) {
    console.error('[AUTH] Erreur authHeaders:', e);
  }
  return h;
}

// ── BENCHMARK CONSENT (RGPD) ──
// Retourne une Promise<boolean> — true si l'utilisateur accepte le partage
// La modale n'apparaît qu'une seule fois par appareil (localStorage)
function _checkBenchmarkConsent() {
  return new Promise((resolve) => {
    const stored = localStorage.getItem('dcant_benchmark_consent');
    if (stored !== null) {
      resolve(stored === 'true');
      return;
    }
    const overlay = g('benchmarkOverlay');
    if (!overlay) { resolve(false); return; }
    overlay.style.display = 'flex';

    const btnAccept = g('benchmarkAccept');
    const btnRefuse = g('benchmarkRefuse');
    function cleanup() {
      overlay.style.display = 'none';
      btnAccept.removeEventListener('click', onAccept);
      btnRefuse.removeEventListener('click', onRefuse);
    }
    function onAccept() {
      localStorage.setItem('dcant_benchmark_consent', 'true');
      cleanup();
      resolve(true);
    }
    function onRefuse() {
      localStorage.setItem('dcant_benchmark_consent', 'false');
      cleanup();
      resolve(false);
    }
    btnAccept.addEventListener('click', onAccept);
    btnRefuse.addEventListener('click', onRefuse);
  });
}

function track(event, data) {
  try {
    if (window.clarity) window.clarity('event', event);
    if (window.umami) window.umami.track(event, data || {});
  } catch(e) {}
}
