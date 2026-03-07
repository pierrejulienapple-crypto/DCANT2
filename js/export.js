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
  let _mappings = [];            // [{templateCol, dcantField, defaultValue}]
  let _exportHistory = [];
  let _scrollY = 0;

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

    // Reset dropzone
    const dz = g('exportDropzone');
    if (dz) dz.classList.remove('drag-over');
    const ti = g('exportTemplateInfo');
    if (ti) ti.style.display = 'none';
    const ab = g('exportAnalyzeBtn');
    if (ab) ab.style.display = 'none';
    const as = g('exportAnalyzeSpinner');
    if (as) as.style.display = 'none';

    // Reset mapping
    const ml = g('exportMappingList');
    if (ml) ml.innerHTML = '';
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

    if (_selectedFormat === 'excel') {
      _downloadExcel(headers, rows, 'dcant_export.xlsx');
    } else {
      _downloadCSV(headers, rows, 'dcant_export.csv');
    }

    toast(sorted.length + ' cuvée(s) exportée(s)');
    _saveToHistory('Export rapide');
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
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      toast('Format non supporté. Utilisez CSV, XLSX ou XLS.');
      return;
    }
    _templateFile = file;
    const nameEl = g('exportTemplateName');
    if (nameEl) nameEl.textContent = file.name + ' (' + _formatSize(file.size) + ')';
    const info = g('exportTemplateInfo');
    if (info) info.style.display = '';
    const btn = g('exportAnalyzeBtn');
    if (btn) btn.style.display = '';
  }

  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' o';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' Ko';
    return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
  }

  // ── Analyze template (1 appel IA) ──
  async function analyzeTemplate() {
    if (!_templateFile) { toast('Aucun fichier sélectionné.'); return; }

    if (typeof XLSX === 'undefined') {
      toast('SheetJS non chargé. Rechargez la page.');
      return;
    }

    const spinner = g('exportAnalyzeSpinner');
    const btn = g('exportAnalyzeBtn');
    if (spinner) spinner.style.display = 'flex';
    if (btn) btn.style.display = 'none';

    try {
      // Lire les headers avec SheetJS
      const data = await _templateFile.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

      if (!rows.length || !rows[0].length) {
        toast('Fichier vide ou sans en-têtes.');
        if (spinner) spinner.style.display = 'none';
        if (btn) btn.style.display = '';
        return;
      }

      _templateHeaders = rows[0].map(h => String(h).trim()).filter(Boolean);

      // Appel IA pour le mapping
      const fieldKeys = ALL_COLS.join(', ');
      const headersList = _templateHeaders.map((h, i) => (i + 1) + '. "' + h + '"').join('\n');

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{ role: 'user', content:
            'Tu mappes des colonnes de tableur.\n\n' +
            'COLONNES DU FICHIER UTILISATEUR :\n' + headersList + '\n\n' +
            'CHAMPS DCANT DISPONIBLES : ' + fieldKeys + '\n\n' +
            'Exemples de mapping : "Producteur"→domaine, "AOC"→appellation, "Vintage"→millesime, "Code barre"→null\n\n' +
            'Réponds UNIQUEMENT en JSON, sans texte autour :\n' +
            '[{"templateCol":"...","dcantField":"cle_ou_null"}]'
          }]
        })
      });

      if (!response.ok) {
        throw new Error('API ' + response.status);
      }

      const result = await response.json();
      let raw = result.content[0].text.trim();
      // Nettoyer markdown
      raw = raw.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();

      const parsed = JSON.parse(raw);

      _mappings = _templateHeaders.map(h => {
        const match = parsed.find(m => m.templateCol === h);
        const dcantField = match?.dcantField || null;
        return {
          templateCol: h,
          dcantField: dcantField && DCANT_FIELDS[dcantField] ? dcantField : null,
          defaultValue: ''
        };
      });

      _renderMappings();
      wizGo(3);

    } catch (e) {
      console.error('Analyze error:', e);
      toast('Erreur d\'analyse : ' + (e.message || 'Réessayez.'));
      if (btn) btn.style.display = '';
    }

    if (spinner) spinner.style.display = 'none';
  }

  // ── CARD 3 : Mapping ──
  function _renderMappings() {
    const container = g('exportMappingList');
    if (!container) return;

    container.innerHTML = _mappings.map((m, i) => {
      const mapped = !!m.dcantField;
      const icon = mapped ? '&#10003;' : '&#9888;';
      const cls = mapped ? 'export-map-ok' : 'export-map-warn';

      const selectOptions = '<option value="">(laisser vide)</option>' +
        ALL_COLS.map(k =>
          '<option value="' + k + '"' + (m.dcantField === k ? ' selected' : '') + '>' +
          _esc(DCANT_FIELDS[k].label) + '</option>'
        ).join('');

      return '<div class="export-map-row ' + cls + '">' +
        '<span class="export-map-icon">' + icon + '</span>' +
        '<span class="export-map-col">' + _esc(m.templateCol) + '</span>' +
        '<span class="export-map-arrow">&#8594;</span>' +
        '<select class="export-map-select" onchange="Export.changeMapping(' + i + ',this.value)">' +
          selectOptions +
        '</select>' +
        (!mapped ? '<input type="text" class="export-map-input" placeholder="Valeur par d\u00e9faut" value="' + _esc(m.defaultValue) + '" onchange="Export.setDefault(' + i + ',this.value)">' : '') +
      '</div>';
    }).join('');
  }

  function changeMapping(idx, field) {
    if (!_mappings[idx]) return;
    _mappings[idx].dcantField = field || null;
    _mappings[idx].defaultValue = '';
    _renderMappings();
  }

  function setDefault(idx, val) {
    if (!_mappings[idx]) return;
    _mappings[idx].defaultValue = val;
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
        if (m.dcantField && DCANT_FIELDS[m.dcantField]) {
          return DCANT_FIELDS[m.dcantField].getter(e);
        }
        return m.defaultValue || '';
      })
    );

    const name = 'dcant_' + (_templateFile?.name?.replace(/\.[^.]+$/, '') || 'export');

    if (_selectedFormat === 'excel') {
      _downloadExcel(headers, rows, name + '.xlsx');
    } else {
      _downloadCSV(headers, rows, name + '.csv');
    }

    toast(sorted.length + ' cuvée(s) exportée(s)');
    _saveToHistory('Export modèle — ' + (_templateFile?.name || ''));
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
        interpretation: {},
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

    const body = g('exportHistBody');
    if (body) body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dimmer)">Chargement...</div>';

    _exportHistory = App.user ? await Storage.getExportHistory(App.user.id) : [];
    _renderHistory();
  }

  function closeHistory() {
    const overlay = g('exportHistOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  function _renderHistory() {
    const body = g('exportHistBody');
    if (!body) return;

    if (!_exportHistory.length) {
      body.innerHTML = '<div class="export-hist-empty">Aucun export sauvegardé.</div>';
      return;
    }

    body.innerHTML = _exportHistory.map((item, idx) => {
      const date = new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
      const instr = (item.instruction || '').length > 80 ? item.instruction.slice(0, 80) + '...' : item.instruction;
      return '<div class="export-hist-item">' +
        '<div class="export-hist-name">' + _esc(item.name) + '</div>' +
        '<div class="export-hist-date">' + date + ' — ' + (item.selected_format || 'csv').toUpperCase() + '</div>' +
        '<div class="export-hist-instr">' + _esc(instr) + '</div>' +
        '<div class="export-hist-actions">' +
          '<button class="btn sm danger" onclick="Export.deleteHistory(\'' + item.id + '\',' + idx + ')">Supprimer</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  async function deleteHistory(id, idx) {
    if (!confirm('Supprimer cet export de l\'historique ?')) return;
    await Storage.deleteExportHistory(id);
    _exportHistory.splice(idx, 1);
    _renderHistory();
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
    onDrop, onDragOver, onDragLeave, onFileChange,
    analyzeTemplate, changeMapping, setDefault,
    downloadTemplate,
    openHistory, closeHistory, deleteHistory,
    wizGo
  };

})();
