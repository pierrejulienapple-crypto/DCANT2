// ═══════════════════════════════════════════
// DCANT — Module Export IA
// Wizard plein écran : instruction → IA → aperçu → téléchargement
// ═══════════════════════════════════════════

const Export = (() => {

  // ── État privé ──
  let _wizCur = 1;
  let _exportType = 'all';
  let _exportRows = [];
  let _instruction = '';
  let _attachedFile = null;
  let _interpretation = null;
  let _selectedFormat = 'pdf';
  let _generatedHTML = '';
  let _templateCustom = {
    bgColor: '#ffffff',
    textColor: '#1a1a1a',
    accentColor: '#1a2744',
    fontPair: 'classic'
  };
  let _wizExInterval = null;
  let _scrollY = 0;
  let _exportName = '';
  let _exportHistory = [];

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
    clearInterval(_wizExInterval);
  }

  function _reset() {
    _wizCur = 1;
    _instruction = '';
    _attachedFile = null;
    _interpretation = null;
    _selectedFormat = 'pdf';
    _generatedHTML = '';
    _templateCustom = { bgColor: '#ffffff', textColor: '#1a1a1a', accentColor: '#1a2744', fontPair: 'classic' };
    clearInterval(_wizExInterval);
    document.querySelectorAll('#exportCardsWrap .wiz-card').forEach(c =>
      c.classList.remove('active', 'exit-left'));
    const c1 = g('exportCard1');
    if (c1) c1.classList.add('active');
    _wizUpdateProgress(1);
    const ta = g('exportInstrInput');
    if (ta) ta.value = '';
    const cb = g('exportConfirmBubble');
    if (cb) cb.style.display = 'none';
    const as = g('exportAttachStatus');
    if (as) as.style.display = 'none';
    const pc = g('exportPreviewContainer');
    if (pc) pc.innerHTML = '';
    const ri = g('exportRefineInput');
    if (ri) ri.value = '';
    _exportName = '';
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
  const _WIZ_STEPS = [1, 'tuto', 3, 4, 5];
  const _CARD_IDS = {
    1: 'exportCard1',
    'tuto': 'exportCardTuto',
    3: 'exportCard3',
    4: 'exportCard4',
    5: 'exportCard5'
  };

  function wizGo(n) {
    const prevCard = document.querySelector('#exportCardsWrap .wiz-card.active');
    const nextCard = g(_CARD_IDS[n]);
    if (!nextCard || prevCard === nextCard) return;

    const pi = _WIZ_STEPS.indexOf(_wizCur);
    const ni = _WIZ_STEPS.indexOf(n);
    const fwd = ni >= pi;

    document.querySelectorAll('#exportCardsWrap .wiz-card.exit-left')
      .forEach(c => c.classList.remove('exit-left'));

    if (fwd && prevCard) prevCard.classList.add('exit-left');
    if (prevCard) prevCard.classList.remove('active');
    nextCard.classList.add('active');

    if (n === 'tuto') _startTutoCarousel();
    else if (n === 3) _startPlaceholderRotation();
    else clearInterval(_wizExInterval);

    setTimeout(() => {
      document.querySelectorAll('#exportCardsWrap .wiz-card.exit-left')
        .forEach(c => c.classList.remove('exit-left'));
    }, 300);

    _wizCur = n;
    _wizUpdateProgress(n);
    setTimeout(() => nextCard.scrollTop = 0, 10);
  }

  function _wizUpdateProgress(n) {
    const pcts = { 1: 20, 'tuto': 20, 3: 40, 4: 70, 5: 100 };
    const el = g('exportProgFill');
    if (el) el.style.width = (pcts[n] || 20) + '%';

    const dotMap = { 1: 1, 'tuto': 1, 3: 2, 4: 3, 5: 4 };
    const active = dotMap[n] || 1;
    for (let i = 1; i <= 4; i++) {
      const d = g('ewd' + i);
      if (!d) continue;
      d.className = 'wiz-dot' + (i < active ? ' done' : i === active ? ' on' : '');
    }
    const lbls = { 1: 'Mode', 'tuto': 'Mode', 3: 'Instructions', 4: 'Interprétation', 5: 'Aperçu' };
    const txt = g('exportStepTxt');
    if (txt) txt.textContent = lbls[n] || '';
  }

  // ── ÉTAPE 1 : Choix du mode ──
  function exportDirect() {
    close();
    UI.exportCSV(_exportType);
  }

  function startAI() {
    const tutoSeen = localStorage.getItem('dcant_export_tuto_seen');
    if (!tutoSeen) {
      wizGo('tuto');
    } else {
      wizGo(3);
    }
  }

  // ── ÉTAPE 2 : Tuto ──
  function dismissTuto() {
    localStorage.setItem('dcant_export_tuto_seen', '1');
    clearInterval(_wizExInterval);
    wizGo(3);
  }

  function _startTutoCarousel() {
    clearInterval(_wizExInterval);
    const slides = document.querySelectorAll('#exportTutoCarousel .wiz-tuto-slide');
    if (!slides.length) return;
    let cur = 0;
    _wizExInterval = setInterval(() => {
      slides[cur].classList.remove('active');
      cur = (cur + 1) % slides.length;
      slides[cur].classList.add('active');
    }, 2200);
  }

  // ── ÉTAPE 3 : Instructions ──
  function _startPlaceholderRotation() {
    clearInterval(_wizExInterval);
    const ta = g('exportInstrInput');
    if (!ta) return;
    const examples = [
      'Une carte des vins triée par appellation',
      'Un tarif pro en PDF avec les prix HT',
      'Un visuel pour Instagram avec mes 5 meilleurs vins',
      'Un tableau avec domaine, cuvée, prix TTC',
      'Une fiche dégustation pour chaque vin'
    ];
    let i = 0;
    ta.placeholder = examples[0];
    _wizExInterval = setInterval(() => {
      if (ta.value) { clearInterval(_wizExInterval); return; }
      i = (i + 1) % examples.length;
      ta.placeholder = examples[i];
    }, 2800);
  }

  function chatAutosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }

  function toggleRecording() {
    if (ExportVoice.isRecording()) ExportVoice.stop();
    else ExportVoice.start();
  }

  function attachDocument() {
    g('exportAttachInput').click();
  }

  function handleAttachFile(input) {
    const file = input.files[0];
    if (!file) return;
    _attachedFile = file;
    const status = g('exportAttachStatus');
    if (status) {
      status.style.display = 'block';
      status.innerHTML = '<span style="margin-right:6px">📎</span>' + _esc(file.name);
    }
  }

  async function sendInstruction() {
    if (ExportVoice.isRecording()) {
      ExportVoice.stop();
      await new Promise(r => setTimeout(r, 600));
    }
    const ta = g('exportInstrInput');
    if (!ta) return;
    const text = ta.value.trim();
    if (!text) { toast('Décrivez ce que vous voulez exporter.'); return; }

    _instruction = text;
    const spinner = g('exportInstrSpinner');
    const sendBtn = g('exportInstrBtn');
    if (sendBtn) sendBtn.disabled = true;
    if (spinner) spinner.style.display = 'flex';

    try {
      const sample = _exportRows.slice(0, 5).map(r =>
        `${r.domaine} / ${r.cuvee || ''} / ${r.appellation || ''} / ${r.millesime || ''} / PA:${r.prix_achat}€ / PVHT:${r.pvht}€ / TTC:${r.pvttc}€ / Marge:${r.marge_euros}€ (${r.marge_pct}%) / Coeff:${r.coeff}`
      ).join('\n');

      const userContent = [];

      if (_attachedFile) {
        const isPdf = _attachedFile.type === 'application/pdf' || _attachedFile.name.endsWith('.pdf');
        if (isPdf) {
          const base64 = await _fileToBase64(_attachedFile);
          userContent.push({
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          });
        } else {
          const content = await _attachedFile.text();
          userContent.push({ type: 'text', text: 'Document de référence :\n' + content.slice(0, 2000) });
        }
      }

      const instrText = _attachedFile
        ? 'Instructions : "' + text + '"\nUn document de référence est joint (structure à reproduire).'
        : 'Instructions : "' + text + '"';
      userContent.push({ type: 'text', text: instrText });

      const systemPrompt = 'Tu es un assistant export pour un outil de calcul de marge vin.\n' +
        'L\'utilisateur a ' + _exportRows.length + ' vins dans son historique avec ces champs : domaine, cuvee, appellation, millesime, prix_achat, pvht, pvttc, marge_euros, marge_pct, coeff, commentaire.\n\n' +
        'Exemples de ses données :\n' + sample + '\n\n' +
        'Réponds UNIQUEMENT en JSON valide, sans texte autour, sans markdown :\n' +
        '{"filtre":"description du filtre ou tous","tri":"critère de tri ou aucun","mise_en_page":"type de document (tableau, carte des vins, tarif, visuel...)","colonnes":["col1","col2"],"contenu_genere":"descriptions ou titres générés, ou null","resume":"phrase résumant ce qui sera fait"}\n\n' +
        'N\'invente JAMAIS de données vin. Utilise uniquement les données fournies.';

      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }]
        })
      });

      if (!response.ok) throw new Error('API ' + response.status);
      const data = await response.json();
      const raw = data.content[0].text.trim()
        .replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      _interpretation = JSON.parse(raw);

      _renderInterpretation();
      wizGo(4);

      // Fire-and-forget AI naming
      _generateExportName();

    } catch (e) {
      console.error('Export instruction error:', e);
      toast('Erreur : ' + (e.message || 'Réessayez.'));
    }

    if (spinner) spinner.style.display = 'none';
    if (sendBtn) sendBtn.disabled = false;
  }

  function _fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }

  // ── ÉTAPE 4 : Interprétation + choix format ──
  function _renderInterpretation() {
    const bubble = g('exportConfirmBubble');
    const rules = g('exportConfirmRules');
    if (!bubble || !rules || !_interpretation) return;

    const items = [
      { k: 'Sélection', v: _interpretation.filtre || 'tous' },
      { k: 'Tri', v: _interpretation.tri || 'aucun' },
      { k: 'Mise en page', v: _interpretation.mise_en_page || 'tableau' },
      { k: 'Colonnes', v: (_interpretation.colonnes || []).join(', ') || '-' }
    ];
    if (_interpretation.contenu_genere) {
      items.push({ k: 'Contenu', v: _interpretation.contenu_genere });
    }

    rules.innerHTML = items.map(item =>
      '<div class="wiz-confirm-rule">' +
        '<span class="wiz-confirm-num">' + _esc(item.k) + '</span>' +
        '<span>' + _esc(item.v) + '</span>' +
      '</div>'
    ).join('');

    const resume = g('exportResume');
    if (resume) resume.textContent = _interpretation.resume || '';

    bubble.style.display = 'block';
  }

  function selectFormat(fmt) {
    _selectedFormat = fmt;
    _selectFormatPill(fmt);
  }

  function _selectFormatPill(fmt) {
    _selectedFormat = fmt;
    document.querySelectorAll('.export-fmt-pill').forEach(p =>
      p.classList.toggle('active', p.dataset.fmt === fmt));
  }

  function editInstruction() {
    const ta = g('exportInstrInput');
    if (ta) ta.value = _instruction;
    wizGo(3);
  }

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
        wizGo(5);
      }
    } catch (e) {
      console.error('Generate error:', e);
      toast('Erreur de génération. Export CSV en fallback.');
      _generateCSVFallback();
    }

    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }

  async function _generateCSV() {
    const dataLines = _exportRows.map(r =>
      r.domaine + '|' + (r.cuvee || '') + '|' + (r.appellation || '') + '|' + (r.millesime || '') +
      '|PA:' + r.prix_achat + '|PVHT:' + r.pvht + '|TTC:' + r.pvttc +
      '|Marge:' + r.marge_euros + '|Coeff:' + r.coeff + '|' + (r.commentaire || '')
    ).join('\n');

    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{ role: 'user', content:
          'Génère un fichier CSV avec ces colonnes exactes : ' + (_interpretation.colonnes || []).join(', ') + '\n' +
          'Séparateur : ";"\n' +
          'Tri : ' + (_interpretation.tri || 'aucun') + '\n' +
          'Filtre : ' + (_interpretation.filtre || 'tous') + '\n' +
          'Données (' + _exportRows.length + ' lignes) :\n' + dataLines + '\n' +
          'Retourne UNIQUEMENT le CSV, avec ligne d\'en-tête, rien d\'autre. N\'invente aucune donnée.'
        }]
      })
    });
    if (!response.ok) throw new Error('API ' + response.status);
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

    const systemPrompt = 'Tu génères du HTML pour un export de données vin. Le HTML sera rendu dans un conteneur de 800px de large.\n' +
      'Utilise du CSS inline pour le style. Le design doit être élégant et professionnel.\n' +
      'Utilise ces CSS variables pour les couleurs et polices :\n' +
      '- var(--export-bg) pour le fond\n' +
      '- var(--export-text) pour le texte\n' +
      '- var(--export-accent) pour les accents (titres, bordures)\n' +
      '- var(--export-font-display) pour les titres\n' +
      '- var(--export-font-body) pour le corps de texte\n\n' +
      'IMPORTANT : N\'invente JAMAIS de données vin. Utilise UNIQUEMENT les données JSON fournies ci-dessous.\n' +
      'Retourne UNIQUEMENT le HTML, sans balises ```, sans doctype, juste le contenu.';

    const userPrompt = 'Mise en page : ' + (_interpretation.mise_en_page || 'tableau') + '\n' +
      'Colonnes : ' + ((_interpretation.colonnes || []).join(', ') || 'toutes') + '\n' +
      'Tri : ' + (_interpretation.tri || 'aucun') + '\n' +
      'Filtre : ' + (_interpretation.filtre || 'tous') + '\n' +
      (_interpretation.contenu_genere ? 'Contenu additionnel : ' + _interpretation.contenu_genere + '\n' : '') +
      'Données (' + _exportRows.length + ' vins) :\n' + dataJson;

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
    if (!response.ok) throw new Error('API ' + response.status);
    const data = await response.json();
    _generatedHTML = data.content[0].text.trim()
      .replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim();

    _renderPreview();
  }

  // ── ÉTAPE 5 : Aperçu + personnalisation ──
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

      // Save to history after successful download
      _saveToHistory();
    } catch (e) {
      console.error('Download error:', e);
      toast('Erreur : ' + e.message);
    }
  }

  // ── REFINEMENT (Chat Card 5) ──
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
      if (!response.ok) throw new Error('API ' + response.status);
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

  // ── AI NAMING ──
  async function _generateExportName() {
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 50,
          messages: [{ role: 'user', content: 'Donne un nom court (3-5 mots, français) pour cet export vin. Instruction : "' + _instruction + '". Format : ' + _selectedFormat + '. Réponds UNIQUEMENT avec le nom, sans guillemets, sans ponctuation.' }]
        })
      });
      if (!response.ok) throw new Error('API');
      const data = await response.json();
      _exportName = (data.content[0].text || '').trim().slice(0, 60);
    } catch (e) {
      _exportName = 'Export ' + new Date().toLocaleDateString('fr-FR');
    }
  }

  // ── SAVE TO HISTORY ──
  async function _saveToHistory() {
    if (!App.user) return;
    try {
      await Storage.saveExportHistory(App.user.id, {
        name: _exportName || 'Export ' + new Date().toLocaleDateString('fr-FR'),
        instruction: _instruction,
        interpretation: _interpretation,
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

    _instruction = item.instruction || '';
    _interpretation = item.interpretation || null;
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
      wizGo(5);
    } else if (_interpretation) {
      _renderInterpretation();
      wizGo(4);
    } else {
      const ta = g('exportInstrInput');
      if (ta) ta.value = _instruction;
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
    exportDirect, startAI,
    dismissTuto,
    chatAutosize, toggleRecording, attachDocument, handleAttachFile, sendInstruction,
    selectFormat, editInstruction, generate,
    updateCustom, selectFontPair, download,
    sendRefinement,
    openHistory, closeHistory, reuseHistory, deleteHistory,
    wizGo
  };

})();
