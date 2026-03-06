// ═══════════════════════════════════════════
// DCANT — Module Import IA
// Analyse un tarif et pré-remplit le formulaire
// ═══════════════════════════════════════════

const Import = (() => {

  let _cuvees = [];
  let _appliedMode = null;
  let _appliedValue = null;
  let _appliedCharges = null;
  let _recognition = null;
  let _isRecording = false;
  let _currentFile = null;
  let _thumbnailUrl = null;
  let _appliedRegles = [];
  let _wizMethod = null;
  let _wizCur = 1;
  const _WIZ_ORDER = [1, 2, 'modele', 'tuto', 3, 4];
  let _wizExInterval = null;

  // ── OUVERTURE / FERMETURE ──

  function open() {
    g('importOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    _reset();
  }

  function close() {
    g('importOverlay').classList.remove('open');
    document.body.style.overflow = '';
    _stopRecording();
    _reset();
  }

  function closeBg(e) {
    if (e.target === g('importOverlay')) close();
  }

  function _reset() {
    _closePop();
    _cuvees = [];
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
      let base64, mediaType;

      const supportedRaw = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

      if (file.type === 'application/pdf') {
        const result = await _pdfToImage(file);
        base64 = result.base64;
        mediaType = 'image/jpeg';
      } else if (supportedRaw.includes(file.type) && file.size < 5 * 1024 * 1024) {
        // Fichier supporté par Claude et < 5MB : envoi brut (meilleure qualité)
        base64 = await _fileToBase64Raw(file);
        mediaType = file.type;
      } else {
        // HEIC, fichier trop gros, ou format exotique : conversion canvas
        base64 = await _fileToBase64(file);
        mediaType = 'image/jpeg';
      }

      console.log('[DCANT] analyze:', file.name, file.type, (file.size/1024).toFixed(0)+'KB', 'base64:', (base64.length/1024).toFixed(0)+'KB', 'mediaType:', mediaType);

      const corrections = await _getCorrections();
      const data = await callClaudeAPI(base64, mediaType, corrections);

      if (spinner) spinner.style.display = 'none';

      if (data.erreur) {
        const sizeInfo = `(${file.name}, ${file.type}, ${(file.size/1024).toFixed(0)}KB → base64: ${(base64.length/1024).toFixed(0)}KB)`;
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
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="color:#c00;padding:20px;text-align:center;font-size:13px;">Erreur : ${msg}</td></tr>`;
    }
  }

  async function _pdfToImage(file) {
    // Charge PDF.js depuis CDN
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = Math.min(pdf.numPages, 3); // max 3 pages

    // Rend chaque page dans un canvas séparé, puis combine
    const pages = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      let scale = 2.0;
      let vp = page.getViewport({ scale });

      // Cap pour iOS : max ~4M pixels par page
      const maxPixels = 4000000;
      if (vp.width * vp.height > maxPixels) {
        scale *= Math.sqrt(maxPixels / (vp.width * vp.height));
        vp = page.getViewport({ scale });
      }

      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      pages.push(c);
    }

    // Si une seule page, retourne directement
    if (pages.length === 1) {
      const dataUrl = pages[0].toDataURL('image/jpeg', 0.90);
      return { base64: dataUrl.split(',')[1] };
    }

    // Combine les pages verticalement
    const totalW = Math.max(...pages.map(c => c.width));
    const totalH = pages.reduce((s, c) => s + c.height, 0);
    const combined = document.createElement('canvas');
    combined.width = totalW;
    combined.height = totalH;
    const ctx = combined.getContext('2d');
    let y = 0;
    for (const c of pages) {
      ctx.drawImage(c, 0, y);
      y += c.height;
    }

    const dataUrl = combined.toDataURL('image/jpeg', 0.88);
    return { base64: dataUrl.split(',')[1] };
  }

  // ── TABLEAU ──

  function _renderTable() {
    const tbody = g('importTbody');
    tbody.innerHTML = _cuvees.map(c => _rowHTML(c)).join('');
    _updateSaveAllBtn();
  }

  function _rowHTML(c) {
    const fields = ['domaine', 'cuvee', 'appellation', 'millesime', 'prix'];
    const cells = fields.map(f => {
      const conf = c.confiance ? (c.confiance[f] || 1) : 1;
      const uncertain = conf < 0.8;
      const alts = c.alternatives && c.alternatives[f] ? c.alternatives[f] : [];
      const val = c[f] !== null && c[f] !== undefined ? c[f] : '';
      // Sérialise les alts sans guillemets qui casseraient l'attribut HTML
      const altsJson = JSON.stringify(alts).replace(/'/g, '&#39;');
      return `<td class="import-td-click${uncertain ? ' cell-uncertain' : ''}"
        onclick="event.stopPropagation();Import.editCell(${c.id},'${f}')"
        data-id="${c.id}" data-field="${f}"
        data-alts='${altsJson}'>
        <span class="td-val">${val}</span>${uncertain ? '<span class="cell-uncertain-dot">●</span>' : ''}
      </td>`;
    }).join('');

    return `<tr id="import-row-${c.id}">${cells}<td class="import-td-del" onclick="event.stopPropagation();Import.deleteRow(${c.id})" title="Supprimer cette ligne">✕</td></tr>`;
  }

  // ── ÉDITION INLINE ──

  function editCell(id, field) {
    const c = _cuvees.find(x => x.id === id);
    if (!c) return;
    const td = document.querySelector(`td[data-id="${id}"][data-field="${field}"]`);
    if (!td) return;

    const alts = JSON.parse(td.dataset.alts || '[]');
    const currentVal = c[field] !== null ? String(c[field]) : '';

    // Crée le popover
    _closePop();
    const pop = document.createElement('div');
    pop.className = 'import-popover';
    pop.id = 'importPop';
    pop.addEventListener('click', e => e.stopPropagation());

    let altsHTML = '';
    if (alts.length > 0) {
      altsHTML = `<div class="import-pop-alts">
        <div class="import-pop-alts-label">L'IA hésite avec :</div>
        ${alts.map(a => `<button class="import-pop-alt" data-val="${a.replace(/"/g,'&quot;')}" onclick="event.stopPropagation();Import.selectAlt(${id},'${field}',this.dataset.val,event)">${a}</button>`).join('')}
      </div>`;
    }

    pop.innerHTML = `
      ${altsHTML}
      <div class="import-pop-field">
        <input type="${field === 'prix' ? 'number' : 'text'}" 
          id="importPopInput" value="${currentVal}" 
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

    // Position fixed dans le body pour échapper aux overflow containers
    const rect = td.getBoundingClientRect();
    pop.style.position = 'fixed';
    pop.style.top = (rect.bottom + 4) + 'px';
    pop.style.left = rect.left + 'px';
    pop.style.zIndex = '9999';
    document.body.appendChild(pop);

    // Ferme la popup si on scrolle la carte
    const scrollParent = td.closest('.wiz-card-body');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', _closePop, { once: true });
    }

    // Ferme la popup si clic en dehors
    setTimeout(() => {
      document.addEventListener('click', _closePop, { once: true });
    }, 0);

    setTimeout(() => g('importPopInput')?.focus(), 50);
  }

  function selectAlt(id, field, val, ev) {
    // Met la valeur dans le champ de saisie comme base modifiable
    const input = g('importPopInput');
    if (input) {
      input.value = val;
      input.focus();
      input.select();
      // Highlight l'alt cliquée
      document.querySelectorAll('.import-pop-alt').forEach(b => b.classList.remove('selected'));
      if (ev && ev.target) ev.target.classList.add('selected');
    }
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

    // Ferme la popup AVANT le refresh pour éviter la réapparition
    _closePop();

    // Stocke la correction pour l'apprentissage
    if (oldVal !== newVal && App.user) {
      await _saveCorrection(String(oldVal), String(newVal), field);
    }

    // Retire l'incertitude sur ce champ
    if (c.confiance) c.confiance[field] = 1;
    if (c.alternatives) delete c.alternatives[field];

    _refreshRow(id);
  }

  function closePop() { _closePop(); }

  function _closePop() {
    const pop = g('importPop');
    if (pop) pop.remove();
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
      ? `Prix ${opLabel[regle.condition.operateur] || '?'} ${regle.condition.valeur} €`
      : 'Toutes les bouteilles';

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

    const chargesHtml = totalCharges > 0
      ? `<div class="rd-row"><span class="rd-k">Charges</span><span class="rd-v">+ ${fmt(totalCharges)} €</span></div>`
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
        <div class="rd-row rd-cond"><span class="rd-k">Condition</span><span class="rd-v rd-cond-v">${condTxt}</span></div>
        <div class="rd-row"><span class="rd-k">${modeLabel}</span><span class="rd-v">${modeVal}</span></div>
        <div class="rd-row rd-pvht"><span class="rd-k">Prix de vente HT</span><span class="rd-v rd-pvht-v">${pvht}</span></div>
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
    if (!App.user) { UI.openAuth('login'); return; }
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
    if (!App.user) { UI.openAuth('login'); return; }
    const toSave = _cuvees.filter(c => c.pvht !== null && !c.saved);
    if (!toSave.length) { toast('Rien à sauvegarder.'); return; }

    for (const c of toSave) await saveLine(c.id);

    // Fusionne les doublons de domaine dans Supabase
    await _mergeDuplicateDomains(App.user.id);

    toast(toSave.length + ' entrée' + (toSave.length > 1 ? 's' : '') + ' sauvegardée' + (toSave.length > 1 ? 's' : '') + ' !');

    // Ferme le modal et va sur l'historique
    close();
    setTimeout(() => UI.showPage('historique'), 300);
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

  // ── UTILITAIRES ──

  function _fileToBase64Raw(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        // Cap pour iOS : max ~4M pixels
        const maxPixels = 4000000;
        if (w * h > maxPixels) {
          const ratio = Math.sqrt(maxPixels / (w * h));
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        // Cap dimensions max 2500px
        const MAX = 2500;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
        resolve(dataUrl.split(',')[1]);
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Impossible de lire cette image'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function renderModeleDrop() {
    const sel = g('importModeleSel');
    if (!sel) return;
    if (!App.modeles || !App.modeles.length) {
      sel.innerHTML = '<option value="">Aucun modèle enregistré</option>';
      return;
    }
    sel.innerHTML = '<option value="">Choisir un modèle...</option>' +
      App.modeles.map(m => `<option value="${m.nom}">${m.nom}</option>`).join('');
  }

  // ── INSTRUCTIONS VOCALES / TEXTE ──

  function toggleRecording() {
    if (_isRecording) {
      _stopRecording();
    } else {
      _startRecording();
    }
  }

  function resetInstr() {
    if (g('importInstrInput')) g('importInstrInput').value = '';
    if (g('importInstrResult')) g('importInstrResult').style.display = 'none';
  }

  function _startRecording() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast('Dictée non supportée sur ce navigateur. Tapez vos instructions.');
      return;
    }

    _recognition = new SpeechRecognition();
    _recognition.lang = 'fr-FR';
    _recognition.continuous = true;   // continue tant qu'on ne stop pas
    _recognition.interimResults = true;

    // Conserve le texte déjà tapé avant de commencer
    const existingText = (g('importInstrInput')?.value || '').trimEnd();

    _recognition.onstart = () => {
      _isRecording = true;
      const btn = g('importMicBtn');
      if (btn) {
        btn.classList.add('recording');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
      }
    };

    _recognition.onresult = (e) => {
      // Reconstruit uniquement les résultats de cette session
      let interim = '';
      let final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const sep = existingText ? ' ' : '';
      g('importInstrInput').value = existingText + sep + final + interim;
    };

    _recognition.onend = () => {
      // onend déclenché automatiquement : ne remet pas à zéro, juste stop l'UI
      _isRecording = false;
      const btn = g('importMicBtn');
      if (btn) {
        btn.classList.remove('recording');
        btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`;
      }
      _recognition = null;
    };

    _recognition.onerror = (ev) => {
      if (ev.error !== 'no-speech') {
        toast('Erreur de dictée. Réessayez ou tapez vos instructions.');
      }
      _stopRecording();
    };

    _recognition.start();
  }

  function _stopRecording() {
    if (_recognition) {
      try { _recognition.stop(); } catch(e) {}
      // onend s'occupera du cleanup UI
    } else {
      _isRecording = false;
    }
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

  async function wizSendInstr() {
    // Si le micro est actif, on l'arrête et on attend la fin avant d'envoyer
    if (_isRecording) {
      _stopRecording();
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
        headers: { 'Content-Type': 'application/json' },
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
            ? ` <span class="wiz-confirm-cond">(si ${r.condition.champ} ${r.condition.operateur === 'lt' ? '<' : r.condition.operateur === 'lte' ? '≤' : r.condition.operateur === 'gt' ? '>' : r.condition.operateur === 'gte' ? '≥' : '='} ${r.condition.valeur})</span>`
            : '';
          return `<div class="wiz-confirm-rule">
            <span class="wiz-confirm-num">${regles.length > 1 ? (i + 1) + '.' : '→'}</span>
            <span>${r.resume}${condTxt}</span>
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
    _renderResultCard();
    wizGo(4);
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
        headers: { 'Content-Type': 'application/json' },
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
        <div class="wiz-modele-row-name">${m.name || 'Modèle'}</div>
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
      // Met à jour la carte résultat
      const rcv = g('importResCondsTxt');
      if (rcv) rcv.textContent = g('importInstrInput')?.value?.substring(0, 60) || '—';
      // Applique en masse
      applyAll();
      _renderResultCard();
      wizGo(4);
    }
  }

  function wizApplyManuel() {
    applyAll();
    const modeEl = g('importModeValue');
    const mode = modeEl?.dataset.mode || 'euros';
    const val = modeEl?.value;
    const labels = { euros: 'Marge €', pct: 'Taux %', coeff: 'Coefficient' };
    const rcv = g('importResCondsTxt');
    if (rcv) rcv.textContent = labels[mode] + (val ? ' — ' + val : '');
    _renderResultCard();
    wizGo(4);
  }

  function _renderResultCard() {
    const tbody = g('importTbodyResult');
    if (!tbody) return;

    tbody.innerHTML = _cuvees.map(c => {
      if (c.pvht !== null) {
        if (c.saved) return ''; // disparaît une fois sauvegardé
        const pvHtml = `<strong style="font-size:15px">${fmt(c.pvht)} €</strong><br><span style="font-size:10px;color:var(--dimmer)">${fmt(c.pvht * 1.2)} € TTC</span>`;
        const checkSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;
        return `<tr id="import-res-row-${c.id}">
          <td class="res-row-detail-cell" onclick="Import.showResDetail(${c.id})" style="cursor:pointer">
            <strong style="font-size:12px">${c.domaine || '—'}</strong>
            <br><span style="font-size:11px;color:var(--dimmer)">${c.cuvee || ''} ${c.appellation ? '· ' + c.appellation : ''} ${c.millesime || ''}</span>
          </td>
          <td class="res-row-detail-cell" onclick="Import.showResDetail(${c.id})" style="cursor:pointer;color:var(--dim);font-size:12px">${c.prix ? fmt(c.prix) + ' €' : '—'}</td>
          <td class="res-row-detail-cell" onclick="Import.showResDetail(${c.id})" style="cursor:pointer">${pvHtml}</td>
          <td><button class="res-save-arrow" onclick="Import.saveLineAndFade(${c.id})" title="Valider et sauvegarder">${checkSvg}</button></td>
        </tr>`;
      } else {
        // Pas de PV calculé — propose de dicter une instruction spécifique
        return `<tr id="import-res-row-${c.id}" class="import-row-uncalc">
          <td><strong style="font-size:12px">${c.domaine || '—'}</strong><br><span style="font-size:11px;color:var(--dimmer)">${c.cuvee || ''} ${c.appellation ? '· ' + c.appellation : ''} ${c.millesime || ''}</span></td>
          <td style="color:var(--dim);font-size:12px">${c.prix ? fmt(c.prix) + ' €' : '—'}</td>
          <td colspan="2"><button class="btn sm" style="font-size:11px" onclick="Import.wizGo('3a');setTimeout(()=>{ const ta=g('importInstrInput'); if(ta) ta.value='Pour ${(c.domaine||'').replace(/'/g,"\'")} : '; },300)">+ Instruction</button></td>
        </tr>`;
      }
    }).join('');

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
    resetInstr
  };

})();
