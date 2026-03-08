// ═══════════════════════════════════════════
// DCANT — Stockage
// Toutes les interactions avec Supabase
// Remplace l'ancien localStorage pour les données utilisateur
// ═══════════════════════════════════════════

const Storage = (() => {

  // ── HISTORIQUE (table: calculs) ──

  async function getHistorique(userId, offset = 0, limit = 50) {
    try {
      const { data, error } = await window.supabase
        .from('calculs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return { data: data || [], hasMore: (data || []).length === limit };
    } catch (e) {
      console.warn('Storage.getHistorique:', e);
      return { data: [], hasMore: false };
    }
  }

  async function saveCalcul(userId, entry) {
    try {
      // Normalise le domaine : première lettre majuscule, reste en minuscule
      // pour éviter les doublons type "sergio genuardi" vs "Sergio Genuardi"
      const normaliseDomaine = (str) => {
        if (!str) return '';
        return str.trim().toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
      };

      const row = {
          user_id: userId,
          domaine: normaliseDomaine(entry.domaine),
          cuvee: entry.cuvee || '',
          appellation: entry.appellation || '',
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
      };
      // RGPD — champs optionnels (source d'import + consentement benchmark)
      if (entry.source) row.source = entry.source;
      if (entry.partage_benchmark !== undefined) row.partage_benchmark = !!entry.partage_benchmark;

      const { data, error } = await window.supabase
        .from('calculs')
        .insert([row])
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.error('Storage.saveCalcul ERREUR:', e?.message || e, e?.details || '', e?.hint || '');
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function updateCalcul(id, updates) {
    try {
      const { error } = await window.supabase
        .from('calculs')
        .update({
          domaine: updates.domaine,
          cuvee: updates.cuvee,
          appellation: updates.appellation,
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
        .from('calculs')
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

  async function getModeles(userId) {
    try {
      const { data, error } = await window.supabase
        .from('modeles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Storage.getModeles:', e);
      return [];
    }
  }

  async function saveModele(userId, modele) {
    try {
      const { data, error } = await window.supabase
        .from('modeles')
        .insert([{
          user_id: userId,
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

  async function saveFeedback(userId, questionN, reponse, commentaire) {
    try {
      const { error } = await window.supabase
        .from('feedback')
        .insert([{
          user_id: userId || null,
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
            body: JSON.stringify({ question: 'Q' + questionN, reponse, commentaire, user_id: userId })
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
    cookiesAccepted: () => localStorage.getItem('dcant_cookies') === 'accepted',
    feedbackDone: (n) => localStorage.getItem('dc_fbd_' + n) === '1',
    setFeedbackDone: (n) => localStorage.setItem('dc_fbd_' + n, '1')
  };

  // Vérifie si Q2-Q5 ont déjà été répondues dans Supabase (tous appareils)
  async function feedbackDoneRemote(n, userId) {
    if (!userId) return false;
    try {
      const { data } = await window.supabase
        .from('feedback')
        .select('id')
        .eq('user_id', userId)
        .eq('question', n)
        .limit(1);
      return data && data.length > 0;
    } catch (e) { return false; }
  }

  // ── EXPORT HISTORY ──

  async function getExportHistory(userId) {
    try {
      const { data, error } = await window.supabase
        .from('export_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('Storage.getExportHistory:', e);
      return [];
    }
  }

  async function saveExportHistory(userId, entry) {
    try {
      const { data, error } = await window.supabase
        .from('export_history')
        .insert([{
          user_id: userId,
          name: entry.name,
          instruction: entry.instruction,
          interpretation: entry.interpretation,
          selected_format: entry.selected_format,
          template_custom: entry.template_custom,
          generated_html: entry.generated_html
        }])
        .select()
        .single();
      if (error) throw error;
      return { ok: true, data };
    } catch (e) {
      console.warn('Storage.saveExportHistory:', e);
      return { ok: false };
    }
  }

  async function deleteExportHistory(id) {
    try {
      const { error } = await window.supabase
        .from('export_history')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteExportHistory:', e);
      return { ok: false };
    }
  }

  async function deleteExportHistoryBatch(ids) {
    try {
      const { error } = await window.supabase
        .from('export_history')
        .delete()
        .in('id', ids);
      if (error) throw error;
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteExportHistoryBatch:', e);
      return { ok: false };
    }
  }

  return {
    getHistorique, saveCalcul, updateCalcul, deleteCalcul,
    getModeles, saveModele, deleteModele,
    saveFeedback, getFeedback, feedbackDoneRemote,
    getExportHistory, saveExportHistory, deleteExportHistory, deleteExportHistoryBatch,
    Local
  };

})();
