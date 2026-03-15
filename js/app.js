// ═══════════════════════════════════════════
// DCANT — Initialisation
// Chargé en dernier — lance l'app
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  _initCookieConsent();
  PWA.init();

  // Charger les appellations en mémoire + autocomplete
  Appellations.init().then(() => {
    Appellations.attach(document.getElementById('appellation'));
  });

  // Bloque le scroll sur les champs numériques
  document.addEventListener('wheel', (e) => {
    if (document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  }, { passive: true });

  // Gère le retour Google OAuth (?access_token=...)
  await Auth.handleGoogleCallback();

  // Listener auth (changements futurs)
  Auth.onAuthChange(async (user) => {
    App.user = user;
    await UI.updateAuthState(user);
    if (user && App.currentPage === 'historique') {
      await UI.renderHistorique();
    }
    if (user && typeof Import !== 'undefined') {
      if (Import.restoreFromSession) Import.restoreFromSession();
      if (Import.updateAuthGate) Import.updateAuthGate();
    }
  });

  // Init auth (tente un refresh token au chargement)
  const user = await Auth.init();
  App.user = user;
  await UI.updateAuthState(user);

  if (location.hash === '#admin') UI.showAdmin();

  document.addEventListener('click', (e) => {
    if (App.ui.modelDropOpen && !e.target.closest('.model-dropdown-wrap')) {
      UI.closeModelDrop();
    }
  });
});

window.onhashchange = () => {
  if (location.hash === '#admin') UI.showAdmin();
};

// ── Cookies & Clarity conditionnel (RGPD) ──
function _initCookieConsent() {
  var consent = localStorage.getItem('dcant_cookies');
  if (!consent) {
    var banner = document.getElementById('cookie-banner');
    if (banner) banner.style.display = 'flex';
  }
  if (consent === 'accepted') {
    _loadClarity();
    _grantClarityConsent();
  }

  var btnA = document.getElementById('cookie-accept');
  var btnR = document.getElementById('cookie-refuse');
  if (btnA) btnA.addEventListener('click', function() {
    localStorage.setItem('dcant_cookies', 'accepted');
    document.getElementById('cookie-banner').style.display = 'none';
    _loadClarity();
    _grantClarityConsent();
  });
  if (btnR) btnR.addEventListener('click', function() {
    localStorage.setItem('dcant_cookies', 'refused');
    document.getElementById('cookie-banner').style.display = 'none';
  });
}

function _grantClarityConsent() {
  if (window.clarity) {
    window.clarity('consentv2', {
      ad_Storage: 'granted',
      analytics_Storage: 'granted'
    });
  }
}

function _loadClarity() {
  if (window._clarityLoaded) return;
  window._clarityLoaded = true;
  try {
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window,document,'clarity','script','vm9i4i92ay');
  } catch(e) {}
}

// ── Benchmark + source wrapper (RGPD) ──
(function() {
  var _origSaveAll;
  function _wrapSaveAll() {
    if (typeof Import === 'undefined' || !Import.saveAll) return;
    if (_origSaveAll) return;
    _origSaveAll = Import.saveAll;
    Import.saveAll = async function() {
      var consent = localStorage.getItem('dcant_benchmark_consent') === 'yes';
      var origSaveCalcul = Storage.saveCalcul;
      Storage.saveCalcul = function(userId, entry) {
        entry.source = 'import';
        entry.partage_benchmark = consent;
        return origSaveCalcul(userId, entry);
      };
      try {
        await _origSaveAll.call(Import);
      } finally {
        Storage.saveCalcul = origSaveCalcul;
      }
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wrapSaveAll);
  } else {
    _wrapSaveAll();
  }
})();

// ═══ PWA ═══
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const PWA = (() => {
  let _deferredPrompt = null;

  function init() {
    if (localStorage.getItem('dc_pwa_dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone === true) return;

    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isAndroid = /android/i.test(navigator.userAgent);
    if (!isIOS && !isAndroid) return;

    const banner = document.getElementById('pwaBanner');
    const msg = document.getElementById('pwaBannerMsg');
    const btn = document.getElementById('pwaBannerAction');
    if (!banner) return;

    if (isIOS) {
      msg.textContent = 'Tapez Partager puis \u00ab Sur l\u0027\u00e9cran d\u0027accueil \u00bb.';
      btn.textContent = 'Compris';
    } else {
      msg.textContent = 'Ajoutez l\u0027app sur votre \u00e9cran d\u0027accueil.';
      btn.textContent = 'Installer';
    }

    setTimeout(() => banner.classList.remove('hidden'), 2000);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
  });

  function action() {
    if (_deferredPrompt) {
      _deferredPrompt.prompt();
      _deferredPrompt.userChoice.then(() => { _deferredPrompt = null; });
    }
    dismiss();
  }

  function dismiss() {
    localStorage.setItem('dc_pwa_dismissed', '1');
    const banner = document.getElementById('pwaBanner');
    if (banner) banner.classList.add('hidden');
  }

  return { init, action, dismiss };
})();
