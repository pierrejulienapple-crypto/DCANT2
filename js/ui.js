// ═══════════════════════════════════════════
// DCANT — Interface utilisateur
// Tout ce qui touche au DOM
// ═══════════════════════════════════════════

const UI = (() => {

  // ── NAVIGATION ──

  function showPage(name) {
    App.currentPage = name;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    g('page-' + name)?.classList.add('active');
    document.querySelectorAll('nav button').forEach((b, i) => {
      b.classList.toggle('active',
        (i === 0 && name === 'calcul') ||
        (i === 1 && name === 'historique')
      );
    });
    if (name === 'historique') {
      renderHistorique();
      if (!Storage.Local.feedbackDone(4) && App.user) {
        setTimeout(() => Feedback.open(4), 5000);
      }
    }
  }

  function showAdmin() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    g('page-admin')?.classList.add('active');
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    renderAdmin();
  }

  // ── AUTH STATE ──

  async function updateAuthState(user) {
    const loggedIn = !!user;
    g('authBanner').style.display = loggedIn ? 'none' : 'flex';
    g('authBtn').textContent = loggedIn ? 'Déconnexion' : 'Connexion';
    const userInfo = g('userInfo');
    if (userInfo) { userInfo.textContent = loggedIn ? user.email : ''; userInfo.title = loggedIn ? user.email : ''; }
    const cta = g('stickyCta');
    if (cta) cta.classList.toggle('hidden', loggedIn);
    g('saveBtn').style.display = loggedIn ? 'inline-block' : 'none';
    if (loggedIn) {
      App.modeles = await Storage.getModeles(user.email);
      updateModelDrop();
    }
  }

  // ── AUTH MODAL — DEUX ONGLETS ──

  function openAuth(tab) {
    switchAuthTab(tab || 'login');
    g('authOverlay').classList.add('open');
    setTimeout(() => {
      const f = tab === 'register' ? g('authEmailRegister') : g('authEmailLogin');
      if (f) f.focus();
    }, 100);
  }

  function switchAuthTab(tab) {
    const isLogin = tab === 'login';
    g('tabLogin').classList.toggle('active', isLogin);
    g('tabRegister').classList.toggle('active', !isLogin);
    g('authPanelLogin').style.display = isLogin ? 'block' : 'none';
    g('authPanelRegister').style.display = isLogin ? 'none' : 'block';
    g('authErrLogin').textContent = '';
    g('authErrRegister').textContent = '';
  }

  function closeAuthBg(e) {
    if (e.target === g('authOverlay')) g('authOverlay').classList.remove('open');
  }

  async function submitLogin() {
    const email = g('authEmailLogin').value.trim();
    const pw = g('authPwLogin').value;
    if (!email || !pw) { g('authErrLogin').textContent = 'Remplissez tous les champs.'; return; }
    const btn = g('loginBtn');
    btn.textContent = '...'; btn.disabled = true;
    const result = await Auth.login(email, pw);
    btn.disabled = false; btn.textContent = 'Se connecter';
    if (!result.ok) { g('authErrLogin').textContent = result.message; return; }
    g('authOverlay').classList.remove('open');
    track('connexion');
    toast('Connexion réussie !');
  }

  async function submitRegister() {
    const email = g('authEmailRegister').value.trim();
    const pw = g('authPwRegister').value;
    if (!email || !pw) { g('authErrRegister').textContent = 'Remplissez tous les champs.'; return; }
    if (pw.length < 6) { g('authErrRegister').textContent = 'Mot de passe trop court (6 caractères minimum).'; return; }
    const btn = g('registerBtn');
    btn.textContent = '...'; btn.disabled = true;
    const result = await Auth.register(email, pw);
    btn.disabled = false; btn.textContent = 'Créer mon compte';
    if (!result.ok) { g('authErrRegister').textContent = result.message; return; }
    g('authOverlay').classList.remove('open');
    track('compte_cree');
    toast('Compte créé ! Bienvenue dans Dcant.');
  }

  async function loginWithGoogle() {
    await Auth.loginWithGoogle();
  }

  // Gardé pour compatibilité
  function toggleAuthMode() {}
  function checkEmail() {}
  function backToEmail() {}
  async function submitAuth() {}

  function handleAuthBtn() {
    if (App.user) {
      askConfirm('Se déconnecter ?', async () => {
        await Auth.logout();
        App.historique = [];
        App.modeles = [];
        toast('Déconnecté');
      });
    } else {
      openAuth('login');
    }
  }

  function _showAuthErr(msg) {}

  // ── MODÈLES DROPDOWN ──

  function updateModelDrop() {
    const wrap = g('modelDropWrap');
    if (!wrap) return;
    wrap.style.display = App.modeles.length ? 'block' : 'none';
    _renderModelList();
  }

  function _renderModelList() {
    const list = g('modelDropList');
    if (!list) return;
    if (!App.modeles.length) {
      list.innerHTML = '<div class="model-dd-empty">Aucun modèle enregistré</div>';
      return;
    }
    list.innerHTML = App.modeles.map((m, i) => {
      const sub = m.mode === 'euros' ? m.mode_value + ' € de marge'
        : m.mode === 'pct' ? m.mode_value + '% de marge'
        : 'Coefficient ×' + m.mode_value;
      return `<div class="model-dd-item">
        <div>
          <div class="model-dd-name" onclick="UI.applyModel(${i})">${m.nom}</div>
          <div class="model-dd-sub">${sub}</div>
        </div>
        <button class="model-dd-del" onclick="UI.deleteModel('${m.id}','${m.nom.replace(/'/g,"\\'")}')">✕</button>
      </div>`;
    }).join('');
  }

  function toggleModelDrop(e) {
    e.stopPropagation();
    App.ui.modelDropOpen = !App.ui.modelDropOpen;
    g('modelDropList').classList.toggle('open', App.ui.modelDropOpen);
    g('modelDropArrow').textContent = App.ui.modelDropOpen ? '▴' : '▾';
  }

  function closeModelDrop() {
    App.ui.modelDropOpen = false;
    g('modelDropList')?.classList.remove('open');
    if (g('modelDropArrow')) g('modelDropArrow').textContent = '▾';
  }

  function applyModel(i) {
    const m = App.modeles[i];
    if (!m) return;
    Calcul_UI.setMode(m.mode);
    g('modeValue').value = m.mode_value;
    if (m.transport > 0 || m.douane > 0 || (m.others && m.others.length)) {
      if (!App.calc.chargesOpen) Calcul_UI.toggleCharges();
      g('transport').value = m.transport || '';
      g('douane').value = m.douane || '';
      g('otherCharges').innerHTML = '';
      App.calc.chargeCount = 0;
      (m.others || []).forEach(o => Calcul_UI.addChargeWithValues(o.label, o.val));
    }
    Calcul_UI.compute();
    closeModelDrop();
    toast(`Modèle "${m.nom}" appliqué`);
  }

  async function deleteModel(id, name) {
    askConfirm(`Supprimer le modèle "${name}" ?`, async () => {
      const result = await Storage.deleteModele(id);
      if (!result.ok) { toast('Erreur lors de la suppression.'); return; }
      App.modeles = App.modeles.filter(m => m.id !== id);
      updateModelDrop();
      toast('Modèle supprimé');
    });
  }

  function openCreateModel() {
    const mv = parseFloat(g('modeValue').value) || 0;
    if (!mv) { toast('Renseignez d\'abord une valeur de marge (étape 3).'); return; }
    const mode = App.calc.mode;
    const label = mode === 'euros' ? mv + ' € de marge'
      : mode === 'pct' ? mv + '% de marge'
      : 'Coefficient ×' + mv;
    s('modelSummaryText', label);
    g('modelNameInput').value = '';
    g('modelOverlay').classList.add('open');
    setTimeout(() => g('modelNameInput').focus(), 100);
  }

  function closeModelBg(e) {
    if (e.target === g('modelOverlay')) g('modelOverlay').classList.remove('open');
  }

  async function saveModel() {
    const name = g('modelNameInput').value.trim();
    if (!name) { toast('Donnez un nom.'); return; }
    const mv = parseFloat(g('modeValue').value) || 0;
    if (!mv || !App.user) return;
    const ch = Calcul_UI.getCharges();
    const result = await Storage.saveModele(App.user.id, {
      name, mode: App.calc.mode, modeValue: mv,
      transport: ch.transport, douane: ch.douane, others: ch.others
    });
    if (!result.ok) { toast('Erreur lors de la sauvegarde.'); return; }
    App.modeles.push(result.data);
    g('modelOverlay').classList.remove('open');
    updateModelDrop();
    toast(`Modèle "${name}" créé !`);
  }

  // ── HISTORIQUE ──

  async function renderHistorique() {
    const el = g('historyContent');
    const ci = g('histCount');
    const filters = g('histFilters');

    if (!App.user) {
      ci.textContent = '';
      filters.style.display = 'none';
      el.innerHTML = `<div class="empty">Connectez-vous pour accéder à l'historique.<br><br>
        <button class="btn solid sm" onclick="UI.openAuth('login')">Se connecter</button></div>`;
      return;
    }

    el.innerHTML = '<div class="empty">Chargement…</div>';
    App.historique = await Storage.getHistorique(App.user.id);

    const fD = (g('fD').value || '').toLowerCase();
    const fC = (g('fC').value || '').toLowerCase();
    const fM = (g('fM').value || '').toLowerCase();

    const filtered = App.historique.filter(e =>
      (!fD || (e.domaine || '').toLowerCase().includes(fD)) &&
      (!fC || (e.cuvee || '').toLowerCase().includes(fC)) &&
      (!fM || (e.millesime || '').toLowerCase().includes(fM))
    );

    filters.style.display = App.historique.length ? 'flex' : 'none';
    ci.textContent = filtered.length + ' calcul' + (filtered.length !== 1 ? 's' : '');

    if (!filtered.length) {
      el.innerHTML = `<div class="empty">${App.historique.length ? 'Aucun résultat.' : 'Aucun calcul sauvegardé.'}</div>`;
      return;
    }

    // Grouper par domaine
    const grouped = {};
    filtered.forEach(e => {
      const k = e.domaine || '(sans domaine)';
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(e);
    });
    Object.values(grouped).forEach(arr =>
      arr.sort((a, b) => (parseInt(b.millesime) || 0) - (parseInt(a.millesime) || 0))
    );

    el.innerHTML = '<div class="domain-cards">' +
      Object.entries(grouped).map(([domain, entries]) => {
        const latest = entries[0];
        return `<div class="domain-card">
          <div class="domain-card-hd" onclick="UI.toggleDom(this)">
            <div>
              <div class="domain-name">${domain}</div>
              <div class="domain-meta">${entries.length} cuvée${entries.length > 1 ? 's' : ''} · dernier PV ${fmt(latest.pvht)} € HT</div>
            </div>
            <label class="dom-sel-all" onclick="event.stopPropagation()">
              <input type="checkbox" onchange="UI.selDomAll(this.checked,${JSON.stringify(entries.map(e => e.id))})"> Tout
            </label>
            <span class="domain-chev open">▾</span>
          </div>
          <div class="domain-entries open">
            ${entries.map(e => `
              <div class="entry-row" id="erow-${e.id}" onclick="UI.toggleEntry('${e.id}',event)">
                <div class="entry-check" onclick="event.stopPropagation()">
                  <input type="checkbox" id="chk_${e.id}" ${App.selectedIds.has(e.id) ? 'checked' : ''}
                    onchange="UI.toggleSel('${e.id}',this.checked)">
                </div>
                <div class="entry-left">
                  <div class="entry-cuvee">${e.cuvee || '—'}${e.appellation ? ` <span class="entry-appellation">${e.appellation}</span>` : ''}</div>
                  <div class="entry-sub">${e.millesime || ''} <span class="badge">${e.mode}</span>
                    ${new Date(e.created_at).toLocaleDateString('fr-FR')}</div>
                </div>
                <div class="entry-right">
                  <div>
                    <div class="entry-price">${fmt(e.pvht)} € HT</div>
                    <div class="entry-marge">${fmt(e.marge_euros)} € · ${Number(e.marge_pct).toFixed(1)}%</div>
                  </div>
                  <span class="entry-chev" id="echev-${e.id}">›</span>
                </div>
              </div>
              <div class="entry-expand" id="eexp-${e.id}" style="display:none"></div>
            `).join('')}
          </div>
        </div>`;
      }).join('') + '</div>';
  }

  function toggleSel(id, checked) {
    checked ? App.selectedIds.add(id) : App.selectedIds.delete(id);
    _updateDeleteBtn();
  }

  function selDomAll(checked, ids) {
    ids.forEach(id => {
      checked ? App.selectedIds.add(id) : App.selectedIds.delete(id);
      const cb = g('chk_' + id);
      if (cb) cb.checked = checked;
    });
    _updateDeleteBtn();
  }

  function _updateDeleteBtn() {
    const btn = g('histActions');
    if (!btn) return;
    const n = App.selectedIds.size;
    btn.style.display = n > 0 ? 'flex' : 'none';
    const delBtn = g('histDeleteBtn');
    if (delBtn) delBtn.textContent = `Supprimer (${n})`;
  }

  async function deleteSelected() {
    const ids = [...App.selectedIds];
    if (!ids.length) return;
    const n = ids.length;
    const label = n === 1 ? 'cette cuvée' : `ces ${n} cuvées`;
    askConfirm(`Supprimer ${label} ?`, async () => {
      let ok = 0;
      for (const id of ids) {
        const result = await Storage.deleteCalcul(id);
        if (result.ok) { ok++; App.historique = App.historique.filter(h => h.id !== id); }
      }
      App.selectedIds.clear();
      renderHistorique();
      toast(ok + ' cuvée' + (ok > 1 ? 's' : '') + ' supprimée' + (ok > 1 ? 's' : ''));
    });
  }

  function toggleDom(hd) {
    const en = hd.nextElementSibling;
    const ic = hd.querySelector('.domain-chev');
    en.classList.toggle('open');
    ic.classList.toggle('open');
  }

  function resetFilters() {
    ['fD', 'fC', 'fM'].forEach(id => { if (g(id)) g(id).value = ''; });
    g('resetFiltersBtn').style.display = 'none';
    renderHistorique();
  }

  function toggleReset() {
    const has = (g('fD')?.value || '') + (g('fC')?.value || '') + (g('fM')?.value || '');
    if (g('resetFiltersBtn')) g('resetFiltersBtn').style.display = has ? 'inline-block' : 'none';
  }

  // ── DETAIL MODAL ──

  async function openDetail(id) {
    const e = App.historique.find(h => h.id === id);
    if (!e) return;
    App.detail.currentId = id;
    App.detail.editMode = false;
    g('editToggleBtn').textContent = 'Modifier';
    g('editSaveBtn').style.display = 'none';
    _renderView(e);
    g('detailOverlay').classList.add('open');
  }

  function _renderView(e) {
    s('detailTitle', (e.domaine || '—') + (e.cuvee ? ' — ' + e.cuvee : ''));
    s('detailSub', [e.millesime, new Date(e.created_at).toLocaleDateString('fr-FR')].filter(Boolean).join(' · '));

    let chargesHtml = '';
    if (e.charges && e.charges.total > 0) {
      chargesHtml = `<div class="modal-sec"><div class="modal-sec-label">Charges</div>
        ${e.charges.transport > 0 ? `<div class="modal-row"><span class="modal-row-k">Transport</span><span class="modal-row-v">${fmt(e.charges.transport)} €</span></div>` : ''}
        ${e.charges.douane > 0 ? `<div class="modal-row"><span class="modal-row-k">Douane</span><span class="modal-row-v">${fmt(e.charges.douane)} €</span></div>` : ''}
        ${(e.charges.others || []).map(o => `<div class="modal-row"><span class="modal-row-k">${o.label}</span><span class="modal-row-v">${fmt(o.val)} €</span></div>`).join('')}
        <div class="modal-row" style="font-weight:700"><span class="modal-row-k">Coût de revient</span><span class="modal-row-v">${fmt(e.cout_revient)} €</span></div>
      </div>`;
    }

    const modeLabel = e.mode === 'euros' ? 'Marge fixe' : e.mode === 'pct' ? 'Taux de marge' : 'Coefficient';
    const modeVal = fmt(e.mode_value) + (e.mode === 'pct' ? '%' : e.mode === 'coeff' ? '×' : ' €');
    const cmtHtml = e.commentaire ? `<div class="modal-sec"><div class="modal-sec-label">Commentaire</div>
      <div style="font-size:14px;color:var(--dim);line-height:1.7">${e.commentaire}</div></div>` : '';

    g('detailBody').innerHTML = `
      <div class="modal-sec"><div class="modal-sec-label">Achat</div>
        <div class="modal-row"><span class="modal-row-k">PA HT</span><span class="modal-row-v">${fmt(e.prix_achat)} €</span></div>
        <div class="modal-row"><span class="modal-row-k">Mode</span><span class="modal-row-v">${modeLabel} — ${modeVal}</span></div>
      </div>
      ${chargesHtml}
      <div class="modal-sec"><div class="modal-sec-label">Résultats</div>
        <div class="modal-row hero"><span class="modal-row-k">Prix de vente HT</span><span class="modal-row-v">${fmt(e.pvht)} €</span></div>
        <div class="modal-row ttc"><span class="modal-row-k">TTC</span><span class="modal-row-v">${fmt(e.pvttc)} €</span></div>
        <div class="modal-row"><span class="modal-row-k">Marge brute</span><span class="modal-row-v">${fmt(e.marge_euros)} €</span></div>
        <div class="modal-row"><span class="modal-row-k">Taux de marge</span><span class="modal-row-v">${Number(e.marge_pct).toFixed(1)} %</span></div>
        <div class="modal-row"><span class="modal-row-k">Coefficient</span><span class="modal-row-v">${Number(e.coeff).toFixed(2)}×</span></div>
      </div>
      ${cmtHtml}`;
  }

  function closeDetail() {
    g('detailOverlay').classList.remove('open');
    App.detail.currentId = null;
    App.detail.editMode = false;
  }

  function closeDetailBg(e) {
    if (e.target === g('detailOverlay')) closeDetail();
  }

  // ── EXPAND INLINE HISTORIQUE ──

  let _expandedId = null;

  function toggleEntry(id, event) {
    // Si clic sur checkbox, ignorer
    if (event && event.target.type === 'checkbox') return;

    const exp = g('eexp-' + id);
    const chev = g('echev-' + id);
    if (!exp) return;

    if (_expandedId && _expandedId !== id) {
      // Ferme l'ancien
      const oldExp = g('eexp-' + _expandedId);
      const oldChev = g('echev-' + _expandedId);
      if (oldExp) { oldExp.style.display = 'none'; oldExp.innerHTML = ''; }
      if (oldChev) oldChev.classList.remove('open');
    }

    const isOpen = exp.style.display !== 'none' && exp.innerHTML !== '';
    if (isOpen) {
      exp.style.display = 'none';
      exp.innerHTML = '';
      if (chev) chev.classList.remove('open');
      _expandedId = null;
    } else {
      const e = App.historique.find(h => h.id === id);
      if (!e) return;
      exp.innerHTML = _buildExpand(e);
      exp.style.display = 'block';
      if (chev) chev.classList.add('open');
      _expandedId = id;
    }
  }

  function _buildExpand(e) {
    const modeLabel = { euros: 'Marge fixe', pct: 'Taux de marge', coeff: 'Coefficient' }[e.mode] || e.mode;
    const modeVal = fmt(e.mode_value) + (e.mode === 'pct' ? ' %' : e.mode === 'coeff' ? '×' : ' €');

    const chargesRows = e.charges && e.charges.total > 0 ? `
      <div class="exp-row"><span>Prix d'achat HT</span><span>${fmt(e.prix_achat)} €</span></div>
      <div class="exp-row"><span>Transport</span><span>${fmt(e.charges.transport || 0)} €</span></div>
      ${e.charges.douane > 0 ? `<div class="exp-row"><span>Douane</span><span>${fmt(e.charges.douane)} €</span></div>` : ''}
      <div class="exp-row bold"><span>Prix de revient</span><span>${fmt(e.cout_revient)} €</span></div>
    ` : `
      <div class="exp-row"><span>Prix d'achat HT</span><span>${fmt(e.prix_achat)} €</span></div>
      <div class="exp-row bold"><span>Prix de revient</span><span>${fmt(e.cout_revient || e.prix_achat)} €</span></div>
    `;

    return `<div class="entry-expand-body">
      <div class="exp-section">
        ${chargesRows}
        <div class="exp-row"><span>${modeLabel}</span><span>${modeVal}</span></div>
      </div>
      <div class="exp-results">
        <div class="exp-res-main" id="epvht-${e.id}">${fmt(e.pvht)} € HT</div>
        <div class="exp-res-sub" id="epvttc-${e.id}">${fmt(e.pvttc)} € TTC</div>
        <div class="exp-res-detail">
          <span id="eme-${e.id}">${fmt(e.marge_euros)} € marge</span>
          <span>·</span>
          <span id="epct-${e.id}">${Number(e.marge_pct).toFixed(1)} %</span>
          <span>·</span>
          <span id="ecoeff-${e.id}">${Number(e.coeff).toFixed(2)}×</span>
        </div>
      </div>
      <div class="exp-foot">
        <button class="btn sm ghost" onclick="UI.askDeleteEntry('${e.id}')">Supprimer</button>
      </div>
    </div>`;
  }

  function toggleInstrEdit(id) {
    const view = g('einstrv-' + id);
    const edit = g('einstred-' + id);
    if (!view || !edit) return;
    const isEditing = edit.style.display !== 'none';
    view.style.display = isEditing ? 'block' : 'none';
    edit.style.display = isEditing ? 'none' : 'block';
    if (!isEditing) {
      const ta = g('einstrta-' + id);
      if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    }
  }

  function liveRecompute(id) {
    const ta = g('einstrta-' + id);
    const hint = g('eliveresult-' + id);
    if (!ta || !hint) return;
    const text = ta.value.trim();
    const e = App.historique.find(h => h.id === id);
    if (!e || !text) { hint.textContent = ''; return; }

    // Recalcul local simple basé sur le texte
    // Cherche un coefficient, un %, ou un montant €
    let mode, val;
    const mCoeff = text.match(/coeff(?:icient)?\s*([\d.,]+)/i);
    const mPct = text.match(/([\d.,]+)\s*%/);
    const mEur = text.match(/([\d.,]+)\s*[€e]/i);

    if (mCoeff) { mode = 'coeff'; val = parseFloat(mCoeff[1].replace(',','.')); }
    else if (mPct) { mode = 'pct'; val = parseFloat(mPct[1].replace(',','.')); }
    else if (mEur) { mode = 'euros'; val = parseFloat(mEur[1].replace(',','.')); }

    if (mode && val) {
      const cr = e.cout_revient || e.prix_achat;
      const r = Calcul.calculer(cr, val, mode);
      if (r) {
        hint.innerHTML = `→ <strong>${fmt(r.pvht)} € HT</strong> · ${fmt(r.pvttc)} € TTC · marge ${fmt(r.mE)} € · ${Number(r.pct).toFixed(1)}%`;
        hint.dataset.pvht = r.pvht;
        hint.dataset.pvttc = r.pvttc;
        hint.dataset.me = r.mE;
        hint.dataset.pct = r.pct;
        hint.dataset.coeff = r.coeff;
        hint.dataset.mode = mode;
        hint.dataset.val = val;
        // Ajoute bouton sauvegarder si pas encore là
        if (!g('esaveinstr-' + id)) {
          hint.innerHTML += ` <button class="btn sm solid" id="esaveinstr-${id}" style="margin-left:8px" onclick="UI.saveInstrEdit('${id}')">Sauvegarder</button>`;
        }
      }
    } else {
      hint.textContent = text.length > 3 ? 'Valeur non reconnue — essayez "coefficient 2.8" ou "30%"' : '';
    }
  }

  async function saveInstrEdit(id) {
    const ta = g('einstrta-' + id);
    const hint = g('eliveresult-' + id);
    const e = App.historique.find(h => h.id === id);
    if (!ta || !hint || !e) return;

    const newCommentaire = ta.value.trim();
    const pvht = parseFloat(hint.dataset.pvht);
    const pvttc = parseFloat(hint.dataset.pvttc);
    const me = parseFloat(hint.dataset.me);
    const pct = parseFloat(hint.dataset.pct);
    const coeff = parseFloat(hint.dataset.coeff);
    const mode = hint.dataset.mode;
    const val = parseFloat(hint.dataset.val);

    if (!pvht) { toast('Corrigez l\'instruction d\'abord.'); return; }

    const updates = {
      commentaire: newCommentaire,
      mode, modeValue: val,
      pvht, pvttc, mE: me, pct, coeff,
      prixAchat: e.prix_achat,
      charges: e.charges,
      cr: e.cout_revient
    };

    const result = await Storage.updateCalcul(id, updates);
    if (!result.ok) { toast('Erreur lors de la mise à jour.'); return; }

    const idx = App.historique.findIndex(h => h.id === id);
    if (idx !== -1) {
      App.historique[idx] = { ...App.historique[idx], commentaire: newCommentaire, pvht, pvttc, marge_euros: me, marge_pct: pct, coeff, mode, mode_value: val };
    }

    // Met à jour l'affichage inline
    const epvht = g('epvht-' + id);
    if (epvht) epvht.textContent = fmt(pvht) + ' € HT';
    const einstrv = g('einstrv-' + id);
    if (einstrv) einstrv.textContent = newCommentaire;

    // Met à jour la ligne du tableau
    const priceEl = document.querySelector(`#erow-${id} .entry-price`);
    if (priceEl) priceEl.textContent = fmt(pvht) + ' € HT';
    const margeEl = document.querySelector(`#erow-${id} .entry-marge`);
    if (margeEl) margeEl.textContent = fmt(me) + ' € · ' + Number(pct).toFixed(1) + '%';

    toggleInstrEdit(id);
    toast('Mis à jour !');
  }

  function askDeleteEntry(id) {
    const targetId = id || App.detail.currentId;
    askConfirm('Supprimer cette cuvée ?', async () => {
      const result = await Storage.deleteCalcul(targetId);
      if (!result.ok) { toast('Erreur lors de la suppression.'); return; }
      App.historique = App.historique.filter(h => h.id !== targetId);
      if (!id) closeDetail();
      renderHistorique();
      toast('Cuvée supprimée');
    });
  }

  function toggleEdit() {
    const e = App.historique.find(h => h.id === App.detail.currentId);
    if (!e) return;
    App.detail.editMode = !App.detail.editMode;
    if (App.detail.editMode) {
      g('editToggleBtn').textContent = 'Annuler';
      g('editSaveBtn').style.display = 'inline-block';
      Calcul_UI.renderEdit(e);
    } else {
      g('editToggleBtn').textContent = 'Modifier';
      g('editSaveBtn').style.display = 'none';
      _renderView(e);
    }
  }

  async function saveEdit() {
    const idx = App.historique.findIndex(h => h.id === App.detail.currentId);
    if (idx === -1) return;
    const pa = parseFloat(g('ed-pa')?.value);
    const mv = parseFloat(g('ed-mv')?.value);
    if (!pa || !mv) { toast('Valeurs manquantes.'); return; }
    const tr = parseFloat(g('ed-tr')?.value) || 0;
    const do_ = parseFloat(g('ed-do')?.value) || 0;
    const others = Calcul_UI.getEditCharges();
    const charges = Calcul.normaliserCharges({ transport: tr, douane: do_, others });
    const cr = Calcul.calculerCR(pa, charges);
    const r = Calcul.calculer(cr, mv, App.detail.editModeCalc);
    if (!r) { toast('Valeur invalide.'); return; }

    const updates = {
      domaine: g('ed-dom')?.value || '',
      cuvee: g('ed-cuv')?.value || '',
      millesime: g('ed-mil')?.value || '',
      commentaire: g('ed-com')?.value || '',
      prixAchat: pa, charges, cr,
      mode: App.detail.editModeCalc, modeValue: mv,
      ...r
    };

    const result = await Storage.updateCalcul(App.detail.currentId, updates);
    if (!result.ok) { toast('Erreur lors de la mise à jour.'); return; }

    App.historique[idx] = {
      ...App.historique[idx],
      domaine: updates.domaine, cuvee: updates.cuvee,
      millesime: updates.millesime, commentaire: updates.commentaire,
      prix_achat: pa, charges, cout_revient: cr,
      mode: updates.mode, mode_value: mv,
      pvht: r.pvht, marge_euros: r.mE, marge_pct: r.pct,
      coeff: r.coeff, pvttc: r.pvttc
    };

    App.detail.editMode = false;
    g('editToggleBtn').textContent = 'Modifier';
    g('editSaveBtn').style.display = 'none';
    _renderView(App.historique[idx]);
    renderHistorique();
    toast('Mis à jour !');
  }

  // ── EXPORT CSV ──

  async function exportCSV(type) {
    if (!App.user) { openAuth('login'); return; }
    let rows;
    if (type === 'sel') {
      if (!App.selectedIds.size) { toast('Cochez d\'abord des cuvées.'); return; }
      rows = App.historique.filter(e => App.selectedIds.has(e.id));
    } else {
      rows = [...App.historique];
    }
    if (!rows.length) { toast('Aucun calcul à exporter.'); return; }
    rows.sort((a, b) => {
      const dc = (a.domaine || '').localeCompare(b.domaine || '');
      return dc !== 0 ? dc : (parseInt(b.millesime) || 0) - (parseInt(a.millesime) || 0);
    });
    const csv = Calcul.genererCSV(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'dcant_export.csv'; a.target = '_blank';
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    toast(rows.length + ' cuvée(s) exportée(s)');
    track('export_csv', { nb: rows.length, type });
    setTimeout(() => Feedback.open(5), 700);
  }

  // ── ADMIN ──

  async function renderAdmin() {
    const el = g('adminContent');
    const feedback = await Storage.getFeedback();
    const qs = [
      { n: 1, q: "Outil utile au quotidien ?",    opts: ['oui', 'peut-être', 'non'] },
      { n: 2, q: "Vous êtes...",                   opts: ['caviste', 'bar_vins', 'restaurant', 'agent', 'autre'] },
      { n: 3, q: "Nb références ?",                opts: ['moins_50', '50_200', 'plus_200'] },
      { n: 4, q: "Historique utile ?",             opts: ['oui', 'parfois', 'non'] },
      { n: 5, q: "Export utile ?",                 opts: ['oui', 'once', 'non'] }
    ];
    if (!feedback.length) {
      el.innerHTML = '<div class="empty">Aucune réponse.</div>';
      return;
    }
    el.innerHTML = qs.map(q => {
      const ans = feedback.filter(f => f.question === q.n);
      const total = ans.length;
      const counts = {};
      q.opts.forEach(o => counts[o] = ans.filter(a => a.reponse === o).length);
      const cmts = ans.filter(a => a.commentaire).map(a => a.commentaire);
      return `<div class="admin-sec">
        <div class="admin-q">${q.q} (${total})</div>
        ${q.opts.map(o => `<div class="admin-bar">
          <span style="min-width:100px;font-size:13px;color:var(--dim)">${o}</span>
          <div class="admin-bar-bg"><div class="admin-bar-fill" style="width:${total ? counts[o] / total * 100 : 0}%"></div></div>
          <span class="admin-count">${counts[o]}</span>
        </div>`).join('')}
        ${cmts.length ? '<div style="margin-top:12px">' + cmts.map(c => `<div class="admin-comment">"${c}"</div>`).join('') + '</div>' : ''}
      </div>`;
    }).join('');
  }


  // ── EXPORT MODAL ──

  let _exportType = 'all';
  let _exportRows = null;
  let _exportTemplateConfig = null;

  function openExportModal(type) {
    if (!App.user) { openAuth('login'); return; }
    const rows = type === 'sel'
      ? App.historique.filter(e => App.selectedIds.has(e.id))
      : [...App.historique];
    if (!rows.length) { toast(type === 'sel' ? 'Cochez d\'abord des cuvées.' : 'Aucun calcul à exporter.'); return; }
    _exportType = type;
    _exportRows = rows;
    _exportTemplateConfig = null;
    // Reset vue
    const sv = g('exportSplitView');
    const tv = g('exportTemplateView');
    if (sv) { sv.style.display = 'flex'; sv.style.flexDirection = 'column'; }
    if (tv) tv.style.display = 'none';
    const status = g('exportTplStatus');
    const runBtn = g('exportTplRunBtn');
    if (status) status.style.display = 'none';
    if (runBtn) runBtn.style.display = 'none';
    const overlay = g('exportOverlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function closeExportModal() {
    const overlay = g('exportOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function exportDirectly() {
    closeExportModal();
    exportCSV(_exportType);
  }

  function exportWithTemplate() {
    const sv = g('exportSplitView');
    const tv = g('exportTemplateView');
    if (sv) sv.style.display = 'none';
    if (tv) { tv.style.display = 'flex'; tv.style.flexDirection = 'column'; tv.style.flex = '1'; }
  }

  function backToExportChoice() {
    const sv = g('exportSplitView');
    const tv = g('exportTemplateView');
    if (sv) { sv.style.display = 'flex'; sv.style.flexDirection = 'column'; }
    if (tv) tv.style.display = 'none';
  }

  async function handleTemplateFile(input) {
    const file = input.files[0];
    if (!file) return;
    const dropInner = g('exportTplDropInner');
    const status = g('exportTplStatus');
    const runBtn = g('exportTplRunBtn');
    if (dropInner) dropInner.innerHTML = `<div style="font-size:13px;color:var(--accent);font-weight:600">${file.name}</div><div style="font-size:11px;color:var(--dimmer);margin-top:4px">Analyse en cours…</div>`;
    if (status) status.style.display = 'none';

    try {
      const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
      let config;

      if (isPdf) {
        const base64 = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result.split(',')[1]);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const resp = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            messages: [{ role: 'user', content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              { type: 'text', text: 'Ce fichier est un modèle de tableau fourni par un logiciel de gestion. Identifie les colonnes ou champs présents. Retourne UNIQUEMENT ce JSON sans rien d\'autre : {"colonnes":["col1","col2",...],"separateur":";","description":"phrase courte"}' }
            ]}]
          })
        });
        if (!resp.ok) throw new Error('API ' + resp.status);
        const data = await resp.json();
        const raw = data.content[0].text.trim().replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim();
        config = JSON.parse(raw);
      } else {
        const content = await file.text();
        const sep = content.includes(';') ? ';' : ',';
        const cols = content.split('\n')[0].replace(/\r$/,'').split(sep).map(c => c.trim().replace(/^"|"$/g,''));
        config = { colonnes: cols, separateur: sep, description: file.name };
      }

      _exportTemplateConfig = config;
      if (status) {
        status.style.display = 'block';
        status.innerHTML = `
          <div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer);margin-bottom:8px">Colonnes détectées</div>
          <div style="font-size:12px;color:var(--dim);margin-bottom:10px;font-style:italic">${config.description || file.name}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${(config.colonnes || []).map(c => `<span style="font-size:11px;background:rgba(26,39,68,.08);color:var(--accent);padding:3px 8px;font-weight:600">${c}</span>`).join('')}
          </div>`;
      }
      if (runBtn) runBtn.style.display = 'block';
    } catch(e) {
      console.error('Template error:', e);
      if (dropInner) dropInner.innerHTML = '<div style="font-size:13px;color:#c00">Impossible d\'analyser ce fichier.</div>';
    }
  }

  async function runTemplateExport() {
    if (!_exportTemplateConfig || !_exportRows) return;
    const btn = g('exportTplRunBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      const resp = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content:
            `Génère un fichier CSV avec ces colonnes exactes : ${_exportTemplateConfig.colonnes.join(', ')}
Séparateur : "${_exportTemplateConfig.separateur || ','}"
Données (${_exportRows.length} lignes) :
${_exportRows.map(r => `${r.domaine}|${r.cuvee}|${r.millesime}|PA:${r.prix_achat}€|PVHT:${r.pvht}€|TTC:${r.pvttc}€|Marge:${r.marge_euros}€|Coeff:${r.coeff}`).join('\n')}
Retourne UNIQUEMENT le CSV, avec ligne d'en-tête, rien d'autre.`
          }]
        })
      });
      if (!resp.ok) throw new Error('API ' + resp.status);
      const data = await resp.json();
      const csv = data.content[0].text.trim().replace(/^```[a-z]*\s*/i,'').replace(/```\s*$/i,'').trim();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'dcant_export_adapte.csv';
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
      toast('Export adapté téléchargé ✓');
      closeExportModal();
    } catch(e) {
      console.error('Export error:', e);
      toast('Erreur lors de l\'export.');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Générer l\'export →'; }
  }

  return {
    showPage, showAdmin, updateAuthState,
    openAuth, switchAuthTab, closeAuthBg,
    submitLogin, submitRegister, loginWithGoogle,
    toggleAuthMode, checkEmail, backToEmail, submitAuth, handleAuthBtn,
    updateModelDrop, toggleModelDrop, closeModelDrop,
    applyModel, deleteModel, openCreateModel, closeModelBg, saveModel,
    renderHistorique, toggleSel, selDomAll, toggleDom, resetFilters, toggleReset,
    deleteSelected,
    toggleEntry, toggleInstrEdit, liveRecompute, saveInstrEdit,
    openDetail, closeDetail, closeDetailBg, askDeleteEntry, toggleEdit, saveEdit,
    exportCSV, openExportModal, closeExportModal, exportDirectly, exportWithTemplate,
    backToExportChoice, handleTemplateFile, runTemplateExport, renderAdmin
  };

})();
