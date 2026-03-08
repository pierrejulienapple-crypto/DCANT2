// ═══════════════════════════════════════════
// DCANT — Interface Calcul
// Gère les interactions de la page Calcul
// ═══════════════════════════════════════════

const Calcul_UI = (() => {

  // ── MODE DE CALCUL ──

  function setMode(m) {
    App.calc.mode = m;
    document.querySelectorAll('.mode-tab').forEach((b, i) => {
      b.classList.toggle('active', ['euros', 'pct', 'coeff'][i] === m);
    });
    const cfg = {
      euros: ['Marge (€)', 'ex. 5.00'],
      pct:   ['Taux de marge (%)', 'ex. 50'],
      coeff: ['Coefficient', 'ex. 2.5']
    };
    s('modeLabel', cfg[m][0]);
    s('modeHint', cfg[m][1]);
    g('modeValue').value = '';
    compute();
  }

  // ── CHARGES ──

  function toggleCharges() {
    App.calc.chargesOpen = !App.calc.chargesOpen;
    g('chargesBlock').classList.toggle('open', App.calc.chargesOpen);
    s('cti', App.calc.chargesOpen ? '−' : '+');
    s('chargesLabel', App.calc.chargesOpen ? 'Masquer les charges' : 'Charges supplémentaires');
    compute();
  }

  function addCharge() {
    App.calc.chargeCount++;
    const id = 'charge_' + App.calc.chargeCount;
    const div = document.createElement('div');
    div.id = id;
    div.style.marginBottom = '14px';
    div.innerHTML = `<div style="display:flex;gap:8px">
      <input type="text" placeholder="Libellé" style="flex:2" oninput="Calcul_UI.compute()">
      <div style="display:flex;align-items:stretch;flex:1">
        <input type="number" placeholder="0.00" min="0" step="0.01" oninput="Calcul_UI.compute()" style="flex:1;border-right:none">
        <span style="background:var(--bg);border:2px solid var(--border);padding:0 10px;display:flex;align-items:center;font-size:14px;color:var(--dim)">€</span>
      </div>
      <button class="del-x" onclick="Calcul_UI.removeCharge('${id}')">✕</button>
    </div>`;
    g('otherCharges').appendChild(div);
  }

  function addChargeWithValues(label, val) {
    App.calc.chargeCount++;
    const id = 'charge_' + App.calc.chargeCount;
    const div = document.createElement('div');
    div.id = id;
    div.style.marginBottom = '14px';
    div.innerHTML = `<div style="display:flex;gap:8px">
      <input type="text" value="${label}" placeholder="Libellé" style="flex:2" oninput="Calcul_UI.compute()">
      <div style="display:flex;align-items:stretch;flex:1">
        <input type="number" value="${val}" min="0" step="0.01" oninput="Calcul_UI.compute()" style="flex:1;border-right:none">
        <span style="background:var(--bg);border:2px solid var(--border);padding:0 10px;display:flex;align-items:center;font-size:14px;color:var(--dim)">€</span>
      </div>
      <button class="del-x" onclick="Calcul_UI.removeCharge('${id}')">✕</button>
    </div>`;
    g('otherCharges').appendChild(div);
  }

  function removeCharge(id) {
    g(id)?.remove();
    compute();
  }

  function getCharges() {
    const transport = parseFloat(g('transport')?.value) || 0;
    const douane = parseFloat(g('douane')?.value) || 0;
    const others = [];
    g('otherCharges').querySelectorAll('div[id^="charge_"]').forEach(row => {
      const inputs = row.querySelectorAll('input');
      if (inputs.length < 2) return;
      const label = inputs[0].value || 'Autre';
      const val = parseFloat(inputs[1].value) || 0;
      if (val > 0) others.push({ label, val });
    });
    const total = transport + douane + others.reduce((s, o) => s + o.val, 0);
    return { transport, douane, others, total };
  }

  // ── CALCUL PRINCIPAL ──

  function compute() {
    const pa = parseFloat(g('prixAchat')?.value) || 0;
    const mv = parseFloat(g('modeValue')?.value) || 0;
    const ch = getCharges();
    const cr = Calcul.calculerCR(pa, ch);

    // Affichage coût de revient
    if (pa > 0 && ch.total > 0) {
      g('costBox').style.display = 'block';
      let rows = `<div class="cost-row"><span>Prix achat HT</span><span>${fmt(pa)} €</span></div>`;
      if (ch.transport > 0) rows += `<div class="cost-row"><span>Transport</span><span>${fmt(ch.transport)} €</span></div>`;
      if (ch.douane > 0) rows += `<div class="cost-row"><span>Douane</span><span>${fmt(ch.douane)} €</span></div>`;
      ch.others.forEach(o => { rows += `<div class="cost-row"><span>${esc(o.label)}</span><span>${fmt(o.val)} €</span></div>`; });
      g('costRows').innerHTML = rows;
      s('coutRevient', fmt(cr) + ' €');
    } else {
      g('costBox').style.display = 'none';
    }

    // Résultats
    if (cr > 0 && mv > 0) {
      const r = Calcul.calculer(cr, mv, App.calc.mode);
      if (!r) { _clearRes(); return; }
      s('res-pvht', fmt(r.pvht) + ' €');
      s('res-ttc', fmt(r.pvttc) + ' €');
      s('res-euros', fmt(r.mE) + ' €');
      s('res-pct', r.pct.toFixed(1) + ' %');
      s('res-coeff', r.coeff.toFixed(2) + '×');
      // Benchmark marché (non-bloquant)
      var bmEl = g('res-benchmark');
      if (!bmEl) {
        bmEl = document.createElement('div');
        bmEl.id = 'res-benchmark';
        bmEl.className = 'benchmark-card';
        var rb = document.querySelector('.results-box');
        if (rb && rb.parentNode) rb.parentNode.insertBefore(bmEl, rb.nextSibling);
      }
      if (bmEl) {
        var _app = g('appellation')?.value?.trim();
        var _mil = g('millesime')?.value?.trim();
        if (_app && _mil) {
          bmEl.style.display = 'block';
          bmEl.innerHTML = '<div class="benchmark-card-title">Benchmark</div><span class="bm-loading"></span>';
          Benchmark.fetchMarketData(_app, _mil).then(function(data) {
            if (!g('res-benchmark')) return;
            if (data) {
              bmEl.innerHTML = '<div class="benchmark-card-title">Benchmark</div>' + Benchmark.renderMarketHTML(data);
            } else {
              bmEl.innerHTML = '<div class="benchmark-card-title">Benchmark</div><span class="bm-nodata">Pas encore de donn\u00e9es</span>';
            }
          });
        } else {
          bmEl.style.display = 'none';
        }
      }
    } else {
      _clearRes();
    }
  }

  function computeAndSheet() {
    compute();
    const pa = parseFloat(g('prixAchat')?.value) || 0;
    const mv = parseFloat(g('modeValue')?.value) || 0;
    if (pa > 0 && mv > 0 && !Storage.Local.feedbackDone(1)) {
      if (App.calc.sheetTimer) clearTimeout(App.calc.sheetTimer);
      App.calc.sheetTimer = setTimeout(() => {
        if (!Storage.Local.feedbackDone(1)) Feedback.showInline(1, 'fbInline');
      }, 3000);
    }
  }

  function _clearRes() {
    ['res-pvht', 'res-ttc', 'res-euros', 'res-pct', 'res-coeff'].forEach(id => s(id, '—'));
    var bmEl = g('res-benchmark');
    if (bmEl) bmEl.style.display = 'none';
  }

  // ── SAUVEGARDE ──

  async function saveCalc() {
    if (!App.user) { UI.openAuth('login'); return; }
    const pa = parseFloat(g('prixAchat')?.value);
    const mv = parseFloat(g('modeValue')?.value);
    if (!pa || !mv) { toast('Renseignez le prix et la marge.'); return; }
    const ch = Calcul.normaliserCharges(getCharges());
    const cr = Calcul.calculerCR(pa, ch);
    const r = Calcul.calculer(cr, mv, App.calc.mode);
    if (!r) { toast('Valeur invalide.'); return; }

    const entry = {
      domaine: g('domaine')?.value || '',
      cuvee: g('cuvee')?.value || '',
      appellation: g('appellation')?.value || '',
      millesime: g('millesime')?.value || '',
      commentaire: g('commentaire')?.value || '',
      prixAchat: pa, charges: ch, cr,
      mode: App.calc.mode, modeValue: mv,
      ...r
    };

    const result = await Storage.saveCalcul(App.user.id, entry);
    if (!result.ok) { toast('Erreur sauvegarde : ' + (result.error || 'inconnue')); return; }

    App.historique.unshift(result.data);
    track('calcul_sauvegarde', { mode: App.calc.mode });
    toast('Calcul sauvegardé !');
    resetForm();
  }

  function resetForm() {
    ['domaine', 'cuvee', 'appellation', 'millesime', 'commentaire', 'prixAchat', 'modeValue', 'transport', 'douane']
      .forEach(id => { if (g(id)) g(id).value = ''; });
    g('otherCharges').innerHTML = '';
    _clearRes();
    g('costBox').style.display = 'none';
    App.calc.sheetShown = false;
    if (App.calc.sheetTimer) clearTimeout(App.calc.sheetTimer);
  }

  // ── AUTOCOMPLETE ──

  function showAC() {
    if (!App.user || !App.historique.length) return;
    const val = g('domaine')?.value.trim().toLowerCase();
    if (!val) { g('acBox').style.display = 'none'; return; }
    const domains = [...new Set(
      App.historique.map(e => e.domaine).filter(d => d && d.toLowerCase().includes(val))
    )];
    if (!domains.length) { g('acBox').style.display = 'none'; return; }
    g('acBox').innerHTML = domains.slice(0, 6).map(d =>
      `<div class="ac-item" onmousedown="Calcul_UI.selectDomain('${esc(d).replace(/'/g, "\\'")}')">
        ${esc(d)}
      </div>`
    ).join('');
    g('acBox').style.display = 'block';
  }

  function hideAC() { setTimeout(() => { if (g('acBox')) g('acBox').style.display = 'none'; }, 180); }

  function selectDomain(name) {
    if (g('domaine')) g('domaine').value = name;
    g('acBox').style.display = 'none';
    compute();
  }

  // ── ÉDITION dans le modal détail ──

  function renderEdit(e) {
    App.detail.editModeCalc = e.mode;
    const othersHtml = ((e.charges && e.charges.others) || []).map((o, i) =>
      `<div class="charge-edit-row" id="eo_${i}">
        <input type="text" value="${esc(o.label)}" placeholder="Libellé" oninput="Calcul_UI.recompute()">
        <input type="number" value="${o.val}" min="0" step="0.01" oninput="Calcul_UI.recompute()">
        <span style="padding-bottom:11px;color:var(--dim)">€</span>
        <button class="del-x" onclick="Calcul_UI.removeEC('eo_${i}')">✕</button>
      </div>`
    ).join('');

    g('detailBody').innerHTML = `
      <div class="modal-sec"><div class="modal-sec-label">Bouteille</div>
        <div class="edit-grid">
          <div class="edit-field"><label>Domaine</label><input type="text" id="ed-dom" value="${esc(e.domaine || '')}"></div>
          <div class="edit-field"><label>Cuvée</label><input type="text" id="ed-cuv" value="${esc(e.cuvee || '')}"></div>
          <div class="edit-field"><label>Millésime</label><input type="text" id="ed-mil" value="${esc(e.millesime || '')}" maxlength="4"></div>
        </div>
        <div class="edit-field"><label>Commentaire</label><textarea id="ed-com">${esc(e.commentaire || '')}</textarea></div>
      </div>
      <div class="modal-sec"><div class="modal-sec-label">Calcul</div>
        <div class="edit-field"><label>PA HT (€)</label><input type="number" id="ed-pa" value="${e.prix_achat}" min="0" step="0.01" oninput="Calcul_UI.recompute()"></div>
        <div class="edit-field"><label>Transport (€)</label><input type="number" id="ed-tr" value="${e.charges?.transport || 0}" min="0" step="0.01" oninput="Calcul_UI.recompute()"></div>
        <div class="edit-field"><label>Douane (€)</label><input type="number" id="ed-do" value="${e.charges?.douane || 0}" min="0" step="0.01" oninput="Calcul_UI.recompute()"></div>
        <div id="editOC">${othersHtml}</div>
        <button class="add-charge-btn" style="margin-bottom:18px" onclick="Calcul_UI.addEC()">+ Charge</button>
        <div class="modal-sec-label" style="margin-bottom:10px">Mode</div>
        <div class="edit-tabs">
          <button class="edit-tab ${e.mode === 'euros' ? 'active' : ''}" onclick="Calcul_UI.setEM('euros')">€</button>
          <button class="edit-tab ${e.mode === 'pct' ? 'active' : ''}" onclick="Calcul_UI.setEM('pct')">%</button>
          <button class="edit-tab ${e.mode === 'coeff' ? 'active' : ''}" onclick="Calcul_UI.setEM('coeff')">Coeff</button>
        </div>
        <div class="edit-field"><label id="ed-ml">Valeur</label>
          <input type="number" id="ed-mv" value="${e.mode_value}" min="0" step="0.01" oninput="Calcul_UI.recompute()">
        </div>
      </div>
      <div class="edit-prev" id="ed-prev">—</div>`;
    recompute();
  }

  function setEM(m) {
    App.detail.editModeCalc = m;
    document.querySelectorAll('.edit-tab').forEach((b, i) =>
      b.classList.toggle('active', ['euros', 'pct', 'coeff'][i] === m));
    recompute();
  }

  function addEC() {
    App.detail.editOtherCount++;
    const id = 'eo_' + App.detail.editOtherCount;
    const div = document.createElement('div');
    div.className = 'charge-edit-row';
    div.id = id;
    div.innerHTML = `<input type="text" placeholder="Libellé" oninput="Calcul_UI.recompute()">
      <input type="number" placeholder="0.00" min="0" step="0.01" oninput="Calcul_UI.recompute()">
      <span style="padding-bottom:11px;color:var(--dim)">€</span>
      <button class="del-x" onclick="Calcul_UI.removeEC('${id}')">✕</button>`;
    g('editOC')?.appendChild(div);
  }

  function removeEC(id) { g(id)?.remove(); recompute(); }

  function getEditCharges() {
    const others = [];
    g('editOC')?.querySelectorAll('.charge-edit-row').forEach(row => {
      const ins = row.querySelectorAll('input');
      const label = ins[0]?.value || 'Autre';
      const val = parseFloat(ins[1]?.value) || 0;
      if (val > 0) others.push({ label, val });
    });
    return others;
  }

  function recompute() {
    const pa = parseFloat(g('ed-pa')?.value) || 0;
    const tr = parseFloat(g('ed-tr')?.value) || 0;
    const do_ = parseFloat(g('ed-do')?.value) || 0;
    const others = getEditCharges();
    const mv = parseFloat(g('ed-mv')?.value) || 0;
    const cr = Calcul.calculerCR(pa, { transport: tr, douane: do_, others });
    const prev = g('ed-prev');
    if (!prev) return;
    if (cr > 0 && mv > 0) {
      const r = Calcul.calculer(cr, mv, App.detail.editModeCalc);
      if (!r) { prev.innerHTML = 'Valeur invalide'; return; }
      prev.innerHTML = `→ <strong>PV HT ${fmt(r.pvht)} €</strong> · TTC ${fmt(r.pvttc)} € · Marge ${fmt(r.mE)} € (${r.pct.toFixed(1)}%) · Coeff ${r.coeff.toFixed(2)}×`;
    } else {
      prev.innerHTML = '—';
    }
  }

  return {
    setMode, toggleCharges, addCharge, addChargeWithValues, removeCharge, getCharges,
    compute, computeAndSheet, saveCalc, resetForm,
    showAC, hideAC, selectDomain,
    renderEdit, setEM, addEC, removeEC, getEditCharges, recompute
  };

})();
