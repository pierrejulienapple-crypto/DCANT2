// ═══════════════════════════════════════════
// DCANT — Feedback inline contextuel
// Q1-Q3 : inline sous les résultats de calcul
// Q4 : bannière en haut de l'historique
// Q5 : bannière après export
// ═══════════════════════════════════════════

const Feedback = (() => {

  const TOTAL = 6;

  const SHEETS = {
    1: {
      q: "Ce type d'outil vous serait-il utile au quotidien ?",
      opts: [
        { label: "Oui, régulièrement", val: "oui" },
        { label: "Peut-être",          val: "peut-être" },
        { label: "Non",                val: "non" }
      ],
      hasOther: false
    },
    2: {
      q: "Vous êtes...",
      opts: [
        { label: "Caviste",           val: "caviste" },
        { label: "Bar à vins",        val: "bar_vins" },
        { label: "Restaurant",        val: "restaurant" },
        { label: "Agent / courtier",  val: "agent" },
        { label: "Autre",             val: "autre" }
      ],
      hasOther: true
    },
    3: {
      q: "Combien de références gérez-vous ?",
      opts: [
        { label: "< 50",       val: "moins_50" },
        { label: "50 – 200",   val: "50_200" },
        { label: "> 200",      val: "plus_200" }
      ],
      hasOther: false
    },
    4: {
      q: "L'historique vous est-il utile ?",
      opts: [
        { label: "Oui",       val: "oui" },
        { label: "Parfois",   val: "parfois" },
        { label: "Pas vraiment", val: "non" }
      ],
      hasOther: false
    },
    5: {
      q: "L'export vous est-il utile ?",
      opts: [
        { label: "Oui",               val: "oui" },
        { label: "Testé une fois",     val: "once" },
        { label: "Pas encore essayé",  val: "non" }
      ],
      hasOther: false
    },
    6: {
      q: "L'import de documents vous est-il utile ?",
      opts: [
        { label: "Oui, très utile",   val: "oui" },
        { label: "Pratique parfois",   val: "parfois" },
        { label: "Pas vraiment",       val: "non" }
      ],
      hasOther: false
    }
  };

  // ── Render une question inline dans un conteneur ──

  function _render(n, container, isBanner) {
    const sh = SHEETS[n];
    if (!sh) return;

    const cls = isBanner ? 'fb-banner' : 'fb-inline';
    const div = document.createElement('div');
    div.className = cls;
    div.dataset.fbN = n;

    let html = '<div class="fb-q">' + _esc(sh.q) + '</div>';
    html += '<div class="fb-opts">';
    sh.opts.forEach(opt => {
      html += '<button class="fb-opt" data-val="' + _esc(opt.val) + '">' + _esc(opt.label) + '</button>';
    });
    html += '</div>';

    if (sh.hasOther) {
      html += '<input class="fb-other" type="text" placeholder="Si autre, précisez..." style="display:none">';
    }

    div.innerHTML = html;

    // Event : clic sur une pill
    div.querySelectorAll('.fb-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        // Highlight la pill sélectionnée
        div.querySelectorAll('.fb-opt').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        const val = btn.dataset.val;

        // Si "Autre" → montrer l'input texte
        if (sh.hasOther && val === 'autre') {
          const inp = div.querySelector('.fb-other');
          if (inp) { inp.style.display = 'block'; inp.focus(); }
          return; // on attend qu'il valide via Enter
        }

        _onAnswer(n, val, '', container, isBanner);
      });
    });

    // Event : Enter dans le champ "autre"
    if (sh.hasOther) {
      const otherInput = div.querySelector('.fb-other');
      if (otherInput) {
        otherInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            _onAnswer(n, 'autre', otherInput.value.trim(), container, isBanner);
          }
        });
      }
    }

    container.innerHTML = '';
    container.appendChild(div);
  }

  // ── Quand une réponse est cliquée ──

  async function _onAnswer(n, val, comment, container, isBanner) {
    const uid = App.user ? App.user.id : null;

    await Storage.saveFeedback(uid, n, val, comment);
    Storage.Local.setFeedbackDone(n);
    track('feedback_q' + n, { reponse: val });

    // Message "Merci !"
    const fbDiv = container.querySelector('[data-fb-n="' + n + '"]');
    if (fbDiv) {
      fbDiv.innerHTML = '<div class="fb-done">Merci !</div>';
    }

    // Enchaînement Q1 → Q2 → Q3
    if (n === 1 && (val === 'oui' || val === 'peut-être')) {
      setTimeout(() => _showNext(2, container, isBanner), 1200);
    } else if (n === 2) {
      setTimeout(() => _showNext(3, container, isBanner), 1200);
    } else {
      // Q1=non, Q3, Q4, Q5 : fade out
      setTimeout(() => {
        container.innerHTML = '';
      }, 1500);
    }
  }

  async function _showNext(n, container, isBanner) {
    if (Storage.Local.feedbackDone(n)) { container.innerHTML = ''; return; }
    const uid = App.user ? App.user.id : null;
    if (uid) {
      const done = await Storage.feedbackDoneRemote(n, uid);
      if (done) { container.innerHTML = ''; return; }
    }
    _render(n, container, isBanner);
  }

  // ── API publique ──

  async function showInline(n, containerId) {
    if (Storage.Local.feedbackDone(n)) return;
    const uid = App.user ? App.user.id : null;
    if (uid) {
      const done = await Storage.feedbackDoneRemote(n, uid);
      if (done) return;
    }

    const container = g(containerId);
    if (!container) return;
    _render(n, container, false);
  }

  async function showBanner(n, containerId) {
    if (Storage.Local.feedbackDone(n)) return;
    const uid = App.user ? App.user.id : null;
    if (uid) {
      const done = await Storage.feedbackDoneRemote(n, uid);
      if (done) return;
    }

    const container = g(containerId);
    if (!container) return;

    // Insère la bannière en premier enfant
    const wrapper = document.createElement('div');
    wrapper.id = 'fbBanner' + n;
    container.insertBefore(wrapper, container.firstChild);
    _render(n, wrapper, true);
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  return { showInline, showBanner };

})();
