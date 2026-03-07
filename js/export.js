// ═══════════════════════════════════════════
// DCANT — Module Export IA v3
// Wizard guidé : type → config/questionnaire → récap → aperçu
// ═══════════════════════════════════════════

const Export = (() => {

  // ── État privé ──
  let _wizCur = 1;
  let _exportType = 'all';
  let _exportRows = [];
  let _selectedFormat = 'pdf';
  let _generatedHTML = '';
  let _templateCustom = {
    bgColor: '#ffffff',
    textColor: '#1a1a1a',
    accentColor: '#1a2744',
    fontPair: 'classic'
  };
  let _scrollY = 0;
  let _exportName = '';
  let _exportHistory = [];

  // ── Config structurée (remplace _instruction + _interpretation) ──
  let _config = {
    type: '',        // carte | tarif | inventaire | custom
    audience: '',
    mise_en_page: '',
    colonnes: [],
    tri: '',
    groupement: '',
    notes: ''        // instructions custom additionnelles
  };
  let _chatStep = 0;

  // ── Defaults par type ──
  const _TYPE_DEFAULTS = {
    carte: {
      audience: 'Clients restaurant',
      mise_en_page: 'carte des vins',
      colonnes: ['domaine', 'cuvee', 'appellation', 'millesime', 'pvttc'],
      tri: 'appellation',
      groupement: 'appellation'
    },
    tarif: {
      audience: 'Professionnels',
      mise_en_page: 'tarif prix',
      colonnes: ['domaine', 'cuvee', 'appellation', 'millesime', 'pvht'],
      tri: 'domaine',
      groupement: 'aucun'
    },
    inventaire: {
      audience: 'Usage interne',
      mise_en_page: 'inventaire complet',
      colonnes: ['domaine', 'cuvee', 'appellation', 'millesime', 'prix_achat', 'pvht', 'pvttc', 'marge_euros', 'marge_pct', 'coeff', 'commentaire'],
      tri: 'domaine',
      groupement: 'aucun'
    }
  };

  // ── Questions du questionnaire personnalisé ──
  const _QUESTIONS = [
    {
      text: 'Pour qui est ce document ?',
      key: 'audience',
      options: ['Clients restaurant', 'Professionnels', 'Usage interne']
    },
    {
      text: 'Quel style de mise en page ?',
      key: 'mise_en_page',
      options: ['Carte des vins élégante', 'Tableau structuré', 'Visuel graphique']
    },
    {
      text: 'Quelles informations afficher ?',
      key: 'colonnes',
      multi: true,
      options: ['domaine', 'cuvee', 'appellation', 'millesime', 'pvht', 'pvttc', 'marge_euros', 'coeff', 'commentaire'],
      labels: { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', pvht: 'Prix HT', pvttc: 'Prix TTC', marge_euros: 'Marge', coeff: 'Coeff', commentaire: 'Commentaire' },
      defaults: ['domaine', 'cuvee', 'appellation', 'millesime', 'pvttc']
    },
    {
      text: 'Comment organiser les vins ?',
      key: 'tri',
      options: ['Par appellation', 'Par domaine', 'Par prix']
    }
  ];

  // ── Template opts par type ──
  const _TEMPLATE_OPTS = {
    carte: [
      { label: 'Trier par', key: 'tri', options: ['appellation', 'domaine', 'prix'] },
      { label: 'Grouper', key: 'groupement', options: ['appellation', 'domaine', 'aucun'], labels: { appellation: 'Par appellation', domaine: 'Par domaine', aucun: 'Non' } }
    ],
    tarif: [
      { label: 'Prix affiché', key: '_prix_mode', options: ['ht', 'ttc', 'ht_ttc'], labels: { ht: 'HT seul', ttc: 'TTC seul', ht_ttc: 'HT + TTC' } },
      { label: 'Afficher marge', key: '_show_marge', options: ['non', 'oui'], labels: { non: 'Non', oui: 'Oui (€ + %)' } }
    ],
    inventaire: [
      { label: 'Trier par', key: 'tri', options: ['domaine', 'prix_achat', 'marge_pct'], labels: { domaine: 'Domaine', prix_achat: 'Prix d\'achat', marge_pct: 'Marge' } }
    ]
  };

  const _FONT_PAIRS = {
    classic:  { display: "'Fraunces', serif",           body: "'DM Sans', sans-serif",  label: 'Classique' },
    moderne:  { display: "'Inter', sans-serif",         body: "'Inter', sans-serif",    label: 'Moderne' },
    elegant:  { display: "'Playfair Display', serif",   body: "'Lato', sans-serif",     label: 'Élégant' },
    ardoise:  { display: "'Caveat', cursive",           body: "'DM Sans', sans-serif",  label: 'Ardoise' }
  };

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
    g('exportOverlay').classList.add('open');
    _lockScroll();
  }

  function close() {
    g('exportOverlay').classList.remove('open');
    _unlockScroll();
    ExportVoice.stop();
  }

  function _reset() {
    _wizCur = 1;
    _config = { type: '', audience: '', mise_en_page: '', colonnes: [], tri: '', groupement: '', notes: '' };
    _chatStep = 0;
    _selectedFormat = 'pdf';
    _generatedHTML = '';
    _templateCustom = { bgColor: '#ffffff', textColor: '#1a1a1a', accentColor: '#1a2744', fontPair: 'classic' };
    _exportName = '';

    document.querySelectorAll('#exportCardsWrap .wiz-card').forEach(c =>
      c.classList.remove('active', 'exit-left'));
    const c1 = g('exportCard1');
    if (c1) c1.classList.add('active');
    _wizUpdateProgress(1);

    const pc = g('exportPreviewContainer');
    if (pc) pc.innerHTML = '';
    const ri = g('exportRefineInput');
    if (ri) ri.value = '';

    // Reset color pickers
    const cpBg = g('exportColorBg');
    const cpTxt = g('exportColorText');
    const cpAcc = g('exportColorAccent');
    if (cpBg) cpBg.value = '#ffffff';
    if (cpTxt) cpTxt.value = '#1a1a1a';
    if (cpAcc) cpAcc.value = '#1a2744';
    // Reset font pills
    document.querySelectorAll('.export-font-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.font === 'classic'));
    // Reset format pills
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === 'pdf'));
  }

  // ── WIZARD NAVIGATION ──
  const _CARD_IDS = { 1: 'exportCard1', 2: 'exportCard2', 3: 'exportCard3', 4: 'exportCard4' };

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

    // Quand on arrive sur Card 3, render le récap
    if (n === 3) _renderRecap();

    setTimeout(() => nextCard.scrollTop = 0, 10);
  }

  function _wizUpdateProgress(n) {
    const pcts = { 1: 25, 2: 50, 3: 75, 4: 100 };
    const el = g('exportProgFill');
    if (el) el.style.width = (pcts[n] || 25) + '%';

    for (let i = 1; i <= 4; i++) {
      const d = g('ewd' + i);
      if (!d) continue;
      d.className = 'wiz-dot' + (i < n ? ' done' : i === n ? ' on' : '');
    }
    const lbls = { 1: 'Type', 2: 'Configuration', 3: 'Récap', 4: 'Aperçu' };
    const txt = g('exportStepTxt');
    if (txt) txt.textContent = lbls[n] || '';
  }

  // ── CARD 1 : Choix du type ──
  function exportDirect() {
    close();
    UI.exportCSV(_exportType);
  }

  function selectType(type) {
    _config.type = type;

    if (type !== 'custom') {
      // Appliquer les defaults
      const defs = _TYPE_DEFAULTS[type];
      Object.assign(_config, { ...defs });
      _showTemplateOpts(type);
    } else {
      // Mode personnalisé : questionnaire
      _config.audience = '';
      _config.mise_en_page = '';
      _config.colonnes = [];
      _config.tri = '';
      _config.groupement = 'aucun';
      _config.notes = '';
      _startQuestionnaire();
    }

    wizGo(2);
  }

  // ── CARD 2 : Template options ──
  function _showTemplateOpts(type) {
    const tpl = g('exportOptsTemplate');
    const cst = g('exportOptsCustom');
    if (tpl) tpl.style.display = '';
    if (cst) cst.style.display = 'none';

    const title = g('exportCard2Title');
    const sub = g('exportCard2Sub');
    const typeLabels = { carte: 'Carte des vins', tarif: 'Tarif professionnel', inventaire: 'Inventaire' };
    if (title) title.textContent = typeLabels[type] || 'Options';
    if (sub) sub.textContent = 'Ajustez les réglages de votre export.';

    const group = g('exportOptGroup');
    if (!group) return;

    const opts = _TEMPLATE_OPTS[type] || [];
    group.innerHTML = opts.map(opt => {
      const lbls = opt.labels || {};
      return '<div class="export-opt-row">' +
        '<div class="export-opt-label">' + _esc(opt.label) + '</div>' +
        '<div class="export-opt-pills" data-key="' + opt.key + '">' +
          opt.options.map(v => {
            const isDefault = (_config[opt.key] === v) ||
              (opt.key === '_prix_mode' && v === 'ht') ||
              (opt.key === '_show_marge' && v === 'non');
            return '<button class="export-opt-pill' + (isDefault ? ' active' : '') + '" data-val="' + v + '" onclick="Export.selectOpt(\'' + opt.key + '\',\'' + v + '\')">' +
              _esc(lbls[v] || v) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function selectOpt(key, val) {
    // Mettre à jour l'UI
    const pills = document.querySelectorAll('.export-opt-pills[data-key="' + key + '"] .export-opt-pill');
    pills.forEach(p => p.classList.toggle('active', p.dataset.val === val));

    // Mettre à jour _config
    if (key === '_prix_mode') {
      // Ajuster les colonnes selon le mode prix
      const base = _config.colonnes.filter(c => c !== 'pvht' && c !== 'pvttc');
      if (val === 'ht') base.push('pvht');
      else if (val === 'ttc') base.push('pvttc');
      else { base.push('pvht'); base.push('pvttc'); }
      _config.colonnes = base;
    } else if (key === '_show_marge') {
      const base = _config.colonnes.filter(c => c !== 'marge_euros' && c !== 'marge_pct');
      if (val === 'oui') { base.push('marge_euros'); base.push('marge_pct'); }
      _config.colonnes = base;
    } else {
      _config[key] = val;
    }
  }

  // ── CARD 2 : Questionnaire personnalisé ──
  function _startQuestionnaire() {
    const tpl = g('exportOptsTemplate');
    const cst = g('exportOptsCustom');
    if (tpl) tpl.style.display = 'none';
    if (cst) cst.style.display = '';

    const title = g('exportCard2Title');
    const sub = g('exportCard2Sub');
    if (title) title.textContent = 'Personnalisé';
    if (sub) sub.textContent = 'Répondez à quelques questions pour configurer votre export.';

    const flow = g('exportChatFlow');
    if (flow) flow.innerHTML = '';
    _chatStep = 0;
    _showQuestion(0);
  }

  function _showQuestion(idx) {
    if (idx >= _QUESTIONS.length) {
      _questionnaireDone();
      return;
    }

    const q = _QUESTIONS[idx];
    const flow = g('exportChatFlow');
    if (!flow) return;

    // Ajouter bulle question
    const bubble = document.createElement('div');
    bubble.className = 'export-chat-bubble export-chat-bubble-q';
    bubble.textContent = q.text;
    flow.appendChild(bubble);

    // Afficher les pills de réponse
    const bar = g('exportAnswerBar');
    const pills = g('exportAnswerPills');
    const other = g('exportAnswerOther');
    if (bar) bar.style.display = '';
    if (other) other.style.display = 'none';

    if (q.multi) {
      _showMultiSelect(idx, q);
    } else {
      _showSingleSelect(idx, q);
    }

    // Scroll en bas
    setTimeout(() => flow.scrollTop = flow.scrollHeight, 50);
  }

  function _showSingleSelect(idx, q) {
    const pills = g('exportAnswerPills');
    if (!pills) return;

    pills.innerHTML = q.options.map(opt =>
      '<button class="export-chat-pill" onclick="Export.answerQuestion(' + idx + ',\'' + _esc(opt).replace(/'/g, "\\'") + '\')">' + _esc(opt) + '</button>'
    ).join('') +
    '<button class="export-chat-pill export-chat-pill-other" onclick="Export.showOtherInput()">Autre</button>';
  }

  function _showMultiSelect(idx, q) {
    const pills = g('exportAnswerPills');
    if (!pills) return;

    const defs = q.defaults || [];
    const lbls = q.labels || {};
    pills.innerHTML = q.options.map(opt => {
      const selected = defs.includes(opt);
      return '<button class="export-chat-pill export-chat-pill-toggle' + (selected ? ' active' : '') + '" data-val="' + opt + '" onclick="this.classList.toggle(\'active\')">' +
        _esc(lbls[opt] || opt) + '</button>';
    }).join('') +
    '<button class="export-chat-pill export-chat-pill-validate" onclick="Export.validateMultiSelect(' + idx + ')">Valider</button>';
  }

  function showOtherInput() {
    const other = g('exportAnswerOther');
    if (other) other.style.display = 'flex';
    const input = g('exportCustomInput');
    if (input) { input.value = ''; input.focus(); }
  }

  function submitCustomAnswer() {
    if (ExportVoice.isRecording()) {
      ExportVoice.stop();
      setTimeout(() => submitCustomAnswer(), 600);
      return;
    }
    const input = g('exportCustomInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    answerQuestion(_chatStep, text);
  }

  function answerQuestion(idx, value) {
    const q = _QUESTIONS[idx];
    if (!q) return;

    // Stocker la réponse
    _config[q.key] = value;

    // Afficher bulle réponse user
    const flow = g('exportChatFlow');
    if (flow) {
      const bubble = document.createElement('div');
      bubble.className = 'export-chat-bubble export-chat-bubble-a';
      bubble.textContent = value;
      flow.appendChild(bubble);
    }

    // Cacher la barre de réponse
    const bar = g('exportAnswerBar');
    if (bar) bar.style.display = 'none';

    // Passer à la question suivante
    _chatStep = idx + 1;
    setTimeout(() => _showQuestion(_chatStep), 400);
  }

  function validateMultiSelect(idx) {
    const q = _QUESTIONS[idx];
    if (!q) return;

    const selected = [];
    document.querySelectorAll('#exportAnswerPills .export-chat-pill-toggle.active').forEach(p => {
      selected.push(p.dataset.val);
    });

    if (!selected.length) {
      toast('Sélectionnez au moins une information.');
      return;
    }

    _config[q.key] = selected;

    // Afficher bulle résumé
    const lbls = q.labels || {};
    const summary = selected.map(s => lbls[s] || s).join(', ');
    const flow = g('exportChatFlow');
    if (flow) {
      const bubble = document.createElement('div');
      bubble.className = 'export-chat-bubble export-chat-bubble-a';
      bubble.textContent = summary;
      flow.appendChild(bubble);
    }

    const bar = g('exportAnswerBar');
    if (bar) bar.style.display = 'none';

    _chatStep = idx + 1;
    setTimeout(() => _showQuestion(_chatStep), 400);
  }

  function _questionnaireDone() {
    // Déterminer le groupement depuis le tri
    const triMap = { 'Par appellation': 'appellation', 'Par domaine': 'domaine', 'Par prix': 'aucun' };
    if (typeof _config.tri === 'string' && triMap[_config.tri]) {
      _config.groupement = triMap[_config.tri];
      _config.tri = triMap[_config.tri] || _config.tri;
    }
    // Afficher message de fin dans le chat
    const flow = g('exportChatFlow');
    if (flow) {
      const bubble = document.createElement('div');
      bubble.className = 'export-chat-bubble export-chat-bubble-q';
      bubble.textContent = 'Parfait ! Voici le récap de votre export.';
      flow.appendChild(bubble);
    }
    setTimeout(() => wizGo(3), 800);
  }

  // ── CARD 3 : Récap ──
  function _renderRecap() {
    const rules = g('exportRecapRules');
    if (!rules) return;

    const typeLabels = { carte: 'Carte des vins', tarif: 'Tarif professionnel', inventaire: 'Inventaire', custom: 'Personnalisé' };
    const colLabels = { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', prix_achat: 'Prix achat', pvht: 'Prix HT', pvttc: 'Prix TTC', marge_euros: 'Marge €', marge_pct: 'Marge %', coeff: 'Coeff', commentaire: 'Commentaire' };

    const items = [
      { k: 'Type', v: typeLabels[_config.type] || _config.type },
      { k: 'Audience', v: _config.audience || '-' },
      { k: 'Colonnes', v: (_config.colonnes || []).map(c => colLabels[c] || c).join(', ') || '-' },
      { k: 'Tri', v: _config.tri || 'aucun' },
      { k: 'Groupement', v: _config.groupement || 'aucun' }
    ];
    if (_config.notes) {
      items.push({ k: 'Notes', v: _config.notes });
    }

    rules.innerHTML = items.map(item =>
      '<div class="wiz-confirm-rule">' +
        '<span class="wiz-confirm-num">' + _esc(item.k) + '</span>' +
        '<span>' + _esc(item.v) + '</span>' +
      '</div>'
    ).join('');

    // Nom d'export
    _exportName = _generateExportName();
  }

  function _generateExportName() {
    const typeLabels = { carte: 'Carte des vins', tarif: 'Tarif pro', inventaire: 'Inventaire', custom: 'Export personnalisé' };
    const fmt = _selectedFormat.toUpperCase();
    return (typeLabels[_config.type] || 'Export') + ' (' + fmt + ')';
  }

  // ── FORMAT ──
  function selectFormat(fmt) {
    _selectedFormat = fmt;
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === fmt));
    _exportName = _generateExportName();
  }

  // ── GENERATE ──
  async function generate() {
    const spinner = g('exportGenSpinner');
    const btn = g('exportGenBtn');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'flex';

    try {
      if (_selectedFormat === 'csv' || _selectedFormat === 'excel') {
        await _generateCSV();
      } else {
        await _generateHTML();
        wizGo(4);
      }
    } catch (e) {
      console.error('Generate error:', e);
      toast('Erreur de génération. Export CSV en fallback.');
      _generateCSVFallback();
    }

    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }

  // ── PROMPT STRUCTURÉ ──
  function _buildPrompt() {
    const colLabels = { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', prix_achat: 'Prix d\'achat', pvht: 'Prix HT', pvttc: 'Prix TTC', marge_euros: 'Marge €', marge_pct: 'Marge %', coeff: 'Coefficient', commentaire: 'Commentaire' };

    const system = 'RÔLE : Tu es un expert en mise en page de documents viticoles professionnels.\n\n' +
      'TÂCHE : Génère un document HTML de type "' + (_config.mise_en_page || 'tableau') + '" destiné à ' + (_config.audience || 'usage professionnel') + '.\n\n' +
      'CONTEXTE : L\'utilisateur est un professionnel du vin. Il a ' + _exportRows.length + ' vins dans son historique.\n\n' +
      'FORMAT DE SORTIE : HTML avec CSS inline, largeur 800px max.\n' +
      'Utilise les CSS variables :\n' +
      '- var(--export-bg) pour le fond\n' +
      '- var(--export-text) pour le texte\n' +
      '- var(--export-accent) pour les accents (titres, bordures)\n' +
      '- var(--export-font-display) pour les titres\n' +
      '- var(--export-font-body) pour le corps de texte\n\n' +
      'STRUCTURE :\n' +
      '- Colonnes à afficher : ' + (_config.colonnes || []).map(c => colLabels[c] || c).join(', ') + '\n' +
      '- Tri : ' + (_config.tri || 'aucun') + '\n' +
      '- Groupement : ' + (_config.groupement || 'aucun') + '\n' +
      (_config.notes ? '- Notes : ' + _config.notes + '\n' : '') + '\n' +
      'EXEMPLE : Pense à un document professionnel soigné avec titres clairs, espacement aéré, typographie élégante.\n\n' +
      'RÉFLEXION : Avant de générer, réfléchis à la meilleure mise en page pour ce type de document et cette audience.\n\n' +
      'CONTRAINTES :\n' +
      '- N\'invente JAMAIS de données vin\n' +
      '- Utilise UNIQUEMENT les données JSON fournies ci-dessous\n' +
      '- Retourne UNIQUEMENT le HTML, sans ```, sans doctype';

    return system;
  }

  async function _generateCSV() {
    const dataLines = _exportRows.map(r =>
      r.domaine + '|' + (r.cuvee || '') + '|' + (r.appellation || '') + '|' + (r.millesime || '') +
      '|PA:' + r.prix_achat + '|PVHT:' + r.pvht + '|TTC:' + r.pvttc +
      '|Marge:' + r.marge_euros + '|Coeff:' + r.coeff + '|' + (r.commentaire || '')
    ).join('\n');

    const colLabels = { domaine: 'Domaine', cuvee: 'Cuvée', appellation: 'Appellation', millesime: 'Millésime', prix_achat: 'Prix achat', pvht: 'Prix HT', pvttc: 'Prix TTC', marge_euros: 'Marge €', marge_pct: 'Marge %', coeff: 'Coeff', commentaire: 'Commentaire' };
    const cols = (_config.colonnes || []).map(c => colLabels[c] || c).join(', ');

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content:
          'Génère un fichier CSV avec ces colonnes exactes : ' + cols + '\n' +
          'Séparateur : ";"\n' +
          'Tri : ' + (_config.tri || 'aucun') + '\n' +
          'Données (' + _exportRows.length + ' lignes) :\n' + dataLines + '\n' +
          'Retourne UNIQUEMENT le CSV, avec ligne d\'en-tête, rien d\'autre. N\'invente aucune donnée.'
        }]
      })
    });
    if (!response.ok) {
      if (response.status === 529) throw new Error('API surchargée, réessayez dans 30s');
      throw new Error('API ' + response.status);
    }
    const data = await response.json();
    const csv = data.content[0].text.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/i, '').trim();
    _downloadBlob('\uFEFF' + csv, 'text/csv;charset=utf-8;', 'dcant_export.csv');
    toast(_exportRows.length + ' cuvée(s) exportée(s)');
    _saveToHistory();
    close();
    setTimeout(() => Feedback.showBanner(5, 'historyContent'), 700);
  }

  function _generateCSVFallback() {
    const csv = Calcul.genererCSV(_exportRows);
    _downloadBlob(csv, 'text/csv;charset=utf-8;', 'dcant_export.csv');
    toast('Export CSV téléchargé (fallback)');
    close();
  }

  async function _generateHTML() {
    const dataJson = _exportRows.map(r => JSON.stringify({
      domaine: r.domaine, cuvee: r.cuvee || '', appellation: r.appellation || '',
      millesime: r.millesime || '', prix_achat: r.prix_achat, pvht: r.pvht,
      pvttc: r.pvttc, marge_euros: r.marge_euros, marge_pct: r.marge_pct,
      coeff: r.coeff, commentaire: r.commentaire || ''
    })).join('\n');

    const systemPrompt = _buildPrompt();
    const userPrompt = 'Données (' + _exportRows.length + ' vins) :\n' + dataJson;

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
    if (!response.ok) {
      if (response.status === 529) throw new Error('API surchargée, réessayez dans 30s');
      throw new Error('API ' + response.status);
    }
    const data = await response.json();
    _generatedHTML = data.content[0].text.trim()
      .replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();

    _renderPreview();
  }

  // ── CARD 4 : Aperçu + personnalisation ──
  function _renderPreview() {
    const container = g('exportPreviewContainer');
    if (!container) return;

    const fp = _FONT_PAIRS[_templateCustom.fontPair] || _FONT_PAIRS.classic;
    container.style.setProperty('--export-bg', _templateCustom.bgColor);
    container.style.setProperty('--export-text', _templateCustom.textColor);
    container.style.setProperty('--export-accent', _templateCustom.accentColor);
    container.style.setProperty('--export-font-display', fp.display);
    container.style.setProperty('--export-font-body', fp.body);
    container.style.background = _templateCustom.bgColor;
    container.style.color = _templateCustom.textColor;
    container.innerHTML = _generatedHTML;
  }

  function updateCustom(prop, val) {
    _templateCustom[prop] = val;
    _renderPreview();
  }

  function selectFontPair(key) {
    _templateCustom.fontPair = key;
    document.querySelectorAll('.export-font-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.font === key));
    _renderPreview();
  }

  function chatAutosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function toggleRecording() {
    if (ExportVoice.isRecording()) ExportVoice.stop();
    else ExportVoice.start();
  }

  async function download() {
    const container = g('exportPreviewContainer');
    if (!container) return;

    toast('Génération du fichier…');

    try {
      if (typeof html2canvas === 'undefined') {
        throw new Error('html2canvas non chargé');
      }

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: _templateCustom.bgColor,
        width: container.scrollWidth,
        height: container.scrollHeight
      });

      if (_selectedFormat === 'pdf') {
        if (typeof window.jspdf === 'undefined') {
          throw new Error('jsPDF non chargé');
        }
        const { jsPDF } = window.jspdf;
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pxW = canvas.width;
        const pxH = canvas.height;
        const pdfW = 210;
        const pdfH = (pxH * pdfW) / pxW;
        const pdf = new jsPDF({ unit: 'mm', format: [pdfW, Math.max(pdfH, 297)] });
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
        pdf.save('dcant_export.pdf');
        toast('PDF téléchargé');
      } else {
        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'dcant_export.jpg';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
          toast('Image téléchargée');
        }, 'image/jpeg', 0.95);
      }

      _saveToHistory();
    } catch (e) {
      console.error('Download error:', e);
      toast('Erreur : ' + e.message);
    }
  }

  // ── REFINEMENT (Chat Card 4) ──
  async function sendRefinement() {
    const ta = g('exportRefineInput');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text || !_generatedHTML) return;

    const spinner = g('exportRefineSpinner');
    const btn = g('exportRefineBtn');
    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'flex';

    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4000,
          system: 'Tu modifies du HTML existant selon une instruction. Conserve les CSS variables (--export-bg, --export-text, --export-accent, --export-font-display, --export-font-body). Retourne UNIQUEMENT le HTML modifié, sans balises ```, sans doctype. N\'invente JAMAIS de données vin.',
          messages: [{ role: 'user', content: 'HTML actuel :\n' + _generatedHTML + '\n\nInstruction de modification : ' + text }]
        })
      });
      if (!response.ok) {
        if (response.status === 529) throw new Error('API surchargée, réessayez dans 30s');
        throw new Error('API ' + response.status);
      }
      const data = await response.json();
      _generatedHTML = data.content[0].text.trim()
        .replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();
      _renderPreview();
      ta.value = '';
      ta.style.height = 'auto';
    } catch (e) {
      console.error('Refinement error:', e);
      toast('Erreur de modification : ' + (e.message || 'Réessayez.'));
    }

    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }

  // ── SAVE TO HISTORY ──
  async function _saveToHistory() {
    if (!App.user) return;
    try {
      await Storage.saveExportHistory(App.user.id, {
        name: _exportName || 'Export ' + new Date().toLocaleDateString('fr-FR'),
        instruction: JSON.stringify(_config),
        interpretation: _config,
        selected_format: _selectedFormat,
        template_custom: _templateCustom,
        generated_html: _generatedHTML
      });
    } catch (e) {
      console.warn('Save export history error:', e);
    }
  }

  // ── EXPORT HISTORY ──
  async function openHistory() {
    const overlay = g('exportHistOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    const body = g('exportHistBody');
    if (body) body.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dimmer)">Chargement...</div>';

    if (App.user) {
      _exportHistory = await Storage.getExportHistory(App.user.id);
    } else {
      _exportHistory = [];
    }

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
        '<div class="export-hist-date">' + date + ' — ' + (item.selected_format || 'pdf').toUpperCase() + '</div>' +
        '<div class="export-hist-instr">' + _esc(instr) + '</div>' +
        '<div class="export-hist-actions">' +
          '<button class="btn sm solid" onclick="Export.reuseHistory(' + idx + ')">Utiliser</button>' +
          '<button class="btn sm danger" onclick="Export.deleteHistory(\'' + item.id + '\',' + idx + ')">Supprimer</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function reuseHistory(idx) {
    const item = _exportHistory[idx];
    if (!item) return;

    // Restaurer _config depuis l'historique
    if (item.interpretation && typeof item.interpretation === 'object') {
      _config = { ...item.interpretation };
    }
    _selectedFormat = item.selected_format || 'pdf';
    _templateCustom = item.template_custom || { bgColor: '#ffffff', textColor: '#1a1a1a', accentColor: '#1a2744', fontPair: 'classic' };
    _generatedHTML = item.generated_html || '';
    _exportName = item.name || '';

    // Update format pills
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === _selectedFormat));

    closeHistory();

    if (_generatedHTML) {
      _renderPreview();
      // Update custom panel
      const cpBg = g('exportColorBg');
      const cpTxt = g('exportColorText');
      const cpAcc = g('exportColorAccent');
      if (cpBg) cpBg.value = _templateCustom.bgColor;
      if (cpTxt) cpTxt.value = _templateCustom.textColor;
      if (cpAcc) cpAcc.value = _templateCustom.accentColor;
      document.querySelectorAll('.export-font-pill').forEach(p =>
        p.classList.toggle('active', p.dataset.font === _templateCustom.fontPair));
      wizGo(4);
    } else {
      _renderRecap();
      wizGo(3);
    }
  }

  async function deleteHistory(id, idx) {
    if (!confirm('Supprimer cet export de l\'historique ?')) return;
    await Storage.deleteExportHistory(id);
    _exportHistory.splice(idx, 1);
    _renderHistory();
  }

  // ── Utilitaires ──
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

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  return {
    open, close,
    exportDirect, selectType, selectOpt,
    showOtherInput, submitCustomAnswer, answerQuestion, validateMultiSelect,
    chatAutosize, toggleRecording,
    selectFormat, generate,
    updateCustom, selectFontPair, download,
    sendRefinement,
    openHistory, closeHistory, reuseHistory, deleteHistory,
    wizGo
  };

})();
