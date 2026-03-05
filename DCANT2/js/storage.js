// ═══════════════════════════════════════════
// DCANT — Stockage
// Toutes les interactions avec Supabase
// Remplace l'ancien localStorage pour les données utilisateur
// ═══════════════════════════════════════════

const Storage = (() => {

  // ── HISTORIQUE ──

  async function getHistorique(userEmail) {
    try {
      const { data, error } = await window.supabase
        .from('historique')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Storage.getHistorique:', e);
      return [];
    }
  }

  async function saveCalcul(userEmail, entry) {
    try {
      // Normalise le domaine : première lettre majuscule, reste en minuscule
      // pour éviter les doublons type "sergio genuardi" vs "Sergio Genuardi"
      const normaliseDomaine = (str) => {
        if (!str) return '';
        return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      };

      const { data, error } = await window.supabase
        .from('historique')
        .insert([{
          user_email: userEmail,
          domaine: normaliseDomaine(entry.domaine),
          cuvee: entry.cuvee || '',
          millesime: entry.millesime || '',
          commentaire: entry.commentaire || '',
          prix_achat: entry.prixAchat,
          charges: entry.charges,
          cout_revient: entry.cr,
          mode: entry.mode,
          mode_value: entry.modeValue,
          pvht: entry.pvht,
          marge_euros: entry.mE,
          marge_pct: entry.pct,
          coeff: entry.coeff,
          pvttc: entry.pvttc
        }])
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.warn('Storage.saveCalcul:', e);
      return { ok: false };
    }
  }

  async function updateCalcul(id, updates) {
    try {
      const { error } = await window.supabase
        .from('historique')
        .update({
          domaine: updates.domaine,
          cuvee: updates.cuvee,
          millesime: updates.millesime,
          commentaire: updates.commentaire,
          prix_achat: updates.prixAchat,
          charges: updates.charges,
          cout_revient: updates.cr,
          mode: updates.mode,
          mode_value: updates.modeValue,
          pvht: updates.pvht,
          marge_euros: updates.mE,
          marge_pct: updates.pct,
          coeff: updates.coeff,
          pvttc: updates.pvttc
        })
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('Storage.updateCalcul:', e);
      return { ok: false };
    }
  }

  async function deleteCalcul(id) {
    try {
      const { error } = await window.supabase
        .from('historique')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteCalcul:', e);
      return { ok: false };
    }
  }

  // ── MODÈLES DE MARGE ──

  async function getModeles(userEmail) {
    try {
      const { data, error } = await window.supabase
        .from('modeles')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Storage.getModeles:', e);
      return [];
    }
  }

  async function saveModele(userEmail, modele) {
    try {
      const { data, error } = await window.supabase
        .from('modeles')
        .insert([{
          user_email: userEmail,
          nom: modele.name,
          mode: modele.mode,
          mode_value: modele.modeValue,
          transport: modele.transport || 0,
          douane: modele.douane || 0,
          others: modele.others || []
        }])
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.warn('Storage.saveModele:', e);
      return { ok: false };
    }
  }

  async function deleteModele(id) {
    try {
      const { error } = await window.supabase
        .from('modeles')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteModele:', e);
      return { ok: false };
    }
  }

  // ── FEEDBACK ──

  async function saveFeedback(userEmail, questionN, reponse, commentaire) {
    try {
      const { error } = await window.supabase
        .from('feedback')
        .insert([{
          user_email: userEmail || 'anonyme',
          question: questionN,
          reponse,
          commentaire: commentaire || ''
        }]);
      if (error) throw error;

      // Envoi Google Sheet si configuré
      const gsUrl = DCANT_CONFIG.googleSheet.url;
      if (gsUrl && !gsUrl.includes('COLLER')) {
        try {
          fetch(gsUrl, {
            method: 'POST',
            body: JSON.stringify({ question: 'Q' + questionN, reponse, commentaire, email: userEmail })
          });
        } catch (e) {}
      }

      return { ok: true };
    } catch (e) {
      console.warn('Storage.saveFeedback:', e);
      return { ok: false };
    }
  }

  async function getFeedback() {
    try {
      const { data, error } = await window.supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      return [];
    }
  }

  // ── PRÉFÉRENCES LOCALES (non sensibles) ──
  // Q1 reste en localStorage (par appareil)
  // Q2-Q5 vérifiés en Supabase (par compte)

  const Local = {
    cookiesAccepted: () => localStorage.getItem('dc_cookies') === '1',
    acceptCookies: () => localStorage.setItem('dc_cookies', '1'),
    feedbackDone: (n) => localStorage.getItem('dc_fbd_' + n) === '1',
    setFeedbackDone: (n) => localStorage.setItem('dc_fbd_' + n, '1')
  };

  // Vérifie si Q2-Q5 ont déjà été répondues dans Supabase (tous appareils)
  async function feedbackDoneRemote(n, userEmail) {
    if (!userEmail) return false;
    try {
      const { data } = await window.supabase
        .from('feedback')
        .select('id')
        .eq('user_email', userEmail)
        .eq('question', n)
        .limit(1);
      return data && data.length > 0;
    } catch (e) { return false; }
  }

  return {
    getHistorique, saveCalcul, updateCalcul, deleteCalcul,
    getModeles, saveModele, deleteModele,
    saveFeedback, getFeedback, feedbackDoneRemote,
    Local
  };

})();
