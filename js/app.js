// ═══════════════════════════════════════════
// DCANT — Initialisation
// Chargé en dernier — lance l'app
// ═══════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  _initSupabase();
  _initClarity();
  _initCookieBanner();

  // Bloque le scroll sur les champs numériques
  document.addEventListener('wheel', (e) => {
    if (document.activeElement.type === 'number') {
      document.activeElement.blur();
    }
  }, { passive: true });

  Auth.onAuthChange(async (user) => {
    App.user = user;
    await UI.updateAuthState(user);
    if (user && App.currentPage === 'historique') {
      await UI.renderHistorique();
    }
  });

  const user = await Auth.getUser();
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

function _initSupabase() {
  try {
    const { createClient } = window.supabase;
    window.supabase = createClient(
      DCANT_CONFIG.supabase.url,
      DCANT_CONFIG.supabase.key
    );
  } catch (e) {
    console.error('Supabase init failed:', e);
  }
}

function _initClarity() {
  const id = DCANT_CONFIG.clarity.id;
  if (!id || id.includes('COLLER')) return;
  try {
    (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window,document,'clarity','script',id);
  } catch(e) {}
}

function _initCookieBanner() {
  if (Storage.Local.cookiesAccepted()) {
    document.getElementById('cookieBar')?.classList.add('hidden');
  }
}

// ═══ PWA Service Worker ═══
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
