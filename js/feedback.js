// ═══════════════════════════════════════════
// DCANT — Questionnaire feedback
// Flow : Q1 → si oui/peut-être → Q2 → Q3 → Q4 → Q5
// ═══════════════════════════════════════════

const Feedback = (() => {

  let _currentN = 0;
  let _q1Answer = null;

  const TOTAL = 5;

  const SHEETS = {
    1: {
      q: "Ce type d'outil vous serait-il utile au quotidien ?",
      opts: [
        { label: "Oui, je l'utiliserais régulièrement", val: "oui" },
        { label: "Peut-être selon les situations",       val: "peut-être" },
        { label: "Non, ce n'est pas pour moi",           val: "non" }
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
        { label: "Moins de 50 références",       val: "moins_50" },
        { label: "Entre 50 et 200 références",   val: "50_200" },
        { label: "Plus de 200 références",       val: "plus_200" }
      ],
      hasOther: false
    },
    4: {
      q: "L'historique vous est-il utile ?",
      opts: [
        { label: "Oui, je le consulte régulièrement",  val: "oui" },
        { label: "Parfois",                             val: "parfois" },
        { label: "Pas vraiment",                        val: "non" }
      ],
      hasOther: false
    },
    5: {
      q: "L'export vous est-il utile ?",
      opts: [
        { label: "Oui, je l'utilise souvent",    val: "oui" },
        { label: "Je l'ai testé une fois",        val: "once" },
        { label: "Pas encore essayé",             val: "non" }
      ],
      hasOther: false
    }
  };

  async function open(n) {
    // Q1 → localStorage uniquement (par appareil)
    if (n === 1) {
      if (Storage.Local.feedbackDone(1)) return;
    } else {
      // Q2-Q5 → vérifie Supabase (par compte)
      const uid = App.user ? App.user.id : null;
      const done = await Storage.feedbackDoneRemote(n, uid);
      if (done) return;
      // Aussi vérifie localStorage au cas où
      if (Storage.Local.feedbackDone(n)) return;
    }

    const sh = SHEETS[n];
    if (!sh) return;
    _currentN = n;

    s('sheetCounter', n + ' / ' + TOTAL);

    const alreadyBtn = g('sheetAlready');
    if (alreadyBtn) alreadyBtn.style.display = n === 1 ? 'block' : 'none';

    g('sheetAlreadyMsg').style.display = 'none';

    s('sheetQ', sh.q);

    g('sheetOpts').innerHTML = sh.opts.map(opt =>
      `<label class="sheet-opt">
        <input type="radio" name="sfb" value="${opt.val}"> ${opt.label}
      </label>`
    ).join('');

    const commentEl = g('sheetComment');
    commentEl.placeholder = sh.hasOther ? 'Si autre, précisez...' : 'Commentaire libre (optionnel)';
    commentEl.style.display = 'block';
    commentEl.value = '';

    g('sheetSent').style.display = 'none';
    g('sheet').querySelectorAll('.sheet-opts,.sheet-comment,.sheet-foot')
      .forEach(el => el.style.removeProperty('display'));

    g('sheetBg').classList.add('open');
    setTimeout(() => g('sheet').classList.add('open'), 10);
  }

  function alreadyAnswered() {
    g('sheet').querySelectorAll('.sheet-opts,.sheet-comment,.sheet-foot,.sheet-q')
      .forEach(el => el.style.display = 'none');
    g('sheetAlready').style.display = 'none';
    g('sheetAlreadyMsg').style.display = 'block';
  }

  function close() {
    g('sheet').classList.remove('open');
    setTimeout(() => g('sheetBg').classList.remove('open'), 300);
  }

  function _next(current) {
    setTimeout(() => {
      close();
      setTimeout(() => open(current + 1), 600);
    }, 1800);
  }

  async function submit() {
    let ans = '';
    document.querySelectorAll('input[name="sfb"]').forEach(r => {
      if (r.checked) ans = r.value;
    });
    if (!ans) { toast('Choisissez une réponse.'); return; }

    const comment = g('sheetComment').value.trim() || '';
    const uid = App.user ? App.user.id : null;

    await Storage.saveFeedback(uid, _currentN, ans, comment);
    Storage.Local.setFeedbackDone(_currentN);
    track('feedback_q' + _currentN, { reponse: ans });

    g('sheet').querySelectorAll('.sheet-opts,.sheet-comment,.sheet-foot')
      .forEach(el => el.style.display = 'none');
    g('sheetSent').style.display = 'block';

    if (_currentN === 1) {
      _q1Answer = ans;
      if (ans === 'non') {
        setTimeout(close, 1800);
      } else {
        _next(1);
      }
    } else if (_currentN < TOTAL) {
      _next(_currentN);
    } else {
      setTimeout(close, 1800);
    }
  }

  function showForm() {
    // Réaffiche le formulaire depuis le message "déjà répondu"
    g('sheetAlreadyMsg').style.display = 'none';
    const sh = SHEETS[_currentN];
    if (!sh) return;
    g('sheetAlready').style.display = 'none';
    g('sheet').querySelectorAll('.sheet-opts,.sheet-comment,.sheet-foot,.sheet-q')
      .forEach(el => el.style.removeProperty('display'));
  }

  return { open, close, submit, alreadyAnswered, showForm };

})();

