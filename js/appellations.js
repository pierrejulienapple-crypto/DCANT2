// ═══════════════════════════════════════════
// DCANT — Module Appellations
// Cache mémoire + autocomplete
// ═══════════════════════════════════════════

const Appellations = (() => {

  let _list = [];        // [{nom, pays, region, type}]
  let _ready = false;
  let _readyPromise = null;
  let _dropdown = null;
  let _input = null;
  let _highlightIdx = -1;
  let _debounceTimer = null;

  // ── Normalisation accents ──
  function _norm(str) {
    return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  // ── Chargement au démarrage ──
  function init() {
    _readyPromise = _load();
    return _readyPromise;
  }

  async function _load() {
    try {
      const base = DCANT_CONFIG.supabase.url +
        '/rest/v1/appellations?select=nom,pays,region,type&order=nom';
      const hdrs = { 'apikey': DCANT_CONFIG.supabase.key };

      // Supabase limite à 1000 lignes par requête — paginer
      const r1 = await fetch(base + '&limit=1000&offset=0', { headers: hdrs });
      if (!r1.ok) throw new Error('HTTP ' + r1.status);
      const page1 = await r1.json();

      let page2 = [];
      if (page1.length === 1000) {
        const r2 = await fetch(base + '&limit=1000&offset=1000', { headers: hdrs });
        if (r2.ok) page2 = await r2.json();
      }

      _list = page1.concat(page2);
      _ready = true;
      console.log('[Appellations] ' + _list.length + ' appellations chargées');
    } catch (e) {
      console.error('[Appellations] Erreur chargement:', e);
      _list = [];
      _ready = true; // on continue sans, mode dégradé
    }
  }

  // ── Recherche en mémoire ──
  function search(query, limit) {
    limit = limit || 10;
    if (!query || query.length < 1) return [];
    const q = _norm(query);

    const startsWith = [];
    const contains = [];

    for (let i = 0; i < _list.length; i++) {
      const n = _norm(_list[i].nom);
      if (n.indexOf(q) === 0) {
        startsWith.push(_list[i]);
      } else if (n.indexOf(q) > 0) {
        contains.push(_list[i]);
      }
      if (startsWith.length >= limit) break;
    }

    return startsWith.concat(contains).slice(0, limit);
  }

  // ── Liste complète (pour l'import IA) ──
  function getList() {
    return _list;
  }

  function getNames() {
    return _list.map(a => a.nom);
  }

  function isReady() {
    return _ready;
  }

  function whenReady() {
    return _readyPromise || Promise.resolve();
  }

  // ── Autocomplete UI ──
  function attach(inputEl) {
    if (!inputEl) return;
    _input = inputEl;

    // Créer la dropdown
    _dropdown = document.createElement('div');
    _dropdown.className = 'ac-dropdown';
    _dropdown.style.display = 'none';

    // Wrapper le champ
    const parent = _input.parentNode;
    const wrapper = document.createElement('div');
    wrapper.className = 'ac-wrapper';
    parent.insertBefore(wrapper, _input);
    wrapper.appendChild(_input);
    wrapper.appendChild(_dropdown);

    // Events
    _input.addEventListener('input', _onInput);
    _input.addEventListener('keydown', _onKeydown);
    _input.addEventListener('blur', _onBlur);
    _input.addEventListener('focus', _onFocus);
  }

  function _onInput() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      const val = _input.value.trim();
      if (val.length < 1) {
        _hide();
        return;
      }
      const results = search(val);
      _render(results, val);
    }, 100);
  }

  function _onFocus() {
    const val = (_input.value || '').trim();
    if (val.length >= 1) {
      clearTimeout(_debounceTimer);
      _debounceTimer = setTimeout(() => {
        const results = search(val);
        if (results.length) _render(results, val);
      }, 100);
    }
  }

  function _onKeydown(e) {
    if (_dropdown.style.display === 'none') return;
    const items = _dropdown.querySelectorAll('.ac-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _highlightIdx = Math.min(_highlightIdx + 1, items.length - 1);
      _updateHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _highlightIdx = Math.max(_highlightIdx - 1, 0);
      _updateHighlight(items);
    } else if (e.key === 'Enter' && _highlightIdx >= 0) {
      e.preventDefault();
      _select(items[_highlightIdx].dataset.nom);
    } else if (e.key === 'Escape') {
      _hide();
    }
  }

  function _onBlur() {
    // Délai pour permettre le clic sur un item
    setTimeout(_hide, 180);
  }

  function _render(results, query) {
    if (!results.length) {
      _hide();
      return;
    }

    const q = _norm(query);
    let html = '';

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const nom = _esc(r.nom);
      const highlighted = _highlight(nom, query);
      const sub = [r.pays, r.region, r.type].filter(Boolean).join(' · ');

      html += '<div class="ac-item" data-nom="' + nom + '" data-idx="' + i + '">' +
        '<span class="ac-item-nom">' + highlighted + '</span>' +
        (sub ? '<span class="ac-item-sub">' + _esc(sub) + '</span>' : '') +
        '</div>';
    }

    _dropdown.innerHTML = html;
    _dropdown.style.display = 'block';
    _highlightIdx = -1;

    // Attach click events
    _dropdown.querySelectorAll('.ac-item').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        _select(el.dataset.nom);
      });
    });
  }

  function _highlight(text, query) {
    // Bold the matched portion
    const lower = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = _norm(query);
    const idx = lower.indexOf(q);
    if (idx < 0) return text;
    return text.substring(0, idx) +
      '<b>' + text.substring(idx, idx + query.length) + '</b>' +
      text.substring(idx + query.length);
  }

  function _select(nom) {
    _input.value = nom;
    _hide();
    // Trigger input event for Calcul_UI
    _input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function _updateHighlight(items) {
    items.forEach((el, i) => {
      el.classList.toggle('ac-item-active', i === _highlightIdx);
    });
    // Scroll into view
    if (_highlightIdx >= 0 && items[_highlightIdx]) {
      items[_highlightIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  function _hide() {
    if (_dropdown) {
      _dropdown.style.display = 'none';
      _highlightIdx = -1;
    }
  }

  function _esc(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  // ── API publique ──
  return {
    init,
    search,
    getList,
    getNames,
    isReady,
    whenReady,
    attach
  };

})();
