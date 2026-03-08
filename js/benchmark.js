// ═══════════════════════════════════════════
// DCANT — Benchmark (page dédiée)
// Consentement + compteur participants
// Sync Supabase (par compte, pas par appareil)
// Cache session + affichage médianes marché
// ═══════════════════════════════════════════

const Benchmark = (() => {

  // ── Cache session pour les données marché ──
  var _cache = new Map();        // clé "appellation|millesime" → objet ou null
  var _isContributor = null;     // null = pas encore vérifié, true/false

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

  // ── Sync Supabase → localStorage au chargement ──
  // Synchronise le consentement depuis Supabase (cross-device).
  // Si l'utilisateur a rejoint OU s'est retiré sur un autre appareil,
  // on met à jour localStorage ici.
  async function _syncConsent() {
    if (!App.user) return;
    try {
      var { data, error } = await window.supabase
        .from('calculs')
        .select('partage_benchmark')
        .eq('user_id', App.user.id)
        .eq('partage_benchmark', true)
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        // L'utilisateur participe (rejoint sur un autre appareil)
        localStorage.setItem('dcant_benchmark_consent', 'yes');
      } else if (localStorage.getItem('dcant_benchmark_consent') === 'yes') {
        // localStorage dit "yes" mais Supabase dit non → retiré sur un autre appareil
        localStorage.setItem('dcant_benchmark_consent', 'no');
      }
    } catch(e) { /* silently fail */ }
  }

  // ── Met à jour partage_benchmark sur TOUS les calculs du user ──
  async function _updateSupabaseConsent(consent) {
    if (!App.user) return;
    try {
      await window.supabase
        .from('calculs')
        .update({ partage_benchmark: consent })
        .eq('user_id', App.user.id);
    } catch(e) { /* silently fail */ }
  }

  // ── Statut contributeur (synchrone, basé sur localStorage déjà synced) ──
  function _checkContributor() {
    if (_isContributor !== null) return _isContributor;
    if (!App.user) { _isContributor = false; return false; }
    _isContributor = localStorage.getItem('dcant_benchmark_consent') === 'yes';
    return _isContributor;
  }

  // ── Données marché pour une appellation+millésime ──
  async function fetchMarketData(appellation, millesime) {
    if (!appellation || !millesime) return null;
    var key = appellation + '|' + millesime;
    if (_cache.has(key)) return _cache.get(key);
    var raw = await Storage.getBenchmark(appellation, millesime);
    if (!raw) { _cache.set(key, null); return null; }
    var isContrib = _checkContributor();
    var result = {
      mediane_pvht: raw.mediane_pvht,
      mediane_prix_achat: isContrib ? raw.mediane_prix_achat : null,
      nb_contributeurs: raw.nb_contributeurs
    };
    _cache.set(key, result);
    return result;
  }

  // ── Batch fetch pour import (plusieurs cuvées d'un coup) ──
  async function fetchMarketDataBatch(pairs) {
    var missing = pairs.filter(function(p) {
      return p.appellation && p.millesime && !_cache.has(p.appellation + '|' + p.millesime);
    });
    if (missing.length) {
      var rawMap = await Storage.getBenchmarkBatch(missing);
      var isContrib = _checkContributor();
      rawMap.forEach(function(raw, key) {
        _cache.set(key, {
          mediane_pvht: raw.mediane_pvht,
          mediane_prix_achat: isContrib ? raw.mediane_prix_achat : null,
          nb_contributeurs: raw.nb_contributeurs
        });
      });
      missing.forEach(function(p) {
        var k = p.appellation + '|' + p.millesime;
        if (!_cache.has(k)) _cache.set(k, null);
      });
    }
    return _cache;
  }

  // ── Helper HTML pour afficher les médianes ──
  function renderMarketHTML(data, compact) {
    if (!data) return '<span class="bm-nodata">Pas encore de donn\u00e9es</span>';
    var html = '<span class="bm-val">' + fmt(data.mediane_pvht) + ' \u20ac HT</span>';
    if (!compact && data.mediane_prix_achat !== null) {
      html += ' <span class="bm-sep">\u00b7</span> <span class="bm-val">achat ' + fmt(data.mediane_prix_achat) + ' \u20ac</span>';
    }
    html += ' <span class="bm-count">(' + data.nb_contributeurs + ' pro' + (data.nb_contributeurs > 1 ? 's' : '') + ')</span>';
    return html;
  }

  // ── Consent UI — Rend le bloc consent dans un conteneur donné (top ou bottom) ──
  function _renderBlock(block, suffix) {
    var consent = localStorage.getItem('dcant_benchmark_consent');

    if (consent === 'yes') {
      block.innerHTML =
        '<div class="bm-active">' +
          '<div class="bm-badge">✓ Vous participez au réseau</div>' +
          '<p>Vos imports de factures contribuent au benchmark anonymisé.</p>' +
          '<button id="bm-leave-' + suffix + '" class="bm-leave-btn">Je me retire</button>' +
        '</div>';
      document.getElementById('bm-leave-' + suffix).addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'no');
        _isContributor = false;
        _updateSupabaseConsent(false);
        _render();
        _loadCount();
      });

    } else if (consent === 'no') {
      block.innerHTML =
        '<p>Vous ne participez pas au benchmark. Vous pouvez rejoindre le réseau à tout moment.</p>' +
        '<button id="bm-join-' + suffix + '" class="bm-join-btn">Je contribue</button>';
      document.getElementById('bm-join-' + suffix).addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'yes');
        _isContributor = true;
        _updateSupabaseConsent(true);
        _render();
        _loadCount();
      });

    } else {
      block.innerHTML =
        '<p>Partagez vos prix d\'achat anonymement et accédez aux médianes du marché. Entièrement facultatif, modifiable à tout moment.</p>' +
        '<div class="bm-actions">' +
          '<button id="bm-join-' + suffix + '" class="bm-join-btn">Je contribue</button>' +
          '<button id="bm-decline-' + suffix + '" class="bm-decline-btn">Pas pour l\'instant</button>' +
        '</div>';
      document.getElementById('bm-join-' + suffix).addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'yes');
        _isContributor = true;
        _updateSupabaseConsent(true);
        _render();
        _loadCount();
      });
      document.getElementById('bm-decline-' + suffix).addEventListener('click', function() {
        localStorage.setItem('dcant_benchmark_consent', 'no');
        _render();
      });
    }
  }

  function _render() {
    var top = document.getElementById('benchmark-consent-top');
    var bottom = document.getElementById('benchmark-consent-block');
    if (top) _renderBlock(top, 'top');
    if (bottom) _renderBlock(bottom, 'bottom');
  }

  async function init() {
    _isContributor = null;
    await _syncConsent();
    _loadCount();
    _render();
  }

  return {
    init: init,
    fetchMarketData: fetchMarketData,
    fetchMarketDataBatch: fetchMarketDataBatch,
    renderMarketHTML: renderMarketHTML
  };
})();
