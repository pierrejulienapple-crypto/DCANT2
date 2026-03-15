// ═══════════════════════════════════════════
// DCANT — Stockage
// API propre (remplace le client Supabase)
// Même interface publique que l'ancienne version
// ═══════════════════════════════════════════

const Storage = (() => {

  function _url(path) {
    return DCANT_CONFIG.apiUrl + path;
  }

  async function _fetch(path, opts) {
    const resp = await fetch(_url(path), {
      headers: authHeaders(),
      ...opts
    });
    return resp;
  }

  // ── HISTORIQUE (table: calculs) ──

  async function getHistorique(userId, offset = 0, limit = 50) {
    try {
      const resp = await _fetch(`/api/calculs?offset=${offset}&limit=${limit}`);
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.getHistorique:', e);
      return { data: [], hasMore: false };
    }
  }

  async function saveCalcul(userId, entry) {
    try {
      const resp = await _fetch('/api/calculs', {
        method: 'POST',
        body: JSON.stringify(entry)
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.error('Storage.saveCalcul ERREUR:', e?.message || e);
      return { ok: false, error: e?.message || String(e) };
    }
  }

  async function updateCalcul(id, updates) {
    try {
      const resp = await _fetch('/api/calculs/' + id, {
        method: 'PUT',
        body: JSON.stringify(updates)
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return { ok: true };
    } catch (e) {
      console.warn('Storage.updateCalcul:', e);
      return { ok: false };
    }
  }

  async function deleteCalcul(id) {
    try {
      const resp = await _fetch('/api/calculs/' + id, {
        method: 'DELETE'
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteCalcul:', e);
      return { ok: false };
    }
  }

  // ── MODÈLES DE MARGE ──

  async function getModeles(userId) {
    try {
      const resp = await _fetch('/api/modeles');
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.getModeles:', e);
      return [];
    }
  }

  async function saveModele(userId, modele) {
    try {
      const resp = await _fetch('/api/modeles', {
        method: 'POST',
        body: JSON.stringify(modele)
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.saveModele:', e);
      return { ok: false };
    }
  }

  async function deleteModele(id) {
    try {
      const resp = await _fetch('/api/modeles/' + id, {
        method: 'DELETE'
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteModele:', e);
      return { ok: false };
    }
  }

  // ── FEEDBACK ──

  async function saveFeedback(userId, questionN, reponse, commentaire) {
    try {
      const resp = await _fetch('/api/feedback', {
        method: 'POST',
        body: JSON.stringify({ question: questionN, reponse, commentaire: commentaire || '' })
      });
      if (!resp.ok) throw new Error(resp.statusText);

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
      const resp = await _fetch('/api/feedback');
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      return [];
    }
  }

  // ── PRÉFÉRENCES LOCALES (non sensibles) ──

  const Local = {
    cookiesAccepted: () => localStorage.getItem('dcant_cookies') === 'accepted',
    feedbackDone: (n) => localStorage.getItem('dc_fbd_' + n) === '1',
    setFeedbackDone: (n) => localStorage.setItem('dc_fbd_' + n, '1')
  };

  async function feedbackDoneRemote(n, userId) {
    if (!userId) return false;
    try {
      const resp = await _fetch('/api/feedback/done/' + n);
      if (!resp.ok) return false;
      const data = await resp.json();
      return data.done;
    } catch (e) { return false; }
  }

  // ── EXPORT HISTORY ──

  async function getExportHistory(userId) {
    try {
      const resp = await _fetch('/api/exports');
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.getExportHistory:', e);
      return [];
    }
  }

  async function saveExportHistory(userId, entry) {
    try {
      const resp = await _fetch('/api/exports', {
        method: 'POST',
        body: JSON.stringify(entry)
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.saveExportHistory:', e);
      return { ok: false };
    }
  }

  async function deleteExportHistory(id) {
    try {
      const resp = await _fetch('/api/exports/' + id, {
        method: 'DELETE'
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteExportHistory:', e);
      return { ok: false };
    }
  }

  async function deleteExportHistoryBatch(ids) {
    try {
      const resp = await _fetch('/api/exports/batch', {
        method: 'DELETE',
        body: JSON.stringify({ ids })
      });
      if (!resp.ok) throw new Error(resp.statusText);
      return { ok: true };
    } catch (e) {
      console.warn('Storage.deleteExportHistoryBatch:', e);
      return { ok: false };
    }
  }

  // ── BENCHMARK ──

  async function getBenchmark(appellation, millesime) {
    try {
      const resp = await _fetch(
        '/api/benchmark?appellation=' + encodeURIComponent(appellation) +
        '&millesime=' + encodeURIComponent(millesime)
      );
      if (!resp.ok) throw new Error(resp.statusText);
      return await resp.json();
    } catch (e) {
      console.warn('Storage.getBenchmark:', e);
      return null;
    }
  }

  async function getBenchmarkBatch(pairs) {
    try {
      const unique = [...new Map(pairs.map(p => [p.appellation + '|' + p.millesime, p])).values()];
      const results = new Map();
      await Promise.all(unique.map(async (p) => {
        const d = await getBenchmark(p.appellation, p.millesime);
        if (d) results.set(p.appellation + '|' + p.millesime, d);
      }));
      return results;
    } catch (e) {
      console.warn('Storage.getBenchmarkBatch:', e);
      return new Map();
    }
  }

  return {
    getHistorique, saveCalcul, updateCalcul, deleteCalcul,
    getModeles, saveModele, deleteModele,
    saveFeedback, getFeedback, feedbackDoneRemote,
    getExportHistory, saveExportHistory, deleteExportHistory, deleteExportHistoryBatch,
    getBenchmark, getBenchmarkBatch,
    Local
  };

})();
