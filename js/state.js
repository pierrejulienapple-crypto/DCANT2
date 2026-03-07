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

function acceptCookies() {
  Storage.Local.acceptCookies();
  g('cookieBar').classList.add('hidden');
}

function track(event, data) {
  try {
    if (window.clarity) window.clarity('event', event);
    if (window.umami) window.umami.track(event, data || {});
  } catch(e) {}
}
