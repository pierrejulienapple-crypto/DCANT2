// ═══════════════════════════════════════════
// DCANT — Configuration
// ═══════════════════════════════════════════

const DCANT_CONFIG = {
  version: '2.0.0',
  supabase: {
    url: 'https://cwpmlsmgckxooqtbwbpd.supabase.co',
    key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3cG1sc21nY2t4b29xdGJ3YnBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MDM4NjgsImV4cCI6MjA4ODI3OTg2OH0.h0Rcfc5ISk7MRYzcS9YL6Uy-8sdJxvYpTnpCZheGZFs'
  },
  anthropic: {
    key: ''  // chargée dynamiquement depuis /api/anthropic-key
  },
  clarity: {
    id: 'vm9i4i92ay'
  },
  googleSheet: {
    url: 'https://script.google.com/macros/s/AKfycbzmge3fK3THkK-Ib4OSKnTNSNgcagjX9mXbsw-kAh2QRUv8k0AtVwL9lhG4D-llW3gHUA/exec'
  },
  tva: 0.20
};

// Charge la clé Anthropic au démarrage
(async () => {
  try {
    const r = await fetch('/api/anthropic-key');
    const d = await r.json();
    if (d.key) DCANT_CONFIG.anthropic.key = d.key;
  } catch(e) {
    console.error('Clé Anthropic non chargée:', e);
  }
})();
