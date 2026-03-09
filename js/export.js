// ═══════════════════════════════════════════
// DCANT — Module Export v4
// Rapide (CSV/Excel) + Template IA (mapping colonnes)
// ═══════════════════════════════════════════

const Export = (() => {

  // ── État privé ──
  let _wizCur = 1;
  let _mode = 'rapide';          // 'rapide' | 'template'
  let _exportRows = [];
  let _exportType = 'all';
  let _selectedFormat = 'csv';
  let _selectedCols = ['domaine', 'cuvee', 'appellation', 'millesime', 'pvttc'];
  let _templateFile = null;
  let _templateHeaders = [];
  let _mappings = [];            // [{templateCol, dcantFields:[], defaultValue}]
  let _isSpreadsheet = true;
  let _exportHistory = [];
  let _scrollY = 0;
  let _fromHistory = false;

  // ── Voice recording ──
  let _mediaRecorder = null;
  let _audioChunks = [];
  let _recognition = null;
  let _micRecording = false;
  let _transcTimer = null;

  // ── Champs DCANT ──
  const DCANT_FIELDS = {
    domaine:      { label: 'Domaine',        getter: e => e.domaine || '' },
    cuvee:        { label: 'Cuvée',          getter: e => e.cuvee || '' },
    appellation:  { label: 'Appellation',    getter: e => e.appellation || '' },
    millesime:    { label: 'Millésime',      getter: e => e.millesime || '' },
    prix_achat:   { label: 'Prix achat (€)', getter: e => e.prix_achat ?? '' },
    pvht:         { label: 'PV HT (€)',      getter: e => e.pvht ?? '' },
    pvttc:        { label: 'PV TTC (€)',     getter: e => e.pvttc ?? '' },
    marge_euros:  { label: 'Marge (€)',      getter: e => e.marge_euros ?? '' },
    marge_pct:    { label: 'Marge (%)',      getter: e => e.marge_pct ?? '' },
    coeff:        { label: 'Coefficient',    getter: e => e.coeff ?? '' },
    commentaire:  { label: 'Commentaire',    getter: e => e.commentaire || '' },
    date:         { label: 'Date',           getter: e => e.created_at ? new Date(e.created_at).toLocaleDateString('fr-FR') : '' },
    transport:    { label: 'Transport (€)',  getter: e => e.charges?.transport || 0 },
    douane:       { label: 'Douane (€)',     getter: e => e.charges?.douane || 0 },
    cout_revient: { label: 'Coût revient (€)', getter: e => e.cout_revient ?? '' },
    mode:         { label: 'Mode',           getter: e => e.mode || '' },
    valeur_mode:  { label: 'Valeur mode',    getter: e => e.mode_value ?? '' }
  };

  const ALL_COLS = Object.keys(DCANT_FIELDS);

  // ── Scroll lock ──
  function _lockScroll() {
    _scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = -_scrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }
  function _unlockScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, _scrollY);
  }

  // ── OPEN / CLOSE ──
  function open(type) {
    if (!App.user) { UI.openAuth('login'); return; }
    const rows = type === 'sel'
      ? App.historique.filter(e => App.selectedIds.has(e.id))
      : [...App.historique];
    if (!rows.length) {
      toast(type === 'sel' ? 'Cochez d\'abord des cuvées.' : 'Aucun calcul à exporter.');
      return;
    }
    _exportType = type;
    _exportRows = rows;
    _reset();

    // Afficher le nombre de cuvées
    const sub = g('exportCountSub');
    if (sub) sub.textContent = _exportRows.length + ' cuvée' + (_exportRows.length > 1 ? 's' : '') + ' sélectionnée' + (_exportRows.length > 1 ? 's' : '');

    g('exportOverlay').classList.add('open');
    _lockScroll();
  }

  function close() {
    g('exportOverlay').classList.remove('open');
    _unlockScroll();
  }

  function _reset() {
    _wizCur = 1;
    _mode = 'rapide';
    _selectedFormat = 'csv';
    _selectedCols = ['domaine', 'cuvee', 'appellation', 'millesime', 'pvttc'];
    _templateFile = null;
    _templateHeaders = [];
    _mappings = [];

    document.querySelectorAll('#exportCardsWrap .wiz-card').forEach(c =>
      c.classList.remove('active', 'exit-left'));
    const c1 = g('exportCard1');
    if (c1) c1.classList.add('active');
    _wizUpdateProgress(1);

    // Reset format pills
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === 'csv'));

    // Reset panels
    const pr = g('exportPanelRapide');
    const pt = g('exportPanelTemplate');
    if (pr) pr.style.display = 'none';
    if (pt) pt.style.display = 'none';

    // Reset dropzone + description
    _isSpreadsheet = true;
    const dz = g('exportDropzone');
    if (dz) dz.classList.remove('drag-over');
    const ti = g('exportTemplateInfo');
    if (ti) ti.style.display = 'none';
    const as = g('exportAnalyzeSpinner');
    if (as) as.style.display = 'none';
    const tinput = g('exportTplInput');
    if (tinput) tinput.value = '';

    // Reset filename inputs
    const fnr = g('exportFileNameRapide');
    if (fnr) fnr.value = '';
    const fnt = g('exportFileNameTemplate');
    if (fnt) fnt.value = '';

    // Reset mapping
    _selectedMappingIdx = -1;
    const ml = g('exportMappingList');
    if (ml) ml.innerHTML = '';
    const me = g('exportMapEditor');
    if (me) me.style.display = 'none';
  }

  // ── WIZARD NAVIGATION ──
  const _CARD_IDS = { 1: 'exportCard1', 2: 'exportCard2', 3: 'exportCard3' };
  const _LABELS = { 1: 'Mode', 2: 'Configuration', 3: 'Mapping' };

  function wizGo(n) {
    const prevCard = document.querySelector('#exportCardsWrap .wiz-card.active');
    const nextCard = g(_CARD_IDS[n]);
    if (!nextCard || prevCard === nextCard) return;

    const fwd = n > _wizCur;
    document.querySelectorAll('#exportCardsWrap .wiz-card.exit-left')
      .forEach(c => c.classList.remove('exit-left'));
    if (fwd && prevCard) prevCard.classList.add('exit-left');
    if (prevCard) prevCard.classList.remove('active');
    nextCard.classList.add('active');

    setTimeout(() => {
      document.querySelectorAll('#exportCardsWrap .wiz-card.exit-left')
        .forEach(c => c.classList.remove('exit-left'));
    }, 300);

    _wizCur = n;
    _wizUpdateProgress(n);
    setTimeout(() => nextCard.scrollTop = 0, 10);

    // Update back buttons when coming from history
    if ((n === 2 || n === 3) && _fromHistory) {
      const btn = nextCard.querySelector('.wiz-btn-back');
      if (btn) {
        btn.textContent = '\u2190 Retour';
        btn.onclick = function() { _fromHistory = false; wizGo(1); setTimeout(openHistory, 100); };
      }
    } else if (n === 3) {
      const btn = nextCard.querySelector('.wiz-btn-back');
      if (btn) { btn.textContent = '\u2190 Modifier'; btn.onclick = function() { wizGo(2); }; }
    }
    if (n === 1) _fromHistory = false;
  }

  function _wizUpdateProgress(n) {
    const pcts = { 1: 33, 2: 66, 3: 100 };
    const el = g('exportProgFill');
    if (el) el.style.width = (pcts[n] || 33) + '%';

    for (let i = 1; i <= 3; i++) {
      const d = g('ewd' + i);
      if (!d) continue;
      d.className = 'wiz-dot' + (i < n ? ' done' : i === n ? ' on' : '');
    }
    const txt = g('exportStepTxt');
    if (txt) txt.textContent = _LABELS[n] || '';
  }

  // ── CARD 1 : Mode selection ──
  function selectMode(mode) {
    _mode = mode;
    if (mode === 'rapide') {
      _showRapidePanel();
    } else {
      _showTemplatePanel();
    }
    wizGo(2);
  }

  // ── CARD 2a : Export rapide ──
  function _showRapidePanel() {
    const pr = g('exportPanelRapide');
    const pt = g('exportPanelTemplate');
    if (pr) pr.style.display = 'flex';
    if (pt) pt.style.display = 'none';
    _renderColPills();
  }

  function _renderColPills() {
    const container = g('exportColPills');
    if (!container) return;

    const QUICK_COLS = ['domaine', 'cuvee', 'appellation', 'millesime', 'prix_achat', 'pvht', 'pvttc', 'marge_euros', 'marge_pct', 'coeff', 'commentaire'];

    container.innerHTML = QUICK_COLS.map(key => {
      const f = DCANT_FIELDS[key];
      const active = _selectedCols.includes(key);
      return '<button class="export-opt-pill' + (active ? ' active' : '') + '" data-col="' + key + '" onclick="Export.toggleCol(\'' + key + '\')">' +
        _esc(f.label.replace(/ \(.*\)/, '')) + '</button>';
    }).join('');
  }

  function toggleCol(key) {
    const idx = _selectedCols.indexOf(key);
    if (idx >= 0) {
      if (_selectedCols.length <= 1) { toast('Au moins une colonne.'); return; }
      _selectedCols.splice(idx, 1);
    } else {
      _selectedCols.push(key);
    }
    // Update pill
    const pill = document.querySelector('.export-opt-pill[data-col="' + key + '"]');
    if (pill) pill.classList.toggle('active', _selectedCols.includes(key));
  }

  function selectFormat(fmt) {
    _selectedFormat = fmt;
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === fmt));
  }

  // ── Download rapide (0 IA) ──
  function downloadRapide() {
    if (!_exportRows.length) { toast('Aucune donnée.'); return; }
    if (!_selectedCols.length) { toast('Sélectionnez au moins une colonne.'); return; }

    // Tri : domaine puis millésime desc
    const sorted = [..._exportRows].sort((a, b) => {
      const d = (a.domaine || '').localeCompare(b.domaine || '', 'fr');
      if (d !== 0) return d;
      return (b.millesime || 0) - (a.millesime || 0);
    });

    const headers = _selectedCols.map(k => DCANT_FIELDS[k].label);
    const rows = sorted.map(e =>
      _selectedCols.map(k => DCANT_FIELDS[k].getter(e))
    );

    const fname = (g('exportFileNameRapide')?.value || '').trim() || 'dcant_export';

    if (_selectedFormat === 'excel') {
      _downloadExcel(headers, rows, fname + '.xlsx');
    } else {
      _downloadCSV(headers, rows, fname + '.csv');
    }

    toast(sorted.length + ' cuvée(s) exportée(s)');
    _saveToHistory(fname);
    close();
    setTimeout(() => Feedback.showBanner(5, 'historyContent'), 700);
  }

  // ── CARD 2b : Upload template ──
  function _showTemplatePanel() {
    const pr = g('exportPanelRapide');
    const pt = g('exportPanelTemplate');
    if (pr) pr.style.display = 'none';
    if (pt) pt.style.display = 'flex';
  }

  function clickDropzone() {
    const input = document.querySelector('#exportDropzone input[type="file"]');
    if (input) input.click();
  }

  function onDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    g('exportDropzone')?.classList.add('drag-over');
  }

  function onDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    g('exportDropzone')?.classList.remove('drag-over');
  }

  function onDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    g('exportDropzone')?.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) _handleFile(file);
  }

  function onFileChange(e) {
    const file = e.target?.files?.[0];
    if (file) _handleFile(file);
  }

  function _handleFile(file) {
    _templateFile = file;
    const ext = file.name.split('.').pop().toLowerCase();
    _isSpreadsheet = ['csv', 'xlsx', 'xls'].includes(ext);

    const nameEl = g('exportTemplateName');
    if (nameEl) nameEl.textContent = file.name + ' (' + _formatSize(file.size) + ')';
    const info = g('exportTemplateInfo');
    if (info) info.style.display = '';

    // Pré-remplir le nom de fichier
    const fnInput = g('exportFileNameTemplate');
    if (fnInput) fnInput.value = file.name.replace(/\.[^.]+$/, '');
  }

  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  // ── Types de fichiers ──
  const _IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];
  const _IMAGE_MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

  function _readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Analyze template (1 appel IA) ──
  async function analyzeTemplate() {
    if (_micRecording) _stopMic();
    const userDesc = (g('exportTplInput')?.value || '').trim();

    if (!_templateFile && !userDesc) {
      toast('Importez un fichier ou décrivez les colonnes.');
      return;
    }

    const ext = _templateFile ? _templateFile.name.split('.').pop().toLowerCase() : '';
    const isImage = _templateFile && _IMAGE_EXTS.includes(ext);
    const isSpread = _templateFile && _isSpreadsheet;

    const spinner = g('exportAnalyzeSpinner');
    if (spinner) spinner.style.display = 'flex';

    try {
      const fieldKeys = ALL_COLS.join(', ');
      let messages;

      if (isSpread) {
        // ── Spreadsheet → lire headers avec SheetJS ──
        if (typeof XLSX === 'undefined') {
          toast('SheetJS non chargé. Rechargez la page.');
          if (spinner) spinner.style.display = 'none';
          return;
        }
        const data = await _templateFile.arrayBuffer();
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (!rows.length || !rows[0].length) {
          toast('Fichier vide ou sans en-têtes.');
          if (spinner) spinner.style.display = 'none';
          return;
        }

        _templateHeaders = rows[0].map(h => String(h).trim()).filter(Boolean);
        const headersList = _templateHeaders.map((h, i) => (i + 1) + '. "' + h + '"').join('\n');

        const mappingSystemPrompt = '[Contexte] Tu es un expert en mapping de données pour l\'export de fichiers viticoles. Associe les colonnes d\'un fichier source aux champs standardisés de DCANT.\n\n' +
          '[Tâche] Pour chaque colonne du fichier source, trouve le champ DCANT correspondant parmi : ' + fieldKeys + ' — ou null si aucune correspondance.\n\n' +
          '[Format de sortie]\n[{"templateCol": "str", "dcantField": "str ou null", "score": "float"}]\n\n' +
          '[Règles]\n- Exemples : "Producteur"→domaine, "AOC"→appellation, "Vintage"→millesime, "Prix Achat HT"→pavht, "Prix unitaire HT"→pvht, "Code barre"→null\n- Si ambiguïté, propose le champ le plus probable avec un score < 1.0.\n\n' +
          '[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.';

        messages = [
          { role: 'system', content: mappingSystemPrompt },
          { role: 'user', content: 'Type : Excel/CSV\nCOLONNES DU FICHIER :\n' + headersList + (userDesc ? '\n\nContexte : ' + userDesc : '') }
        ];

      } else if (isImage) {
        // ── Image (capture d'écran) → envoyer en vision ──
        const base64 = await _readFileAsBase64(_templateFile);
        const mediaType = _IMAGE_MIMES[ext] || 'image/png';

        const mappingSystemPrompt = '[Contexte] Tu es un expert en mapping de données pour l\'export de fichiers viticoles. Associe les colonnes d\'un fichier source aux champs standardisés de DCANT.\n\n' +
          '[Tâche] Identifie TOUTES les colonnes visibles et trouve le champ DCANT correspondant parmi : ' + fieldKeys + ' — ou null si aucune correspondance.\n\n' +
          '[Format de sortie]\n[{"templateCol": "nom_exact_colonne", "dcantField": "str ou null", "score": "float"}]\n\n' +
          '[Règles]\n- Exemples : "Désignation"→cuvee, "Prix unitaire HT"→pvht, "Référence"→null, "Stock"→null\n- Pour les images : analyse le texte extrait pour déduire les colonnes.\n\n' +
          '[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.';

        messages = [
          { role: 'system', content: mappingSystemPrompt },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } },
            { type: 'text', text: 'Type : Image\nIdentifie les colonnes visibles dans ce tableau.' + (userDesc ? '\nContexte : ' + userDesc : '') }
          ]}
        ];

      } else if (_templateFile && !isSpread && !isImage) {
        // ── Autre format (PDF, doc…) → description obligatoire ──
        if (!userDesc) {
          toast('Pour ce type de fichier, décrivez les colonnes.');
          if (spinner) spinner.style.display = 'none';
          return;
        }

        const mappingSystemPrompt = '[Contexte] Tu es un expert en mapping de données pour l\'export de fichiers viticoles. Associe les colonnes d\'un fichier source aux champs standardisés de DCANT.\n\n' +
          '[Tâche] Déduis les colonnes depuis la description et trouve le champ DCANT correspondant parmi : ' + fieldKeys + ' — ou null si aucune correspondance.\n\n' +
          '[Format de sortie]\n[{"templateCol": "nom_colonne", "dcantField": "str ou null", "score": "float"}]\n\n' +
          '[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.';

        messages = [
          { role: 'system', content: mappingSystemPrompt },
          { role: 'user', content: 'Type : ' + _templateFile.name + '\nDescription des colonnes :\n' + userDesc }
        ];

      } else {
        // ── Pas de fichier, description seule ──
        const mappingSystemPrompt = '[Contexte] Tu es un expert en mapping de données pour l\'export de fichiers viticoles. Associe les colonnes d\'un fichier source aux champs standardisés de DCANT.\n\n' +
          '[Tâche] Déduis les colonnes depuis la description et trouve le champ DCANT correspondant parmi : ' + fieldKeys + ' — ou null si aucune correspondance.\n\n' +
          '[Format de sortie]\n[{"templateCol": "nom_colonne", "dcantField": "str ou null", "score": "float"}]\n\n' +
          '[Instruction finale] Réponds uniquement avec le JSON valide. Aucune explication.';

        messages = [
          { role: 'system', content: mappingSystemPrompt },
          { role: 'user', content: 'Description des colonnes :\n' + userDesc }
        ];
      }

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: isImage ? 'claude-sonnet-4-20250514' : 'devstral-medium-latest',
          max_tokens: 1000,
          temperature: 0.1,
          messages
        })
      });

      if (!response.ok) {
        throw new Error('API ' + response.status);
      }

      const result = await response.json();
      let raw = result.choices[0].message.content.trim();
      raw = raw.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

      const parsed = JSON.parse(raw);

      // Si non-spreadsheet, extraire les headers depuis la réponse IA
      if (!isSpread) {
        _templateHeaders = parsed.map(m => m.templateCol);
      }

      _mappings = _templateHeaders.map(h => {
        const match = parsed.find(m => m.templateCol === h);
        const dcantField = match?.dcantField || null;
        return {
          templateCol: h,
          dcantFields: dcantField && DCANT_FIELDS[dcantField] ? [dcantField] : [],
          defaultValue: '',
          defaultPosition: null
        };
      });

      _renderMappings();
      wizGo(3);

    } catch (e) {
      console.error('Analyze error:', e);
      toast('Erreur d\'analyse : ' + (e.message || 'Réessayez.'));
    }

    if (spinner) spinner.style.display = 'none';
  }

  // ── CARD 3 : Mapping (pills + éditeur inline) ──
  let _selectedMappingIdx = -1;

  function _isMapped(m) {
    return (m.dcantFields && m.dcantFields.length > 0) || (m.defaultValue && m.defaultValue.trim());
  }

  function _mappingLabel(m) {
    const hasFields = m.dcantFields && m.dcantFields.length > 0;
    const hasDefault = m.defaultValue && m.defaultValue.trim();
    if (hasFields && hasDefault) {
      const fields = m.dcantFields.map(k => DCANT_FIELDS[k]?.label || k).join(', ');
      const dv = m.defaultValue.trim();
      if (m.defaultPosition === 'before') return dv + ' + ' + fields;
      if (m.defaultPosition === 'after') return fields + ' + ' + dv;
      return fields;
    }
    if (hasFields) return m.dcantFields.map(k => DCANT_FIELDS[k]?.label || k).join(', ');
    if (hasDefault) return m.defaultValue.trim();
    return null;
  }

  function _renderMappings() {
    const container = g('exportMappingList');
    if (!container) return;

    container.innerHTML = _mappings.map((m, i) => {
      const mapped = _isMapped(m);
      const target = _mappingLabel(m);
      const label = mapped
        ? _esc(m.templateCol) + ' \u2192 ' + _esc(target)
        : _esc(m.templateCol);
      const cls = 'export-map-pill' + (mapped ? ' mapped' : ' unmapped') +
        (i === _selectedMappingIdx ? ' selected' : '');
      return '<button class="' + cls + '" onclick="Export.selectMapping(' + i + ')">' +
        '<span class="export-map-pill-icon">' + (mapped ? '&#10003;' : '&#9888;') + '</span> ' +
        label +
      '</button>';
    }).join('') +
    '<button class="export-map-pill export-map-pill-add" onclick="Export.addColumn()">+</button>';
  }

  function addColumn() {
    const name = prompt('Nom de la nouvelle colonne :');
    if (!name || !name.trim()) return;
    _mappings.push({ templateCol: name.trim(), dcantFields: [], defaultValue: '', defaultPosition: null });
    _templateHeaders.push(name.trim());
    _renderMappings();
    selectMapping(_mappings.length - 1);
  }

  function removeColumn() {
    const idx = _selectedMappingIdx;
    if (idx < 0 || !_mappings[idx]) return;
    const name = _mappings[idx].templateCol;
    _mappings.splice(idx, 1);
    _templateHeaders = _templateHeaders.filter(h => h !== name);
    _selectedMappingIdx = -1;
    const editor = g('exportMapEditor');
    if (editor) editor.style.display = 'none';
    _renderMappings();
    toast('Colonne \u00ab ' + name + ' \u00bb supprim\u00e9e');
  }

  function selectMapping(idx) {
    _selectedMappingIdx = idx;
    const m = _mappings[idx];
    if (!m) return;

    // Highlight pill
    document.querySelectorAll('.export-map-pill').forEach((p, i) =>
      p.classList.toggle('selected', i === idx));

    // Show editor
    const editor = g('exportMapEditor');
    const title = g('exportMapEditorTitle');
    const fieldsContainer = g('exportMapEditorFields');
    const defaultInput = g('exportMapEditorDefault');
    if (!editor || !title || !fieldsContainer) return;

    title.textContent = '\u00ab ' + m.templateCol + ' \u00bb';

    // Render DCANT field pills (multi-select)
    const fields = m.dcantFields || [];
    fieldsContainer.innerHTML = ALL_COLS.map(k => {
      const active = fields.includes(k);
      return '<button class="export-opt-pill export-opt-pill-sm' + (active ? ' active' : '') +
        '" onclick="Export.editorToggleField(\'' + k + '\')">' +
        _esc(DCANT_FIELDS[k].label.replace(/ \(.*\)/, '')) + '</button>';
    }).join('');

    if (defaultInput) defaultInput.value = m.defaultValue || '';

    editor.style.display = '';
  }

  function editorToggleField(key) {
    const idx = _selectedMappingIdx;
    if (idx < 0 || !_mappings[idx]) return;
    const fields = _mappings[idx].dcantFields || [];
    const i = fields.indexOf(key);
    if (i >= 0) fields.splice(i, 1);
    else fields.push(key);
    _mappings[idx].dcantFields = fields;
    // Update pill in editor
    const btn = document.querySelector('.export-map-field-pills .export-opt-pill-sm[onclick*="' + key + '"]');
    if (btn) btn.classList.toggle('active', fields.includes(key));
    _renderMappings();
  }

  function editorValidate() {
    const idx = _selectedMappingIdx;
    if (idx < 0 || !_mappings[idx]) return;
    const m = _mappings[idx];
    const defInput = g('exportMapEditorDefault');
    if (defInput) m.defaultValue = defInput.value.trim();
    if (!_isMapped(m)) {
      toast('Sélectionnez un champ ou saisissez une valeur.');
      return;
    }

    // Si les deux sont remplis → popup choix position
    if (m.dcantFields && m.dcantFields.length > 0 && m.defaultValue && m.defaultValue.trim()) {
      _showDefaultPopup(idx);
      return;
    }

    _finishValidate(idx);
  }

  function _showDefaultPopup(idx) {
    const m = _mappings[idx];
    const dv = _esc(m.defaultValue.trim());
    const fields = m.dcantFields.map(k => DCANT_FIELDS[k]?.label || k).join(', ');
    let overlay = g('exportDefaultPopupOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'exportDefaultPopupOverlay';
      overlay.className = 'export-default-popup-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<div class="export-default-popup">' +
        '<div class="export-default-popup-title">Valeur par d\u00e9faut \u00ab ' + dv + ' \u00bb</div>' +
        '<div class="export-default-popup-sub">O\u00f9 placer cette valeur par rapport \u00e0 <b>' + _esc(fields) + '</b> ?</div>' +
        '<button class="btn solid sm" style="width:100%;margin-bottom:8px" onclick="Export.setDefaultPosition(\'before\')">Avant les champs DCANT</button>' +
        '<button class="btn solid sm" style="width:100%;margin-bottom:8px" onclick="Export.setDefaultPosition(\'after\')">Apr\u00e8s les champs DCANT</button>' +
        '<button class="btn sm danger" style="width:100%;margin-bottom:12px" onclick="Export.setDefaultPosition(\'replace\')">Remplacer les champs DCANT</button>' +
        '<div style="text-align:right"><button class="btn ghost sm" onclick="Export.closeDefaultPopup()">Annuler</button></div>' +
      '</div>';
    overlay.style.display = 'flex';
  }

  function setDefaultPosition(pos) {
    const idx = _selectedMappingIdx;
    if (idx < 0 || !_mappings[idx]) return;
    const m = _mappings[idx];
    if (pos === 'replace') {
      m.dcantFields = [];
      m.defaultPosition = null;
    } else {
      m.defaultPosition = pos;
    }
    closeDefaultPopup();
    _finishValidate(idx);
  }

  function closeDefaultPopup() {
    const ov = g('exportDefaultPopupOverlay');
    if (ov) ov.style.display = 'none';
  }

  function _finishValidate(idx) {
    const m = _mappings[idx];
    _renderMappings();
    const editor = g('exportMapEditor');
    if (editor) editor.style.display = 'none';
    _selectedMappingIdx = -1;
    document.querySelectorAll('.export-map-pill').forEach(p => p.classList.remove('selected'));
    toast('\u2713 ' + m.templateCol + ' valid\u00e9');
  }

  function editorSetDefault(val) {
    if (_selectedMappingIdx < 0 || !_mappings[_selectedMappingIdx]) return;
    _mappings[_selectedMappingIdx].defaultValue = val;
  }

  // ── Download template ──
  function downloadTemplate() {
    if (!_mappings.length) { toast('Aucun mapping.'); return; }
    if (!_exportRows.length) { toast('Aucune donnée.'); return; }

    // Tri : domaine puis millésime desc
    const sorted = [..._exportRows].sort((a, b) => {
      const d = (a.domaine || '').localeCompare(b.domaine || '', 'fr');
      if (d !== 0) return d;
      return (b.millesime || 0) - (a.millesime || 0);
    });

    const headers = _mappings.map(m => m.templateCol);
    const rows = sorted.map(e =>
      _mappings.map(m => {
        const hasFields = m.dcantFields && m.dcantFields.length > 0;
        const dv = m.defaultValue || '';
        if (hasFields) {
          const fieldVal = m.dcantFields
            .map(k => DCANT_FIELDS[k] ? DCANT_FIELDS[k].getter(e) : '')
            .filter(v => v !== '')
            .join(' | ');
          if (dv && m.defaultPosition === 'before') return dv + ' ' + fieldVal;
          if (dv && m.defaultPosition === 'after') return fieldVal + ' ' + dv;
          return fieldVal;
        }
        return dv;
      })
    );

    const defaultName = 'dcant_' + (_templateFile?.name?.replace(/\.[^.]+$/, '') || 'export');
    const fname = (g('exportFileNameTemplate')?.value || '').trim() || defaultName;

    if (_selectedFormat === 'excel') {
      _downloadExcel(headers, rows, fname + '.xlsx');
    } else {
      _downloadCSV(headers, rows, fname + '.csv');
    }

    toast(sorted.length + ' cuvée(s) exportée(s)');
    _saveToHistory(fname);
    close();
    setTimeout(() => Feedback.showBanner(5, 'historyContent'), 700);
  }

  // ── Génération fichiers ──
  function _downloadCSV(headers, rows, filename) {
    const lines = [
      headers.map(h => '"' + String(h).replace(/"/g, '""') + '"').join(';'),
      ...rows.map(row =>
        row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')
      )
    ];
    const csv = '\uFEFF' + lines.join('\n');
    _downloadBlob(csv, 'text/csv;charset=utf-8;', filename);
  }

  function _downloadExcel(headers, rows, filename) {
    if (typeof XLSX === 'undefined') {
      toast('SheetJS non chargé. Export CSV à la place.');
      _downloadCSV(headers, rows, filename.replace('.xlsx', '.csv'));
      return;
    }
    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Largeur auto
    ws['!cols'] = headers.map((h, i) => {
      let max = h.length;
      rows.forEach(r => { max = Math.max(max, String(r[i] || '').length); });
      return { wch: Math.min(max + 2, 40) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DCANT');
    XLSX.writeFile(wb, filename);
  }

  function _downloadBlob(content, type, filename) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }

  // ── Historique ──
  async function _saveToHistory(name) {
    if (!App.user) return;
    try {
      await Storage.saveExportHistory(App.user.id, {
        name: name || 'Export ' + new Date().toLocaleDateString('fr-FR'),
        instruction: _mode === 'rapide' ? 'Colonnes: ' + _selectedCols.join(', ') : 'Modèle: ' + (_templateFile?.name || '?'),
        interpretation: {
          mode: _mode,
          selectedCols: [..._selectedCols],
          mappings: _mappings.map(m => ({ templateCol: m.templateCol, dcantFields: [...(m.dcantFields || [])], defaultValue: m.defaultValue || '', defaultPosition: m.defaultPosition || null })),
          format: _selectedFormat,
          templateHeaders: [..._templateHeaders],
          filename: name
        },
        selected_format: _selectedFormat,
        template_custom: {},
        generated_html: ''
      });
    } catch (e) {
      console.warn('Save export history error:', e);
    }
  }

  async function openHistory() {
    const overlay = g('exportHistOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    _histSelectedIds.clear();

    const body = g('exportHistBody');
    if (body) body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dimmer)">Chargement...</div>';

    _exportHistory = App.user ? await Storage.getExportHistory(App.user.id) : [];
    _renderHistory();
  }

  function closeHistory() {
    const overlay = g('exportHistOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  let _histSelectedIds = new Set();

  function _renderHistory() {
    const body = g('exportHistBody');
    if (!body) return;

    if (!_exportHistory.length) {
      body.innerHTML = '<div class="export-hist-empty">Aucun export sauvegard\u00e9.</div>';
      _updateHistDeleteBtn();
      return;
    }

    body.innerHTML = _exportHistory.map((item, idx) => {
      const date = new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      const instr = (item.instruction || '').length > 80 ? item.instruction.slice(0, 80) + '...' : item.instruction;
      const hasConfig = item.interpretation && (item.interpretation.mode || item.interpretation.selectedCols);
      const checked = _histSelectedIds.has(item.id) ? ' checked' : '';
      return '<div class="export-hist-item">' +
        '<div class="export-hist-item-top">' +
          '<input type="checkbox" class="export-hist-check"' + checked + ' onclick="event.stopPropagation();Export.toggleHistorySelect(\'' + item.id + '\')">' +
          '<div class="export-hist-info" onclick="Export.loadFromHistory(' + idx + ')">' +
            '<div class="export-hist-name">' + _esc(item.name) + '</div>' +
            '<div class="export-hist-date">' + date + ' \u2014 ' + (item.selected_format || 'csv').toUpperCase() + '</div>' +
            '<div class="export-hist-instr">' + _esc(instr) + '</div>' +
          '</div>' +
          (hasConfig ? '<button class="export-hist-use-btn" onclick="event.stopPropagation();Export.loadFromHistory(' + idx + ')">Utiliser</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');

    _updateHistDeleteBtn();
  }

  function _updateHistDeleteBtn() {
    const hd = g('exportHistDeleteBatch');
    if (!hd) return;
    const n = _histSelectedIds.size;
    if (n > 0) {
      hd.style.display = '';
      hd.textContent = 'Supprimer (' + n + ')';
    } else {
      hd.style.display = 'none';
    }
  }

  function toggleHistorySelect(id) {
    if (_histSelectedIds.has(id)) _histSelectedIds.delete(id);
    else _histSelectedIds.add(id);
    _updateHistDeleteBtn();
  }

  async function deleteSelectedHistory() {
    const ids = [..._histSelectedIds];
    if (!ids.length) return;
    if (!confirm('Supprimer ' + ids.length + ' export(s) de l\'historique ?')) return;
    await Storage.deleteExportHistoryBatch(ids);
    _exportHistory = _exportHistory.filter(h => !_histSelectedIds.has(h.id));
    _histSelectedIds.clear();
    _renderHistory();
  }

  async function deleteHistory(id, idx) {
    if (!confirm('Supprimer cet export de l\'historique ?')) return;
    await Storage.deleteExportHistory(id);
    _exportHistory.splice(idx, 1);
    _histSelectedIds.delete(id);
    _renderHistory();
  }

  function loadFromHistory(idx) {
    const item = _exportHistory[idx];
    if (!item) return;
    const config = item.interpretation;
    if (!config || !config.mode) {
      toast('Pas de configuration r\u00e9utilisable.');
      return;
    }

    closeHistory();
    _fromHistory = true;

    // Restore mode
    _mode = config.mode;
    _selectedFormat = config.format || 'csv';

    // Update format pills
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === _selectedFormat));

    if (_mode === 'rapide') {
      _selectedCols = config.selectedCols || ['domaine', 'cuvee', 'appellation', 'millesime', 'pvttc'];
      _showRapidePanel();
      wizGo(2);
      // Set filename
      const fnr = g('exportFileNameRapide');
      if (fnr) fnr.value = config.filename || '';
    } else {
      _templateHeaders = config.templateHeaders || [];
      _mappings = (config.mappings || []).map(m => ({
        templateCol: m.templateCol,
        dcantFields: m.dcantFields || [],
        defaultValue: m.defaultValue || '',
        defaultPosition: m.defaultPosition || null
      }));
      _renderMappings();
      wizGo(3);
      // Set filename
      const fnt = g('exportFileNameTemplate');
      if (fnt) fnt.value = config.filename || '';
    }

    toast('Configuration charg\u00e9e : ' + _esc(item.name));
  }

  // ── Voice recording (micro) ──
  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function _setMicUI(recording) {
    _micRecording = recording;
    const btn = g('exportTplMicBtn');
    if (!btn) return;
    if (recording) {
      btn.classList.add('recording');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    } else {
      btn.classList.remove('recording');
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    }
  }

  function _showTranscSpinner() {
    const wrap = g('exportTplInput')?.closest('.wiz-chat-input-wrap');
    if (!wrap) return;
    wrap.style.position = 'relative';
    let ov = g('exportTranscSpinner');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'exportTranscSpinner';
      ov.className = 'transc-spinner-overlay';
      wrap.appendChild(ov);
    }
    let sec = 0;
    ov.innerHTML = '<span class="transc-spinner-dot"></span> Transcription… <span class="transc-spinner-time">0s</span>';
    ov.style.display = '';
    _transcTimer = setInterval(() => {
      sec++;
      const t = ov.querySelector('.transc-spinner-time');
      if (t) t.textContent = sec + 's';
    }, 1000);
  }

  function _hideTranscSpinner() {
    if (_transcTimer) { clearInterval(_transcTimer); _transcTimer = null; }
    const ov = g('exportTranscSpinner');
    if (ov) ov.style.display = 'none';
  }

  async function toggleMic() {
    if (_micRecording) {
      _stopMic();
      return;
    }
    if (!App.user) {
      toast('Connectez-vous pour utiliser le micro.');
      return;
    }
    // MediaRecorder + Whisper
    if (navigator.mediaDevices && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/mp4';
        _mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        _audioChunks = [];
        _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
        _mediaRecorder.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          const blob = new Blob(_audioChunks, { type: mime });
          _audioChunks = [];
          _setMicUI(false);
          _showTranscSpinner();
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = reader.result.split(',')[1];
            try {
              const resp = await fetch('/api/whisper', {
                method: 'POST',
                headers: await authHeaders(),
                body: JSON.stringify({ audio: base64, mime })
              });
              const data = await resp.json();
              if (!resp.ok) {
                const msg = resp.status === 401 ? 'Session expirée. Reconnectez-vous.'
                  : resp.status >= 500 ? 'Serveur indisponible. Réessayez.'
                  : data.error || 'Erreur de transcription.';
                throw new Error(msg);
              }
              const input = g('exportTplInput');
              if (input && data.text) {
                const existing = input.value.trimEnd();
                input.value = existing ? existing + ' ' + data.text : data.text;
                autosize(input);
              }
            } catch (err) {
              console.error('Whisper error:', err);
              toast(err.message || 'Erreur de transcription. Réessayez.');
            } finally {
              _hideTranscSpinner();
            }
          };
          reader.readAsDataURL(blob);
        };
        _mediaRecorder.start();
        _setMicUI(true);
        return;
      } catch (err) {
        console.warn('MediaRecorder error:', err);
        if (err.name === 'NotAllowedError') {
          toast('Autorisez l\'accès au micro dans votre navigateur.');
          return;
        }
        if (err.name === 'NotFoundError') {
          toast('Aucun micro détecté.');
          return;
        }
      }
    }
    // Fallback Web Speech
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Dictée non supportée. Tapez votre description.'); return; }
    _recognition = new SR();
    _recognition.lang = 'fr-FR';
    _recognition.continuous = true;
    _recognition.interimResults = true;
    const existing = (g('exportTplInput')?.value || '').trimEnd();
    _recognition.onstart = () => _setMicUI(true);
    _recognition.onresult = e => {
      let interim = '', final = '';
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      const input = g('exportTplInput');
      if (input) input.value = existing + (existing ? ' ' : '') + final + interim;
    };
    _recognition.onend = () => { _setMicUI(false); _recognition = null; };
    _recognition.onerror = ev => { if (ev.error !== 'no-speech') toast('Erreur dictée.'); _stopMic(); };
    _recognition.start();
  }

  function _stopMic() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
      _mediaRecorder = null;
      return;
    }
    if (_recognition) {
      try { _recognition.stop(); } catch (e) {}
    } else {
      _setMicUI(false);
    }
  }

  // ── Utilitaires ──
  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return {
    open, close,
    selectMode, selectFormat,
    toggleCol, downloadRapide,
    clickDropzone, onDrop, onDragOver, onDragLeave, onFileChange,
    analyzeTemplate, selectMapping, editorToggleField, editorValidate, editorSetDefault, addColumn, removeColumn,
    downloadTemplate,
    openHistory, closeHistory, deleteHistory, toggleHistorySelect, deleteSelectedHistory, loadFromHistory,
    setDefaultPosition, closeDefaultPopup,
    wizGo, autosize, toggleMic
  };

})();
