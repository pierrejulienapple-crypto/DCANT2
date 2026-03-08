// ═══════════════════════════════════════════
// DCANT — Module Import IA
// Analyse un tarif et pré-remplit le formulaire
// ═══════════════════════════════════════════

const Import = (() => {

  let _cuvees = [];
  let _appliedMode = null;
  let _appliedValue = null;
  let _appliedCharges = null;
  // Enregistrement vocal délégué à ImportVoice (import-voice.js)
  let _currentFile = null;
  let _thumbnailUrl = null;
  let _appliedRegles = [];
  let _wizMethod = null;
  let _wizCur = 1;
  const _WIZ_ORDER = [1, 2, 'modele', 'tuto', 3, 4];
  let _wizExInterval = null;
  let _sessionEdits = [];

  // Listener permanent pour fermer le popover quand on clique en dehors
  // Les cellules ont event.stopPropagation() donc ce listener ne fire pas pour elles
  document.addEventListener('click', () => {
    const pop = document.getElementById('importPop');
    if (pop) pop.remove();
  });

  // ── OUVERTURE / FERMETURE ──

  function _lockScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.dataset.scrollY = window.scrollY;
    document.body.style.top = -window.scrollY + 'px';
  }
  function _unlockScroll() {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    const y = parseInt(document.body.dataset.scrollY || '0');
    window.scrollTo(0, y);
  }

  function open() {
    g('importOverlay').classList.add('open');
    _lockScroll();
    _reset();
    _updateAuthGate();
  }

  function close() {
    g('importOverlay').classList.remove('open');
    _unlockScroll();
    ImportVoice.stop();
    _reset();
  }

  function closeBg(e) {
    if (e.target === g('importOverlay')) close();
  }

  function _reset() {
    _closePop();
    _cuvees = [];
    _sessionEdits = [];
    _appliedMode = null;
    _appliedValue = null;
    _appliedCharges = null;
    _currentFile = null;
    _thumbnailUrl = null;
    _wizMethod = null;
    _wizCur = 1;
    _appliedRegles = [];
    // Retour à la carte 1
    document.querySelectorAll('.wiz-card').forEach(c => c.classList.remove('active', 'exit-left'));
    const c1 = g('importCard1');
    if (c1) c1.classList.add('active');
    // Reset progress
    const pf = g('importProgFill'); if (pf) pf.style.width = '25%';
    for (let i = 1; i <= 4; i++) {
      const d = g('iwd' + i);
      if (d) d.className = 'wiz-dot' + (i === 1 ? ' on' : '');
    }
    const st = g('importStepTxt'); if (st) st.textContent = 'Étape 1 sur 4';
    // Reset champs
    if (g('importFileInput')) g('importFileInput').value = '';
    if (g('importDropzone')) g('importDropzone').classList.remove('has-file');
    if (g('importFileName')) g('importFileName').textContent = '';
    if (g('importAnalyzeBtn')) { g('importAnalyzeBtn').disabled = true; g('importAnalyzeBtn').textContent = 'Analyser ce document →'; }
    if (g('importInstrInput')) g('importInstrInput').value = '';
    if (g('importInstrResult')) g('importInstrResult').style.display = 'none';
    if (g('importChoiceNext')) g('importChoiceNext').disabled = true;
    document.querySelectorAll('.wiz-choice').forEach(c => c.classList.remove('on'));
  }

  // ── UPLOAD ──

  function _updateAuthGate() {
    const dropzone = g('importDropzone');
    const analyzeBtn = g('importAnalyzeBtn');
    const authGate = g('importAuthGate');

    if (!App.user) {
      // Masquer la dropzone, afficher le message auth
      if (dropzone) dropzone.style.display = 'none';
      if (analyzeBtn) analyzeBtn.style.display = 'none';

      // Créer le gate si pas encore présent
      if (!authGate) {
        const gate = document.createElement('div');
        gate.id = 'importAuthGate';
        gate.style.cssText = 'padding:60px 20px;text-align:center;';
        gate.innerHTML = `
          <div style="font-size:15px;color:var(--dim);margin-bottom:20px;">Connectez-vous pour analyser votre document avec l'IA.</div>
          <button class="btn solid" onclick="document.getElementById('authOverlay').classList.add('open')" style="margin-bottom:10px;">Connectez-vous pour importer</button>`;
        dropzone?.parentNode?.insertBefore(gate, dropzone);
      } else {
        authGate.style.display = 'block';
      }
    } else {
      // Connecté : restaurer la dropzone
      if (dropzone) dropzone.style.display = '';
      if (analyzeBtn) analyzeBtn.style.display = '';
      if (authGate) authGate.style.display = 'none';
    }
  }

  function handleFile(file) {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.type.startsWith('image/')) {
      toast('Format non supporté. Utilisez JPG, PNG, WebP ou PDF.');
      return;
    }
    _currentFile = file;
    g('importFileName').textContent = file.name;
    g('importDropzone').classList.add('has-file');
    g('importAnalyzeBtn').disabled = false;
  }

  function onFileChange(e) {
    handleFile(e.target.files[0]);
  }

  function onDrop(e) {
    e.preventDefault();
    g('importDropzone').classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  }

  function onDragOver(e) {
    e.preventDefault();
    g('importDropzone').classList.add('drag-over');
  }

  function onDragLeave() {
    g('importDropzone').classList.remove('drag-over');
  }

  // ── ANALYSE IA ──

  async function analyze() {
    const file = g('importFileInput')?.files[0];
    if (!file) return;

    const spinner = g('importSpinner');
    if (spinner) spinner.style.display = 'flex';

    try {
      const images = await ImportUpload.prepareImages(file);

      const totalB64 = images.reduce((s, img) => s + img.base64.length, 0);
      console.log('[DCANT] analyze:', file.name, file.type, (file.size/1024).toFixed(0)+'KB', images.length+'img(s)', 'total base64:', (totalB64/1024).toFixed(0)+'KB');

      const corrections = await _getCorrections();
      const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isPhoto = isMobile || (file.type === 'image/jpeg' && file.size > 2 * 1024 * 1024);
      const data = await callClaudeAPI(images, corrections, { isPhoto: isPhoto && file.type !== 'application/pdf' });

      if (spinner) spinner.style.display = 'none';

      if (data.erreur) {
        const sizeInfo = `(${file.name}, ${file.type}, ${(file.size/1024).toFixed(0)}KB, ${images.length}pg)`;
        console.warn('[DCANT] API erreur:', data.erreur, sizeInfo);
        toast(data.erreur + ' ' + sizeInfo);
        return;
      }

      _cuvees = data.cuvees.map((c, i) => ({ ...c, id: i, pvht: null, saved: false }));

      // Miniature
      await _showThumbnail(file);

      // Warning
      const w = g('importWarning');
      if (w) {
        w.textContent = '⚠️ Vérifiez chaque valeur avant de calculer — des erreurs de lecture sont possibles.';
        if (data.avertissement) w.textContent += ' ' + data.avertissement;
        w.style.display = 'block';
      }

      const nb = g('importNbCuvees');
      if (nb) nb.textContent = _cuvees.length + ' cuvée' + (_cuvees.length > 1 ? 's' : '') + ' détectée' + (_cuvees.length > 1 ? 's' : '');

      Import.renderModeleDrop();
      _renderTable();

    } catch (e) {
      if (spinner) spinner.style.display = 'none';
      const msg = e.message || 'Réessayez.';
      console.error('[DCANT] analyze() error:', e);
      toast('Erreur : ' + msg);
      // Affiche l'erreur dans la zone du tableau pour debug
      const tbody = g('importTbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="color:#c00;padding:20px;text-align:center;font-size:13px;">Erreur : ${_esc(msg)}</td></tr>`;
    }
  }

  // ── TABLEAU ──

  function _renderTable() {
    const tbody = g('importTbody');
    tbody.innerHTML = _cuvees.map(c => _rowHTML(c)).join('');
    _updateSaveAllBtn();
  }

  // Utilise le global esc() de state.js
  const _esc = esc;

  function _rowHTML(c) {
    const fields = ['domaine', 'cuvee', 'appellation', 'millesime', 'prix'];
    const cells = fields.map(f => {
      const conf = c.confiance ? (c.confiance[f] || 1) : 1;
      const uncertain = conf < 0.8;
      const alts = c.alternatives && c.alternatives[f] ? c.alternatives[f] : [];
      const val = c[f] !== null && c[f] !== undefined ? c[f] : '';
      const altsJson = JSON.stringify(alts).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');

      // Appellation matching : statut bleu si unsure ou unknown avec suggestions
      const isUnsure = f === 'appellation' && (c.appellation_match === 'unsure' || c.appellation_match === 'unknown');
      const appSugg = (f === 'appellation' && c.appellation_suggestions && c.appellation_suggestions.length > 0)
        ? c.appellation_suggestions : [];
      const appSuggJson = JSON.stringify(appSugg).replace(/&/g,'&amp;').replace(/'/g,'&#39;').replace(/"/g,'&quot;');

      let cellClass = 'import-td-click';
      let dotHtml = '';
      if (isUnsure && appSugg.length > 0) {
        cellClass += ' cell-unsure';
        dotHtml = '<span class="cell-unsure-dot">?</span>';
      } else if (uncertain) {
        cellClass += ' cell-uncertain';
        dotHtml = '<span class="cell-uncertain-dot">\u25CF</span>';
      }

      return `<td class="${cellClass}"
        onclick="event.stopPropagation();Import.editCell(${c.id},'${f}')"
        data-id="${c.id}" data-field="${f}"
        data-alts='${altsJson}'
        data-app-sugg='${appSuggJson}'>
        <span class="td-val">${_esc(val)}</span>${dotHtml}
      </td>`;
    }).join('');

    return `<tr id="import-row-${c.id}">${cells}<td class="import-td-del" onclick="event.stopPropagation();Import.deleteRow(${c.id})" title="Supprimer cette ligne">\u2715</td></tr>`;
  }

  // ── ÉDITION INLINE ──

  const _FIELD_LABELS = { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', prix: 'Prix' };

  function _editContentHTML(id, field, currentVal, suggestions, alts) {
    let suggestHTML = '';
    if (suggestions.length > 0) {
      suggestHTML = `<div class="import-pop-suggestions">
        <div class="import-pop-suggest-label">Suggestion :</div>
        ${suggestions.map(s => `<button class="import-pop-suggest" data-val="${_esc(s)}" onclick="event.stopPropagation();Import.selectAlt(${id},'${field}',this.dataset.val,event)">${_esc(s)}</button>`).join('')}
      </div>`;
    }
    let altsHTML = '';
    if (alts.length > 0) {
      altsHTML = `<div class="import-pop-alts">
        <div class="import-pop-alts-label">L'IA hésite avec :</div>
        ${alts.map(a => `<button class="import-pop-alt" data-val="${_esc(a)}" onclick="event.stopPropagation();Import.selectAlt(${id},'${field}',this.dataset.val,event)">${_esc(a)}</button>`).join('')}
      </div>`;
    }
    return `${suggestHTML}${altsHTML}
      <div class="import-pop-field">
        <input type="${field === 'prix' ? 'number' : 'text'}"
          id="importPopInput" value="${_esc(currentVal)}"
          placeholder="Valeur correcte"
          autocomplete="off" autocorrect="off" autocapitalize="off"
          inputmode="${field === 'prix' ? 'decimal' : 'text'}"
          onclick="event.stopPropagation()"
          onkeydown="if(event.key==='Enter'){event.stopPropagation();Import.confirmEdit(${id},'${field}');}if(event.key==='Escape'){event.stopPropagation();Import.closePop();}">
      </div>
      <div class="import-pop-foot">
        <button class="btn solid sm" onclick="event.stopPropagation();Import.confirmEdit(${id},'${field}')">Valider</button>
        <button class="btn sm" onclick="event.stopPropagation();Import.closePop()">Annuler</button>
      </div>`;
  }

  function editCell(id, field) {
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;
    const td = document.querySelector(`td[data-id="${id}"][data-field="${field}"]`);
    if (!td) return;

    const alts = JSON.parse(td.dataset.alts || '[]');
    const currentVal = c[field] !== null ? String(c[field]) : '';
    let suggestions = _getSuggestions(field, currentVal);

    // Pour les appellations unsure/unknown : ajouter les suggestions IA en priorité
    if (field === 'appellation' && (c.appellation_match === 'unsure' || c.appellation_match === 'unknown')) {
      const appSugg = JSON.parse(td.dataset.appSugg || '[]');
      if (appSugg.length > 0) {
        suggestions = appSugg.concat(suggestions).filter((v, i, a) => a.indexOf(v) === i);
      }
    }

    _closePop();

    // Mobile : bottom sheet
    if (window.innerWidth <= 480) {
      const overlay = document.createElement('div');
      overlay.className = 'bs-overlay';
      overlay.id = 'importPop';
      const panel = document.createElement('div');
      panel.className = 'bs-panel';
      panel.addEventListener('click', e => e.stopPropagation());
      panel.innerHTML = `<div class="bs-handle"></div>
        <div class="bs-title">${_FIELD_LABELS[field] || field}</div>
        ${_editContentHTML(id, field, currentVal, suggestions, alts)}`;
      overlay.appendChild(panel);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) _closePop(); });
      document.body.appendChild(overlay);
      // Focus + scroll into view quand le clavier iOS apparaît
      setTimeout(() => {
        const inp = g('importPopInput');
        if (inp) {
          inp.focus();
          // Quand le clavier redimensionne le viewport, scroll l'input en vue
          const onResize = () => inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.visualViewport?.addEventListener('resize', onResize);
          inp.addEventListener('blur', () => {
            window.visualViewport?.removeEventListener('resize', onResize);
          }, { once: true });
        }
        if (field === 'appellation') _attachAppAc(id, field);
      }, 200);
      return;
    }

    // Desktop : popover classique
    const pop = document.createElement('div');
    pop.className = 'import-popover';
    pop.id = 'importPop';
    pop.addEventListener('click', e => e.stopPropagation());
    pop.innerHTML = _editContentHTML(id, field, currentVal, suggestions, alts);

    pop.style.position = 'fixed';
    pop.style.zIndex = '9999';
    document.body.appendChild(pop);

    // Positionner : en dessous par défaut, au-dessus si déborde
    const rect = td.getBoundingClientRect();
    const popH = pop.offsetHeight;
    if (rect.bottom + 4 + popH > window.innerHeight - 10) {
      // Pas assez de place en bas → au-dessus
      pop.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
      pop.style.top = (rect.bottom + 4) + 'px';
    }
    pop.style.left = Math.min(rect.left, window.innerWidth - pop.offsetWidth - 10) + 'px';

    const scrollParent = td.closest('.wiz-card-body');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', _closePop, { once: true });
    }

    setTimeout(() => {
      g('importPopInput')?.focus();
      if (field === 'appellation') _attachAppAc(id, field);
    }, 50);
  }

  function selectAlt(id, field, val, ev) {
    // Met la valeur et valide immédiatement (ferme le popup + enregistre l'édition)
    const input = g('importPopInput');
    if (input) input.value = val;
    confirmEdit(id, field);
  }

  async function confirmEdit(id, field) {
    const input = g('importPopInput');
    if (!input) return;
    // Si l'input est vide, essayer de récupérer la valeur de l'alt sélectionnée
    let rawVal = input.value.trim();
    if (!rawVal) {
      const selectedAlt = document.querySelector('.import-pop-alt.selected');
      if (selectedAlt) rawVal = selectedAlt.dataset.val || selectedAlt.textContent.trim();
    }
    if (!rawVal) return; // rien à valider
    const newVal = field === 'prix' ? parseFloat(rawVal) : rawVal;
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;

    const oldVal = c[field];
    c[field] = newVal;

    // Si appellation corrigée, enlever le statut unsure/unknown
    if (field === 'appellation' && (c.appellation_match === 'unsure' || c.appellation_match === 'unknown')) {
      c.appellation_match = 'ok';
    }

    // Ferme la popup AVANT le refresh pour éviter la réapparition
    _closePop();

    // Stocke l'édition pour suggestions sur les autres cellules de la colonne
    if (String(oldVal) !== String(newVal)) {
      _sessionEdits.push({ field, oldVal: String(oldVal), newVal: String(newVal) });
    }

    // Stocke la correction pour l'apprentissage
    if (oldVal !== newVal && App.user) {
      await _saveCorrection(String(oldVal), String(newVal), field);
    }

    // Retire l'incertitude sur ce champ
    if (c.confiance) c.confiance[field] = 1;
    if (c.alternatives) delete c.alternatives[field];

    _refreshRow(id);
  }

  function _commonPrefixLen(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  function _getSuggestions(field, currentVal) {
    const suggestions = [];
    const cv = String(currentVal);
    for (const edit of _sessionEdits) {
      if (edit.field !== field) continue;
      if (edit.oldVal === cv && cv.length > 0) continue; // skip si même valeur non-vide

      // Pattern 0 — Dernière valeur utilisée dans la colonne → proposer pour cellules différentes
      if (edit.newVal && edit.newVal !== cv) {
        suggestions.push(edit.newVal);
      }

      // Pattern 1 — Séparateur : "G23 – VINO BIANCO"→"G23" → pour "P22 – Perricone" suggérer "P22"
      // Détecte si l'edit a coupé à un séparateur ( – , - , / , : )
      const seps = [' – ', ' - ', ' / ', ' : ', ' — '];
      for (const sep of seps) {
        const sepIdx = edit.oldVal.indexOf(sep);
        if (sepIdx > 0 && edit.newVal === edit.oldVal.substring(0, sepIdx).trim()) {
          const cvSepIdx = cv.indexOf(sep);
          if (cvSepIdx > 0) suggestions.push(cv.substring(0, cvSepIdx).trim());
        }
        // Inversement : gardé la partie après le séparateur
        if (sepIdx > 0 && edit.newVal === edit.oldVal.substring(sepIdx + sep.length).trim()) {
          const cvSepIdx = cv.indexOf(sep);
          if (cvSepIdx > 0) suggestions.push(cv.substring(cvSepIdx + sep.length).trim());
        }
      }

      // Pattern 2 — Suffixe supprimé : "G23 blanc"→"G23", suffixe=" blanc"
      if (edit.oldVal.startsWith(edit.newVal) && edit.newVal.length < edit.oldVal.length) {
        const suffix = edit.oldVal.slice(edit.newVal.length);
        if (cv.endsWith(suffix)) suggestions.push(cv.slice(0, -suffix.length));
      }

      // Pattern 3 — Préfixe supprimé
      if (edit.oldVal.endsWith(edit.newVal) && edit.newVal.length < edit.oldVal.length) {
        const prefix = edit.oldVal.slice(0, edit.oldVal.length - edit.newVal.length);
        if (cv.startsWith(prefix)) suggestions.push(cv.slice(prefix.length));
      }

      // Pattern 4 — Dernier mot supprimé : "G23 blanc"→"G23"
      if (edit.oldVal.replace(/\s+\S+$/, '') === edit.newVal) {
        const s = cv.replace(/\s+\S+$/, '');
        if (s !== cv && s.length > 0) suggestions.push(s);
      }

      // Pattern 5 — Premier mot supprimé
      if (edit.oldVal.replace(/^\S+\s+/, '') === edit.newVal) {
        const s = cv.replace(/^\S+\s+/, '');
        if (s !== cv && s.length > 0) suggestions.push(s);
      }

      // Pattern 6 — Remplacement de sous-chaîne
      if (edit.oldVal.length > 1 && cv.includes(edit.oldVal)) {
        suggestions.push(cv.replace(edit.oldVal, edit.newVal));
      }

      // Pattern 7 — Même valeur appliquée 2+ fois → proposer partout
      if (edit.newVal && edit.newVal !== cv) {
        const sameEdits = _sessionEdits.filter(e => e.field === field && e.newVal === edit.newVal);
        if (sameEdits.length >= 2) suggestions.push(edit.newVal);
      }

      // Pattern 8 — Valeurs similaires (préfixe commun 50%+)
      if (edit.oldVal !== edit.newVal && Math.abs(edit.oldVal.length - cv.length) <= 2 && cv.length >= 4) {
        const pLen = _commonPrefixLen(edit.oldVal, cv);
        if (pLen >= Math.floor(Math.min(edit.oldVal.length, cv.length) * 0.5)) {
          suggestions.push(edit.newVal);
        }
      }

      // Pattern 9 — Préfixe "IGP " ou "AOP " supprimé/ajouté
      const prefixTags = ['IGP ', 'AOP ', 'AOC ', 'DOC ', 'DOCG '];
      for (const tag of prefixTags) {
        if (edit.oldVal.startsWith(tag) && edit.newVal === edit.oldVal.slice(tag.length)) {
          if (cv.startsWith(tag)) suggestions.push(cv.slice(tag.length));
        }
        if (!edit.oldVal.startsWith(tag) && edit.newVal === tag + edit.oldVal) {
          if (!cv.startsWith(tag)) suggestions.push(tag + cv);
        }
      }
    }
    // Dédupliquer et filtrer
    return [...new Set(suggestions)].filter(s => s !== cv && s.length > 0);
  }

  function closePop() { _closePop(); }

  function _closePop() {
    const pop = g('importPop');
    if (pop) pop.remove();
  }

  // ── Autocomplete appellation dans le popup d'édition ──
  function _attachAppAc(id, field) {
    const input = g('importPopInput');
    if (!input) return;
    if (typeof Appellations === 'undefined' || !Appellations.isReady()) return;

    const acDiv = document.createElement('div');
    acDiv.className = 'import-pop-ac';
    acDiv.style.display = 'none';
    input.parentNode.appendChild(acDiv);

    let debounce;
    input.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const val = input.value.trim();
        if (val.length < 1) { acDiv.style.display = 'none'; return; }
        const results = Appellations.search(val, 8);
        if (!results.length) { acDiv.style.display = 'none'; return; }
        acDiv.innerHTML = results.map(r => {
          const sub = [r.pays, r.region, r.type].filter(Boolean).join(' \u00b7 ');
          return `<div class="import-pop-ac-item" data-nom="${_esc(r.nom)}">
            <span class="import-pop-ac-nom">${_esc(r.nom)}</span>
            ${sub ? `<span class="import-pop-ac-sub">${_esc(sub)}</span>` : ''}
          </div>`;
        }).join('');
        acDiv.style.display = 'block';
        acDiv.querySelectorAll('.import-pop-ac-item').forEach(el => {
          el.addEventListener('mousedown', e => {
            e.preventDefault();
            input.value = el.dataset.nom;
            confirmEdit(id, field);
          });
        });
      }, 100);
    });
  }

  function _saveStateToSession() {
    try {
      sessionStorage.setItem('dcant_import_state', JSON.stringify({
        cuvees: _cuvees,
        appliedMode: _appliedMode,
        appliedValue: _appliedValue,
        appliedCharges: _appliedCharges,
        appliedRegles: _appliedRegles,
        sessionEdits: _sessionEdits,
        wizCur: _wizCur,
        instrText: g('importInstrInput')?.value || ''
      }));
    } catch (e) { console.warn('sessionStorage save failed:', e); }
  }

  function _restoreFromSession() {
    try {
      const raw = sessionStorage.getItem('dcant_import_state');
      if (!raw) return false;
      const state = JSON.parse(raw);
      sessionStorage.removeItem('dcant_import_state');
      if (!state.cuvees || !state.cuvees.length) return false;

      _cuvees = state.cuvees;
      _appliedMode = state.appliedMode;
      _appliedValue = state.appliedValue;
      _appliedCharges = state.appliedCharges;
      _appliedRegles = state.appliedRegles || [];
      _sessionEdits = state.sessionEdits || [];

      // Ouvre le wizard et va à l'étape sauvegardée
      g('importOverlay').classList.add('open');
      _lockScroll();
      // Active d'abord la carte 1 pour que wizGo puisse transitionner
      const card1 = g('importCard1');
      if (card1) card1.classList.add('active');
      _wizCur = 1;
      const targetStep = state.wizCur || 4;
      wizGo(targetStep);

      // Re-rend le tableau si on est à l'étape 2 ou 4
      setTimeout(() => {
        _renderTable();
        // Restaure le texte d'instruction si on est à l'étape 3
        if (state.instrText) {
          const inp = g('importInstrInput');
          if (inp) inp.value = state.instrText;
        }
      }, 100);

      return true;
    } catch (e) {
      console.warn('sessionStorage restore failed:', e);
      return false;
    }
  }

  function _showAuthPrompt() {
    // Ferme un éventuel prompt précédent
    const old = g('authPromptOverlay');
    if (old) old.remove();

    // Sauvegarde l'état import avant ouverture auth
    _saveStateToSession();

    const overlay = document.createElement('div');
    overlay.className = 'auth-prompt-overlay';
    overlay.id = 'authPromptOverlay';
    overlay.innerHTML = `
      <div class="auth-prompt-modal">
        <div class="auth-prompt-title">Connexion requise</div>
        <p class="auth-prompt-text">Connectez-vous ou créez un compte pour sauvegarder vos données.<br>Vos données seront conservées le temps de la connexion.</p>
        <div class="auth-prompt-btns">
          <button class="btn solid" id="authPromptLogin">Se connecter</button>
          <button class="btn solid" id="authPromptRegister">Créer un compte</button>
        </div>
        <button class="btn sm auth-prompt-cancel" id="authPromptCancel">Annuler</button>
      </div>`;
    document.body.appendChild(overlay);

    g('authPromptLogin').onclick = () => { overlay.remove(); UI.openAuth('login'); };
    g('authPromptRegister').onclick = () => { overlay.remove(); UI.openAuth('register'); };
    g('authPromptCancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  function deleteRow(id) {
    _closePop();
    _cuvees = _cuvees.filter(x => x.id !== id);
    const tr = g('import-row-' + id);
    if (tr) tr.remove();
    const nb = g('importNbCuvees');
    if (nb) nb.textContent = _cuvees.length + ' cuvée' + (_cuvees.length > 1 ? 's' : '') + ' détectée' + (_cuvees.length > 1 ? 's' : '');
    _updateSaveAllBtn();
  }

  function _refreshRow(id) {
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;
    const tr = g('import-row-' + id);
    if (tr) tr.outerHTML = _rowHTML(c);
    _updateSaveAllBtn();
  }

  // ── ZONES OPTIONNELLES ──

  function toggleChargesZone() {
    const z = g('importChargesZone');
    z.classList.toggle('open');
    g('importChargesToggle').classList.toggle('active');
  }

  function toggleMargeZone() {
    const z = g('importMargeZone');
    z.classList.toggle('open');
    g('importMargeToggle').classList.toggle('active');
  }

  function toggleModeleZone() {
    const z = g('importModeleZone');
    z.classList.toggle('open');
  }

  function toggleConditionsZone() {
    const z = g('importConditionsZone');
    z.classList.toggle('open');
  }

  function setImportMode(m) {
    document.querySelectorAll('.import-mode-tab').forEach(b => b.classList.remove('active'));
    document.querySelector(`.import-mode-tab[data-mode="${m}"]`)?.classList.add('active');
    const labels = { euros: 'Marge (€)', pct: 'Taux de marge (%)', coeff: 'Coefficient' };
    s('importModeLabel', labels[m]);
    g('importModeValue').dataset.mode = m;
  }

  function applyImportModele(nom) {
    const m = App.modeles.find(x => x.nom === nom);
    if (!m) return;
    // Pré-remplit les charges
    g('importTransport').value = m.transport || '';
    g('importDouane').value = m.douane || '';
    // Pré-remplit le mode
    setImportMode(m.mode);
    g('importModeValue').value = m.mode_value || '';
    toast('Modèle "' + nom + '" appliqué');
    g('importModeleZone').classList.remove('open');
  }

  // ── APPLICATION EN MASSE ──

  function applyAll() {
    // Si on a des règles interprétées par l'IA, on les utilise
    if (_appliedRegles && _appliedRegles.length > 0) {
      return _applyRegles(_appliedRegles);
    }
    // Sinon : mode manuel (formulaire)
    const modeEl = g('importModeValue');
    const mode = modeEl?.dataset.mode || 'euros';
    const modeVal = parseFloat(modeEl?.value) || 0;
    if (!modeVal) { toast('Entrez une valeur de marge.'); return; }

    const transport = parseFloat(g('importTransport')?.value) || 0;
    const douane = parseFloat(g('importDouane')?.value) || 0;
    const condField = g('importCondField')?.value;
    const condOp = g('importCondOp')?.value;
    const condVal = g('importCondVal')?.value;

    _appliedMode = mode;
    _appliedValue = modeVal;
    _appliedCharges = { transport, douane, others: [], total: transport + douane };

    let count = 0;
    _cuvees.forEach(c => {
      if (!_matchCondition(c, condField, condOp, condVal)) return;
      const charges = { ..._appliedCharges };
      const cr = Calcul.calculerCR(c.prix || 0, charges);
      if (cr <= 0) return;
      const r = Calcul.calculer(cr, modeVal, mode);
      if (r) { c.pvht = r.pvht; count++; }
    });

    _renderTable();
    toast(count + ' prix calculés');
  }

  function _applyRegles(regles) {
    // Réinitialise les pvht
    _cuvees.forEach(c => { c.pvht = null; });

    let count = 0;
    _cuvees.forEach(c => {
      for (const regle of regles) {
        const cond = regle.condition;
        if (!_matchCondition(c, cond?.champ, cond?.operateur, cond?.valeur)) continue;
        const transport = regle.charges?.transport || 0;
        const douane = regle.charges?.douane || 0;
        const charges = { transport, douane, others: [], total: transport + douane };
        const cr = Calcul.calculerCR(c.prix || 0, charges);
        const r = Calcul.calculer(cr > 0 ? cr : (c.prix || 0), regle.valeur, regle.mode);
        if (r) {
          c.pvht = r.pvht;
          c._regle = regle; // garde la règle appliquée pour info
          count++;
          break; // première règle qui match gagne
        }
      }
    });

    _appliedMode = regles[0]?.mode || 'coeff';
    _appliedValue = regles[0]?.valeur || 0;
    _appliedCharges = { transport: 0, douane: 0, others: [], total: 0 };

    _renderTable();
    toast(count + ' prix calculés');
  }

  function _matchCondition(c, field, op, val) {
    if (!field || !op || val === null || val === undefined || val === '') return true;
    const v = parseFloat(val);
    if (field === 'prix') {
      const p = parseFloat(c.prix) || 0;
      if (op === 'lt')  return p < v;
      if (op === 'lte') return p <= v;
      if (op === 'gt')  return p > v;
      if (op === 'gte') return p >= v;
      if (op === 'eq')  return p === v;
    }
    if (field === 'domaine') return (c.domaine || '').toLowerCase().includes(String(val).toLowerCase());
    if (field === 'millesime') return String(c.millesime || '') === String(val);
    return true;
  }

  // ── CALCUL LIGNE PAR LIGNE ──

  function calcLine(id) {
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;
    // Pré-remplit le formulaire principal
    if (g('domaine')) g('domaine').value = c.domaine || '';
    if (g('cuvee')) g('cuvee').value = c.cuvee || '';
    if (g('millesime')) g('millesime').value = c.millesime || '';
    if (g('prixAchat')) g('prixAchat').value = c.prix || '';

    // Pré-remplit les charges si définies
    if (_appliedCharges) {
      if (g('transport')) g('transport').value = _appliedCharges.transport || '';
      if (g('douane')) g('douane').value = _appliedCharges.douane || '';
    }

    Calcul_UI.compute();
    close();
    UI.showPage('calcul');
    toast('Formulaire pré-rempli — ajustez votre marge');
  }

  // ── MINIATURE DOCUMENT ──

  async function _showThumbnail(file) {
    const container = g('importThumbnailZone');
    if (!container || !file) return;

    let imgSrc = null;

    if (file.type === 'application/pdf') {
      // Utilise la première page déjà rendue par PDF.js si disponible
      if (window.pdfjsLib) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          imgSrc = canvas.toDataURL('image/jpeg', 0.8);
        } catch(e) {}
      }
    } else {
      imgSrc = await new Promise(res => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result);
        reader.readAsDataURL(file);
      });
    }

    if (!imgSrc) { container.style.display = 'none'; return; }

    _thumbnailUrl = imgSrc;
    container.style.display = 'block';
    container.innerHTML = `
      <div class="import-thumb-label">Document analysé — <span style="color:var(--accent)">${file.name}</span></div>
      <img class="import-thumb-img" src="${imgSrc}" alt="Aperçu" onclick="Import.openFullscreen()">
      <div class="import-thumb-hint">Tapez pour agrandir</div>
    `;
  }

  function openFullscreen() {
    if (!_thumbnailUrl) return;
    const overlay = document.createElement('div');
    overlay.className = 'import-fullscreen-overlay';
    overlay.onclick = () => overlay.remove();
    overlay.innerHTML = `<img src="${_thumbnailUrl}" style="max-width:95vw;max-height:92vh;object-fit:contain;border-radius:4px;">
      <div style="color:rgba(255,255,255,.6);font-size:12px;margin-top:10px">Tapez pour fermer</div>`;
    document.body.appendChild(overlay);
  }

  // ── SAUVEGARDE ──

  function showResDetail(id) {
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;
    // Toggle : ferme si déjà ouvert
    const existing = document.querySelector('.res-detail-row');
    if (existing) {
      const existId = parseInt(existing.dataset.for);
      existing.remove();
      if (existId === id) return;
    }
    const tr = g('import-res-row-' + id);
    if (!tr) return;

    const regle = c._regle;

    // Condition
    const opLabel = { lt:'<', lte:'≤', gt:'>', gte:'≥', eq:'=', contains:'contient' };
    const condTxt = regle?.condition?.champ
      ? `Prix ${opLabel[regle.condition.operateur] || '?'} ${_esc(regle.condition.valeur)} €`
      : '';

    // Prix d'achat + charges → coût de revient
    const pa = parseFloat(c.prix) || 0;
    const transport = parseFloat(regle?.charges?.transport) || 0;
    const douane   = parseFloat(regle?.charges?.douane) || 0;
    const totalCharges = transport + douane;
    const cr = pa + totalCharges;

    // Marge choisie
    const modeLabel = regle ? ({ euros:'Marge fixe', pct:'Taux de marge', coeff:'Coefficient' }[regle.mode] || regle.mode) : '—';
    const modeVal   = regle ? (fmt(regle.valeur) + (regle.mode === 'pct' ? ' %' : regle.mode === 'coeff' ? ' ×' : ' €')) : '—';

    // PV HT
    const pvht = c.pvht ? fmt(c.pvht) + ' €' : '—';

    // Marge brute
    const margeE = c.pvht ? (c.pvht - cr) : 0;
    const margePct = c.pvht && c.pvht > 0 ? (margeE / c.pvht * 100) : 0;

    const chargesHtml = totalCharges > 0
      ? `<div class="rd-row"><span class="rd-k">Charges</span><span class="rd-v">+ ${fmt(totalCharges)} €</span></div>`
      : '';

    const condHtml = condTxt
      ? `<div class="rd-row rd-cond"><span class="rd-k">Condition</span><span class="rd-v rd-cond-v">${condTxt}</span></div>`
      : '';

    const detailTr = document.createElement('tr');
    detailTr.className = 'res-detail-row';
    detailTr.dataset.for = id;
    detailTr.innerHTML = `<td colspan="4" style="padding:0"><div class="res-detail-body">

      <div class="rd-section">
        <div class="rd-row"><span class="rd-k">Prix d'achat</span><span class="rd-v">${fmt(pa)} €</span></div>
        ${chargesHtml}
        <div class="rd-row rd-total"><span class="rd-k">Prix de revient</span><span class="rd-v">${fmt(cr)} €</span></div>
      </div>

      <div class="rd-section">
        ${condHtml}
        <div class="rd-row"><span class="rd-k">${modeLabel}</span><span class="rd-v">${modeVal}</span></div>
      </div>

      <div class="rd-hero">
        <div class="rd-hero-label">Prix de vente HT</div>
        <div class="rd-hero-val">${pvht}</div>
        <div class="rd-hero-sub">${fmt(c.pvht * 1.2)} € TTC · marge ${fmt(margeE)} € (${margePct.toFixed(1)} %)</div>
      </div>

    </div></td>`;
    tr.insertAdjacentElement('afterend', detailTr);
    detailTr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  async function saveLineAndFade(id) {
    const tr = g('import-res-row-' + id);
    // Ferme aussi le détail ouvert pour cette ligne
    const detail = document.querySelector(`.res-detail-row[data-for="${id}"]`);
    if (detail) detail.remove();
    if (tr) {
      tr.style.transition = 'opacity .3s';
      tr.style.opacity = '0';
      setTimeout(() => { tr.remove(); _updateSaveAllBtn(); _updateResultHint(); }, 350);
    }
    await saveLine(id);
  }

  function _updateResultHint() {
    const uncalc = _cuvees.filter(c => c.pvht === null).length;
    const unsaved = _cuvees.filter(c => c.pvht !== null && !c.saved).length;
    const hint = g('importResultHint');
    if (hint) {
      hint.textContent = uncalc > 0
        ? `${uncalc} bouteille${uncalc > 1 ? 's' : ''} sans instruction — retournez à l'étape précédente.`
        : '';
    }
    const allSaved = _cuvees.every(c => c.saved || c.pvht === null);
    if (allSaved && _cuvees.some(c => c.saved)) {
      const foot = document.querySelector('#importCard4 .wiz-card-foot');
      if (foot && !g('wizAllSavedMsg')) {
        const btn = document.createElement('button');
        btn.id = 'wizAllSavedMsg';
        btn.className = 'wiz-btn-next';
        btn.style.cssText = 'background:var(--text);flex:1';
        btn.textContent = 'Consulter l\'historique →';
        btn.onclick = () => { Import.close(); UI.switchPage('historique'); };
        foot.insertBefore(btn, foot.firstChild);
        // Cache le bouton sauvegarder tout s'il existe
        const saveAll = g('importSaveAllBtn');
        if (saveAll) saveAll.style.display = 'none';
      }
    }
  }

  async function saveLine(id) {
    if (!App.user) { _showAuthPrompt(); return; }
    const c = _cuvees.find(x => x.id === id);
    if (!c || c.pvht === null) return;

    const charges = _appliedCharges || { transport: 0, douane: 0, others: [], total: 0 };
    const cr = Calcul.calculerCR(c.prix || 0, charges);
    const r = Calcul.calculer(cr, _appliedValue || 0, _appliedMode || 'euros');
    if (!r) return;

    const entry = {
      domaine: c.domaine || '',
      cuvee: c.cuvee || '',
      appellation: c.appellation || '',
      millesime: c.millesime || '',
      commentaire: g('importInstrInput')?.value?.trim() || '',
      prixAchat: c.prix || 0,
      charges: charges,
      cr: cr,
      mode: _appliedMode || 'euros',
      modeValue: _appliedValue || 0,
      pvht: r.pvht,
      mE: r.mE,
      pct: r.pct,
      coeff: r.coeff,
      pvttc: r.pvttc
    };

    const result = await Storage.saveCalcul(App.user.id, entry);
    if (!result.ok) { toast('Erreur sauvegarde : ' + (result.error || 'inconnue')); return; }
    c.saved = true;
    _refreshRow(id);
    App.historique = await Storage.getHistorique(App.user.id);
    toast('Sauvegardé dans l\'historique');
  }

  async function saveAll() {
    if (!App.user) { _showAuthPrompt(); return; }
    const toSave = _cuvees.filter(c => c.pvht !== null && !c.saved);
    if (!toSave.length) { toast('Rien à sauvegarder.'); return; }

    for (const c of toSave) await saveLine(c.id);

    // Fusionne les doublons de domaine dans Supabase
    await _mergeDuplicateDomains(App.user.id);

    toast(toSave.length + ' entrée' + (toSave.length > 1 ? 's' : '') + ' sauvegardée' + (toSave.length > 1 ? 's' : '') + ' !');

    // Ferme le modal et va sur l'historique
    close();
    setTimeout(() => {
      UI.showPage('historique');
      setTimeout(() => Feedback.showBanner(6, 'historyContent'), 1500);
    }, 300);
  }

  async function _mergeDuplicateDomains(userEmail) {
    try {
      const { data: entries } = await window.supabase
        .from('calculs')
        .select('id, domaine')
        .eq('user_id', userEmail);

      if (!entries || !entries.length) return;

      // Groupe par nom normalisé
      const normaliseDomaine = (str) => str ? str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) : '';
      const groups = {};
      entries.forEach(e => {
        const key = e.domaine.trim().toLowerCase();
        if (!groups[key]) groups[key] = { canonical: normaliseDomaine(e.domaine), ids: [] };
        groups[key].ids.push(e.id);
      });

      // Met à jour les entrées avec le nom normalisé
      for (const key of Object.keys(groups)) {
        const { canonical, ids } = groups[key];
        if (ids.length > 1 || groups[key].canonical !== entries.find(e => groups[key].ids.includes(e.id))?.domaine) {
          await window.supabase
            .from('calculs')
            .update({ domaine: canonical })
            .in('id', ids);
        }
      }
    } catch(e) { console.warn('merge domains:', e); }
  }

  function _updateSaveAllBtn() {
    const btn = g('importSaveAllBtn');
    if (!btn) return;
    const count = _cuvees.filter(c => c.pvht !== null && !c.saved).length;
    btn.style.display = count > 0 ? 'inline-block' : 'none';
    btn.textContent = `Sauvegarder tout (${count})`;
  }

  // ── APPRENTISSAGE ──

  async function _saveCorrection(original, corrected, field) {
    try {
      await window.supabase.from('corrections').insert([{
        user_id: App.user.id,
        original,
        corrected,
        field,
        created_at: new Date().toISOString()
      }]);
    } catch (e) {}
  }

  async function _getCorrections() {
    try {
      if (!App.user) return [];
      const { data } = await window.supabase
        .from('corrections')
        .select('*')
        .eq('user_id', App.user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    } catch (e) { return []; }
  }

  function renderModeleDrop() {
    const sel = g('importModeleSel');
    if (!sel) return;
    if (!App.modeles || !App.modeles.length) {
      sel.innerHTML = '<option value="">Aucun modèle enregistré</option>';
      return;
    }
    sel.innerHTML = '<option value="">Choisir un modèle...</option>' +
      App.modeles.map(m => `<option value="${_esc(m.nom)}">${_esc(m.nom)}</option>`).join('');
  }

  // ── INSTRUCTIONS VOCALES / TEXTE ──

  function toggleRecording() {
    if (ImportVoice.isRecording()) {
      ImportVoice.stop();
    } else {
      ImportVoice.start();
    }
  }

  function resetInstr() {
    if (g('importInstrInput')) g('importInstrInput').value = '';
    if (g('importInstrResult')) g('importInstrResult').style.display = 'none';
  }

  function wizDismissTuto() {
    localStorage.setItem('dcant_tuto_seen', '1');
    clearInterval(_wizExInterval);
    const overlay = g('wizTutoOverlay');
    if (overlay) {
      overlay.classList.add('hiding');
      setTimeout(() => { overlay.style.display = 'none'; }, 350);
    }
  }

  // Compat ancien nom
  function wizSkipTuto() { wizDismissTuto(); }

  function _startExamplesRotation() {
    clearInterval(_wizExInterval);
    // Tuto overlay — one-shot
    const tutoSeen = localStorage.getItem('dcant_tuto_seen');
    const overlay = g('wizTutoOverlay');
    if (overlay) {
      if (!tutoSeen) {
        overlay.style.display = 'flex';
        // Carousel dans le tuto
        const slides = overlay.querySelectorAll('.wiz-tuto-slide');
        let cur = 0;
        _wizExInterval = setInterval(() => {
          slides[cur].classList.remove('active');
          cur = (cur + 1) % slides.length;
          slides[cur].classList.add('active');
        }, 2200);
      } else {
        overlay.style.display = 'none';
      }
    }
    // Placeholder animé dans le textarea (défile les exemples)
    _startPlaceholderRotation();
  }

  function _startPlaceholderRotation() {
    const ta = g('importInstrInput');
    if (!ta || ta.value) return;
    const examples = [
      'Coefficient 2.8 sur toutes les bouteilles',
      'Marge 30 % sur les vins au-dessus de 15 €',
      'Moins de 6 € → coeff 2.5, plus de 6 € → coeff 3',
      '5 € de marge + 0.64 € de transport',
      'Marge 25 % sur les Bourgognes'
    ];
    let i = 0;
    const interval = setInterval(() => {
      if (ta.value) { clearInterval(interval); return; }
      ta.placeholder = examples[i];
      i = (i + 1) % examples.length;
    }, 2800);
  }

  function wizChatAutosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  // Sur mobile, quand le clavier s'ouvre sur le textarea step 3,
  // scroll pour garder la barre de saisie visible
  (function _initMobileChatFix() {
    if (!window.visualViewport) return;
    let _chatFocused = false;
    document.addEventListener('focusin', (e) => {
      if (e.target.id === 'importInstrInput') {
        _chatFocused = true;
        const onVpResize = () => {
          if (!_chatFocused) return;
          const bar = e.target.closest('.wiz-chat-bar');
          if (bar) bar.scrollIntoView({ behavior: 'smooth', block: 'end' });
        };
        window.visualViewport.addEventListener('resize', onVpResize);
        e.target.addEventListener('blur', () => {
          _chatFocused = false;
          window.visualViewport.removeEventListener('resize', onVpResize);
        }, { once: true });
      }
    });
  })();

  async function wizSendInstr() {
    // Si le micro est actif, on l'arrête et on attend la fin avant d'envoyer
    if (ImportVoice.isRecording()) {
      ImportVoice.stop();
      // onend sera appelé dans ~300ms — on attend puis on rappelle
      await new Promise(r => setTimeout(r, 500));
    }

    const ta = g('importInstrInput');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) { toast('Décrivez vos marges d\'abord.'); return; }
    if (!_cuvees.length) { toast('Analysez d\'abord un document.'); return; }

    clearInterval(_wizExInterval);
    g('importInstrBtn').disabled = true;
    const spinner = g('importInstrSpinner');
    if (spinner) spinner.style.display = 'flex';

    // Cache les exemples, montre la bulle
    const ex = g('wizChatExamples');
    if (ex) ex.style.display = 'none';

    try {
      const sample = _cuvees.slice(0, 5).map(c =>
        `${c.domaine} / ${c.cuvee} / ${c.millesime} / ${c.prix}€`
      ).join('\n');

      const systemPrompt = `Tu es un assistant JSON-only qui interprète des instructions de calcul de marge pour un caviste.
Tu ne réponds JAMAIS en texte libre. Tu retournes UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après, sans balises markdown.
Format attendu (même pour une seule règle) :
[
  {
    "mode": "euros" | "pct" | "coeff",
    "valeur": number,
    "charges": { "transport": number | null, "douane": number | null },
    "condition": {
      "champ": "prix" | "domaine" | "millesime" | null,
      "operateur": "lt" | "lte" | "gt" | "gte" | "eq" | "contains" | null,
      "valeur": string | number | null
    },
    "resume": "phrase courte et claire pour cette règle, en français, commençant par un verbe à l'infinitif"
  }
]
Si quelque chose est ambigu, formule un resume qui sera montré à l'utilisateur pour confirmation. Sois précis sur les conditions (seuils, domaines, etc.).`;

      const userMsg = `${_cuvees.length} cuvées. Exemples :
${sample}

Instructions : "${text}"`;

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error('API ' + response.status + ': ' + (err.error?.message || 'Erreur réseau'));
      }
      const data = await response.json();
      if (!data.content || !data.content[0]) throw new Error('Réponse vide de l\'API');
      const raw = data.content[0].text.trim()
        .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      let parsed;
      try { parsed = JSON.parse(raw); }
      catch(pe) {
        // Tente d'extraire un tableau JSON depuis la réponse
        const m = raw.match(/\[.*\]/s);
        if (m) parsed = JSON.parse(m[0]);
        else throw new Error('JSON invalide : ' + raw.slice(0, 100));
      }
      const regles = Array.isArray(parsed) ? parsed : [parsed];
      // Valide chaque règle
      regles.forEach(r => {
        if (!r.mode) r.mode = 'coeff';
        if (!r.valeur) r.valeur = 1;
        if (!r.charges) r.charges = { transport: null, douane: null };
        if (!r.condition) r.condition = { champ: null, operateur: null, valeur: null };
        if (!r.resume) r.resume = r.mode + ' ' + r.valeur;
      });
      _appliedRegles = regles;

      // Affiche la bulle de confirmation
      const bubble = g('wizConfirmBubble');
      const rulesEl = g('wizConfirmRules');
      if (bubble && rulesEl) {
        rulesEl.innerHTML = regles.map((r, i) => {
          const condTxt = r.condition?.champ
            ? ` <span class="wiz-confirm-cond">(si ${_esc(r.condition.champ)} ${r.condition.operateur === 'lt' ? '<' : r.condition.operateur === 'lte' ? '≤' : r.condition.operateur === 'gt' ? '>' : r.condition.operateur === 'gte' ? '≥' : '='} ${_esc(r.condition.valeur)})</span>`
            : '';
          return `<div class="wiz-confirm-rule">
            <span class="wiz-confirm-num">${regles.length > 1 ? (i + 1) + '.' : '→'}</span>
            <span>${_esc(r.resume)}${condTxt}</span>
          </div>`;
        }).join('');
        bubble.style.display = 'block';
      }

    } catch(e) {
      console.error('wizSendInstr error:', e);
      toast('Erreur : ' + (e.message || 'Réessayez ou reformulez.'));
      if (ex) ex.style.display = 'block';
      // Reshow examples
      const exEl = g('wizChatExamples');
      if (exEl) exEl.style.display = 'block';
    }

    if (spinner) spinner.style.display = 'none';
    g('importInstrBtn').disabled = false;
  }

  function wizEditInstr() {
    const bubble = g('wizConfirmBubble');
    if (bubble) bubble.style.display = 'none';
    const ex = g('wizChatExamples');
    if (ex) ex.style.display = 'block';
    _appliedRegles = [];
    const ta = g('importInstrInput');
    if (ta) ta.focus();
    _startExamplesRotation();
  }

  function wizConfirmAndCalc() {
    if (!_appliedRegles || !_appliedRegles.length) return;
    _applyRegles(_appliedRegles);
    // Met à jour le résumé des marges appliquées
    _updateResCondsTxt();
    _renderResultCard();
    wizGo(4);
  }

  function _updateResCondsTxt() {
    const rcv = g('importResCondsTxt');
    if (!rcv) return;
    // Résumé basé sur les règles appliquées
    if (_appliedRegles && _appliedRegles.length) {
      const opLabel = { lt:'<', lte:'≤', gt:'>', gte:'≥', eq:'=', contains:'contient' };
      const modeLabel = { euros:'Marge', pct:'Taux', coeff:'Coeff.' };
      const parts = _appliedRegles.map(r => {
        let txt = (modeLabel[r.mode] || r.mode) + ' ' + fmt(r.valeur) + (r.mode === 'pct' ? ' %' : r.mode === 'coeff' ? '×' : ' €');
        if (r.condition?.champ) {
          txt += ' si prix ' + (opLabel[r.condition.operateur] || '?') + ' ' + r.condition.valeur + ' €';
        }
        return txt;
      });
      rcv.textContent = parts.join(' · ');
    } else if (_appliedMode) {
      const labels = { euros: 'Marge €', pct: 'Taux %', coeff: 'Coefficient' };
      rcv.textContent = labels[_appliedMode] + (_appliedValue ? ' — ' + _appliedValue : '');
    } else {
      rcv.textContent = '—';
    }
  }

  async function interpretInstructions() {
    const text = g('importInstrInput')?.value?.trim();
    if (!text) { toast('Écrivez ou dictez des instructions d\'abord.'); return; }
    if (!_cuvees.length) { toast('Analysez d\'abord un document.'); return; }

    g('importInstrBtn').disabled = true;
    g('importInstrSpinner').style.display = 'flex';
    g('importInstrResult').style.display = 'none';

    try {
      const sample = _cuvees.slice(0, 5).map(c =>
        `${c.domaine} / ${c.cuvee} / ${c.millesime} / ${c.prix}€`
      ).join('\n');

      const systemPrompt = `Tu es un assistant JSON-only qui interprète des instructions de calcul de marge pour un caviste.
Tu ne réponds JAMAIS en texte libre. Tu retournes UNIQUEMENT un tableau JSON valide, sans aucun texte avant ou après, sans balises markdown.
Format attendu (même pour une seule règle) :
[
  {
    "mode": "euros" | "pct" | "coeff",
    "valeur": number,
    "charges": { "transport": number | null, "douane": number | null },
    "condition": {
      "champ": "prix" | "domaine" | "millesime" | null,
      "operateur": "lt" | "lte" | "gt" | "gte" | "eq" | "contains" | null,
      "valeur": string | number | null
    },
    "resume": "phrase courte pour cette règle en français"
  }
]
Règles :
- "mode"/"valeur" = marge de vente uniquement
- "charges" = frais extra, null si non mentionné
- Si aucune condition : champ/operateur/valeur = null
Exemples :
- "coeff 3 sur tout" → [{mode:"coeff",valeur:3,charges:{transport:null,douane:null},condition:{champ:null,operateur:null,valeur:null},resume:"Coefficient ×3 sur toutes les bouteilles"}]
- "< 6€ coeff 2, >= 6€ coeff 3" → [{mode:"coeff",valeur:2,condition:{champ:"prix",operateur:"lt",valeur:6},...}, {mode:"coeff",valeur:3,condition:{champ:"prix",operateur:"gte",valeur:6},...}]`;

      const userMsg = `${_cuvees.length} cuvées. Exemples :
${sample}

Instructions : "${text}"`;

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }]
        })
      });

      const data = await response.json();
      const raw = data.content[0].text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      let parsed = JSON.parse(raw);
      // Normalise : accepte objet unique ou tableau
      const regles = Array.isArray(parsed) ? parsed : [parsed];

      // Stocke les règles pour applyAll
      _appliedRegles = regles;

      // Affiche le résumé de toutes les règles
      const resumeTxt = regles.map((r, i) => `${regles.length > 1 ? (i+1) + '. ' : ''}${r.resume}`).join('\n');
      const resEl = g('importInstrResult');
      if (resEl) {
        resEl.textContent = '✓ ' + resumeTxt;
        resEl.style.display = 'block';
      }

    } catch(e) {
      toast('Impossible d\'interpréter. Vérifiez vos instructions.');
    }

    g('importInstrBtn').disabled = false;
    g('importInstrSpinner').style.display = 'none';
  }

  // ── WIZARD NAVIGATION ──

  function wizGo(n) {
    const CARD_IDS = { 1:'importCard1', 2:'importCard2', 'modele':'importCardModele', 'tuto':'importCardTuto', 3:'importCard3', '3a':'importCard3', '3b':'importCard3', 4:'importCard4' };
    const prevCard = document.querySelector('.wiz-card.active');
    const nextCard = document.getElementById(CARD_IDS[n]);
    if (!nextCard || prevCard === nextCard) return;

    const pi = _WIZ_ORDER.indexOf(_wizCur), ni = _WIZ_ORDER.indexOf(n);
    const fwd = ni >= pi;

    // Nettoie exit-left résiduels
    document.querySelectorAll('.wiz-card.exit-left').forEach(c => c.classList.remove('exit-left'));

    if (fwd) prevCard.classList.add('exit-left');
    prevCard.classList.remove('active');
    nextCard.classList.add('active');
    if (n === 3) { _startExamplesRotation(); }
    else { clearInterval(_wizExInterval); }

    setTimeout(() => {
      document.querySelectorAll('.wiz-card.exit-left').forEach(c => c.classList.remove('exit-left'));
    }, 300);

    _wizCur = n;
    _wizUpdateProgress(n);
    setTimeout(() => nextCard.scrollTop = 0, 10);
  }

  function _wizUpdateProgress(n) {
    const pcts = { 1:25, 2:50, 3:75, '3a':75, '3b':75, 4:100 };
    const el = document.getElementById('importProgFill');
    if (el) el.style.width = (pcts[n] || 25) + '%';

    const dotN = { 1:1, 2:2, 3:3, '3a':3, '3b':3, 4:4 };
    for (let i = 1; i <= 4; i++) {
      const d = document.getElementById('iwd' + i);
      if (!d) continue;
      const active = dotN[n] || 1;
      d.className = 'wiz-dot' + (i < active ? ' done' : i === active ? ' on' : '');
    }
    const lbls = { 1:'Étape 1 sur 4', 2:'Étape 2 sur 4', 3:'Étape 3 sur 4', '3a':'Étape 3 sur 4', '3b':'Étape 3 sur 4', 4:'Étape 4 sur 4' };
    const txt = document.getElementById('importStepTxt');
    if (txt) txt.textContent = lbls[n] || '';
  }

  function wizGoVerif() {
    // Lance l'analyse puis va en étape 2
    const file = g('importFileInput')?.files[0];
    if (!file) return;

    // Double-check auth (normalement bloqué dès étape 1)
    if (!App.user) {
      document.getElementById('authOverlay').classList.add('open');
      return;
    }

    const btn = g('importAnalyzeBtn');
    btn.disabled = true;
    btn.textContent = 'Analyse en cours…';
    wizGo(2);
    analyze().finally(() => {
      btn.disabled = false;
      btn.textContent = 'Analyser ce document →';
    });
  }

  // Depuis la carte 2 : carte modèle si modèles dispo, sinon direct carte 3
  function wizGoToStep3() {
    const modeles = (typeof App !== 'undefined' && App.modeles) ? App.modeles : [];
    if (modeles.length > 0) {
      _renderModeleCard();
      wizGo('modele');
    } else {
      wizGo(3);
    }
  }

  function wizChooseModele() {
    // Affiche le panneau liste des modèles dans la même carte
    const panel = g('wizModelePanel');
    const split = document.querySelector('.wiz-split-card');
    const foot  = document.querySelector('.wiz-split-foot');
    if (panel) panel.style.display = 'flex';
    if (split) split.style.display = 'none';
    if (foot)  foot.style.display  = 'none';
  }

  function wizHideModelePanel() {
    const panel = g('wizModelePanel');
    const split = document.querySelector('.wiz-split-card');
    const foot  = document.querySelector('.wiz-split-foot');
    if (panel) panel.style.display = 'none';
    if (split) split.style.display = 'flex';
    if (foot)  foot.style.display  = 'flex';
  }

  // Depuis la carte modèle → carte 3
  function wizGoInstr() {
    wizGo(3);
  }

  function _renderModeleCard() {
    const list = g('wizModeleList');
    const empty = g('wizModeleEmpty');
    if (!list) return;

    // Récupère les modèles depuis App.modeles
    const modeles = (typeof App !== 'undefined' && App.modeles) ? App.modeles : [];
    if (!modeles.length) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    list.innerHTML = modeles.map(m => {
      const modeStr = m.mode === 'euros' ? fmt(m.mode_value) + ' €' :
                      m.mode === 'pct' ? fmt(m.mode_value) + ' %' :
                      'Coeff × ' + fmt(m.mode_value);
      const chargesStr = m.charges && m.charges.total > 0 ? ' + ' + fmt(m.charges.total) + ' € charges' : '';
      return `<div class="wiz-modele-row" onclick="Import.wizApplyModeleAndCalc('${m.id}')">
        <div class="wiz-modele-row-name">${_esc(m.name || 'Modèle')}</div>
        <div class="wiz-modele-row-detail">${modeStr}${chargesStr}</div>
        <span class="wiz-modele-row-arr">›</span>
      </div>`;
    }).join('');
  }

  function wizApplyModeleAndCalc(modeleId) {
    const m = (App.modeles || []).find(x => x.id === modeleId);
    if (!m) return;
    // Applique le modèle à toutes les cuvées
    _appliedMode = m.mode;
    _appliedValue = m.mode_value;
    _appliedCharges = m.charges || { transport: 0, douane: 0, others: [], total: 0 };
    _appliedRegles = [{
      mode: m.mode,
      valeur: m.mode_value,
      charges: m.charges,
      condition: { champ: null, operateur: null, valeur: null },
      resume: m.name || 'Modèle appliqué'
    }];
    _applyRegles(_appliedRegles);
    wizGo(4);
  }

  function wizChoose(method, el) {
    _wizMethod = method;
    document.querySelectorAll('.wiz-choice').forEach(c => c.classList.remove('on'));
    el.classList.add('on');
    const btn = g('importChoiceNext');
    if (btn) btn.disabled = false;
    // Auto-avance après 300ms
    setTimeout(() => wizGoMethod(), 300);
  }

  function wizGoMethod() {
    if (!_wizMethod) return;
    wizGo(_wizMethod === 'dicter' ? '3a' : '3b');
  }

  function wizFillEx(el) {
    const ta = g('importInstrInput');
    if (ta) ta.value = el.textContent.replace(/^→\s*/, '').trim();
  }

  async function wizApplyDictee() {
    await interpretInstructions();
    const result = g('importInstrResult');
    if (result && result.style.display !== 'none') {
      applyAll();
      _updateResCondsTxt();
      _renderResultCard();
      wizGo(4);
    }
  }

  function wizApplyManuel() {
    applyAll();
    _updateResCondsTxt();
    _renderResultCard();
    wizGo(4);
  }

  function _renderResultCard() {
    const tbody = g('importTbodyResult');
    if (!tbody) return;

    const checkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;

    tbody.innerHTML = _cuvees.map(c => {
      if (c.pvht !== null) {
        if (c.saved) return '';
        // Sous-titre : cuvée · appellation millésime
        const parts = [_esc(c.cuvee || ''), c.appellation ? _esc(c.appellation) : '', _esc(c.millesime || '')].filter(Boolean);
        const sub = parts.join(' · ');
        // Marge info
        const margeE = c.pvht - (c.prix || 0);
        const margePct = c.prix > 0 ? (margeE / c.pvht * 100) : 0;
        return `<tr id="import-res-row-${c.id}">
          <td class="rc-info" onclick="Import.showResDetail(${c.id})">
            <div class="rc-domaine">${_esc(c.domaine || '—')}</div>
            ${sub ? `<div class="rc-sub">${sub}</div>` : ''}
          </td>
          <td class="rc-achat" onclick="Import.showResDetail(${c.id})">${c.prix ? fmt(c.prix) + ' €' : '—'}</td>
          <td class="rc-pvht" onclick="Import.showResDetail(${c.id})">
            <div class="rc-pvht-val">${fmt(c.pvht)} €</div>
            <div class="rc-pvht-ttc">${fmt(c.pvht * 1.2)} € TTC</div>
          </td>
          <td class="rc-action"><button class="res-save-arrow" onclick="Import.saveLineAndFade(${c.id})" title="Valider">${checkSvg}</button></td>
        </tr>`;
      } else {
        const parts = [_esc(c.cuvee || ''), c.appellation ? _esc(c.appellation) : '', _esc(c.millesime || '')].filter(Boolean);
        const sub = parts.join(' · ');
        return `<tr id="import-res-row-${c.id}" class="import-row-uncalc">
          <td class="rc-info">
            <div class="rc-domaine">${_esc(c.domaine || '—')}</div>
            ${sub ? `<div class="rc-sub">${sub}</div>` : ''}
          </td>
          <td class="rc-achat">${c.prix ? fmt(c.prix) + ' €' : '—'}</td>
          <td colspan="2" class="rc-action-alt"><button class="btn sm" style="font-size:11px" onclick="Import.wizGo('3a');setTimeout(()=>{ const ta=g('importInstrInput'); if(ta) ta.value='Pour ${_esc((c.domaine||'').replace(/'/g,"\\'"))} : '; },300)">+ Instruction</button></td>
        </tr>`;
      }
    }).join('');

    // Benchmark card (non-bloquant)
    var _bmCard = document.getElementById('import-benchmark-card');
    var _bmPairs = _cuvees
      .filter(function(c) { return c.pvht !== null && !c.saved && c.appellation && c.millesime; })
      .map(function(c) { return { appellation: c.appellation, millesime: c.millesime }; });
    if (_bmPairs.length && _bmCard && typeof Benchmark !== 'undefined') {
      _bmCard.style.display = 'block';
      _bmCard.innerHTML = '<div class="benchmark-card-title">Benchmark</div><span class="bm-loading"></span>';
      Benchmark.fetchMarketDataBatch(_bmPairs).then(function(cache) {
        var lines = [];
        var seen = new Set();
        _bmPairs.forEach(function(p) {
          var key = p.appellation + '|' + p.millesime;
          if (seen.has(key)) return;
          seen.add(key);
          var data = cache.get(key);
          if (data) {
            lines.push('<div class="bm-import-row"><span class="bm-import-label">' + p.appellation + ' ' + p.millesime + '</span> ' + Benchmark.renderMarketHTML(data, true) + '</div>');
          }
        });
        if (lines.length) {
          _bmCard.innerHTML = '<div class="benchmark-card-title">Benchmark</div>' + lines.join('');
        } else {
          _bmCard.innerHTML = '<div class="benchmark-card-title">Benchmark</div><span class="bm-nodata">Pas encore de donn\u00e9es</span>';
        }
      });
    } else if (_bmCard) {
      _bmCard.style.display = _bmPairs.length ? 'block' : 'none';
      if (_bmPairs.length) _bmCard.innerHTML = '<div class="benchmark-card-title">Benchmark</div><span class="bm-nodata">Pas encore de donn\u00e9es</span>';
    }

    // Miniature
    if (_thumbnailUrl) {
      const imgWrap = g('importResThumbImgWrap');
      if (imgWrap) imgWrap.innerHTML = `<img src="${_thumbnailUrl}" alt="Document" style="width:100%;max-height:100px;object-fit:contain;display:block;background:var(--bg)">`;
      const docName = g('importResDocName');
      if (docName && _currentFile) docName.textContent = _currentFile.name;
      const zone = g('importResThumbZone');
      if (zone) zone.style.display = 'block';
    }

    // Hint
    const calculated = _cuvees.filter(c => c.pvht !== null).length;
    const uncalc = _cuvees.length - calculated;
    const hint = g('importResultHint');
    if (hint) {
      hint.textContent = uncalc > 0
        ? `${uncalc} bouteille${uncalc > 1 ? 's' : ''} sans instruction — ajoutez-en une en retournant à l'étape précédente.`
        : '';
    }

    _updateSaveAllBtn();
  }

  // Override pour afficher "Sauvegarder les validées"
  function _updateSaveAllBtn() {
    const btn = g('importSaveAllBtn');
    if (!btn) return;
    const count = _cuvees.filter(c => c.pvht !== null && !c.saved).length;
    btn.style.display = count > 0 ? 'flex' : 'none';
    btn.textContent = `Sauvegarder tout (${count}) →`;
  }

  // Override _updateSaveAllBtn to work with wizard
  function _updateSaveAllBtnWiz() {
    const btn = g('importSaveAllBtn');
    if (!btn) return;
    const count = _cuvees.filter(c => c.pvht !== null && !c.saved).length;
    btn.style.display = count > 0 ? 'inline-flex' : 'none';
    btn.textContent = `Sauvegarder tout (${count}) →`;
  }

  return {
    open, close, closeBg: () => {}, onFileChange, onDrop, onDragOver, onDragLeave,
    analyze, editCell, selectAlt, confirmEdit, closePop, deleteRow,
    toggleChargesZone, toggleMargeZone, toggleModeleZone, toggleConditionsZone,
    setImportMode, applyImportModele, applyAll,
    calcLine, saveLine, saveLineAndFade, showResDetail, saveAll, renderModeleDrop,
    toggleRecording, interpretInstructions, openFullscreen,
    // Wizard
    wizGo, wizGoVerif, wizGoToStep3, wizGoInstr, wizChooseModele, wizHideModelePanel, wizApplyModeleAndCalc, wizSkipTuto, wizDismissTuto, wizSendInstr, wizEditInstr, wizConfirmAndCalc, wizChatAutosize,
    wizChoose, wizGoMethod, wizFillEx,
    wizApplyDictee, wizApplyManuel,
    resetInstr,
    restoreFromSession: _restoreFromSession,
    updateAuthGate: _updateAuthGate
  };

})();
