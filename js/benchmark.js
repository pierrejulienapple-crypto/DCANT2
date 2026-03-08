// ═══════════════════════════════════════════
// DCANT — Benchmark (page dédiée)
// Consentement + compteur participants
// ═══════════════════════════════════════════

const Benchmark = (() => {

  async function _loadCount() {
    var el = document.getElementById('benchmark-participants-count');
    if (!el) return;
    try {
      var { data, error } = await window.supabase
        .from('calculs')
        .select('user_id')
        .eq('partage_benchmark', true);
      if (error) throw error;
      var unique = new Set((data || []).map(function(r) { return r.user_id; }));
      el.textContent = unique.size;
    } catch(e) {
      el.textContent = '0';
    }
  }

  function _render() {
    var block = document.getElementById('benchmark-consent-block');
    if (!block) return;
    var consent = localStorage.getItem('dcant_benchmark_consent');

    if (consent === 'yes') {
      // Participe : badge vert + bouton "se retirer" visible immédiatement, discret
      block.innerHTML =
        '<div class="bm-active">' +
          '<div class="bm-badge">✓ Vous participez au réseau</div>' +
          '<p>Vos imports de factures contribuent au benchmark anonymisé.</p>' +
          '<button id="bm-leave" class="bm-leave-btn">Je me retire</button>' +
        '</div>';
      document.getElementById('bm-leave').addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'no');
        _render();
        _loadCount();
      });

    } else if (consent === 'no') {
      block.innerHTML =
        '<p>Vous ne participez pas au benchmark. Vous pouvez rejoindre le réseau à tout moment.</p>' +
        '<button id="bm-join" class="bm-join-btn">Rejoindre le réseau</button>';
      document.getElementById('bm-join').addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'yes');
        _render();
        _loadCount();
      });

    } else {
      // Premier accès : pas encore de choix
      block.innerHTML =
        '<p>Partagez vos prix d\'achat anonymement et accédez aux médianes du marché. Entièrement facultatif, modifiable à tout moment.</p>' +
        '<div class="bm-actions">' +
          '<button id="bm-join" class="bm-join-btn">Rejoindre le réseau</button>' +
          '<button id="bm-decline" class="bm-decline-btn">Pas pour l\'instant</button>' +
        '</div>';
      document.getElementById('bm-join').addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'yes');
        _render();
        _loadCount();
      });
      document.getElementById('bm-decline').addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'no');
        _render();
      });
    }
  }

  function init() {
    _loadCount();
    _render();
  }

  return { init: init };
})();
