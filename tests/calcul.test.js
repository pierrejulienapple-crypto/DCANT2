// ═══════════════════════════════════════════
// Tests unitaires — Calcul.js
// Exécuter : npm test  (ou node tests/calcul.test.js)
// ═══════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ── Setup : charger calcul.js dans un contexte simulé ──

// DCANT_CONFIG est requis par Calcul
global.DCANT_CONFIG = { tva: 0.20 };

// Charge le fichier calcul.js (IIFE qui définit Calcul)
const calcSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'calcul.js'), 'utf-8');
eval(calcSrc);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ── calculer() ──

console.log('\n── Calcul.calculer() ──');

test('mode euros : marge fixe', () => {
  const r = Calcul.calculer(10, 5, 'euros');
  assert.strictEqual(r.pvht, 15);
  assert.strictEqual(r.mE, 5);
  assert.strictEqual(r.pvttc, 18);
  assert.strictEqual(r.coeff, 1.5);
});

test('mode pct : taux de marge 25%', () => {
  const r = Calcul.calculer(10, 25, 'pct');
  // pvht = 10 / (1 - 0.25) = 13.33
  assert.strictEqual(r.pvht, 13.33);
  assert.strictEqual(r.mE, 3.33);
  assert.strictEqual(r.pct, 25);
});

test('mode coeff : coefficient 2', () => {
  const r = Calcul.calculer(10, 2, 'coeff');
  assert.strictEqual(r.pvht, 20);
  assert.strictEqual(r.mE, 10);
  assert.strictEqual(r.coeff, 2);
  assert.strictEqual(r.pvttc, 24);
});

test('mode coeff : coefficient 2.5', () => {
  const r = Calcul.calculer(8, 2.5, 'coeff');
  assert.strictEqual(r.pvht, 20);
  assert.strictEqual(r.mE, 12);
  assert.strictEqual(r.pvttc, 24);
});

test('retourne null si cout de revient <= 0', () => {
  assert.strictEqual(Calcul.calculer(0, 5, 'euros'), null);
  assert.strictEqual(Calcul.calculer(-1, 5, 'euros'), null);
});

test('retourne null si modeValue <= 0', () => {
  assert.strictEqual(Calcul.calculer(10, 0, 'euros'), null);
  assert.strictEqual(Calcul.calculer(10, -5, 'pct'), null);
});

test('retourne null si mode invalide', () => {
  assert.strictEqual(Calcul.calculer(10, 5, 'invalid'), null);
});

test('retourne null si pct >= 100', () => {
  assert.strictEqual(Calcul.calculer(10, 100, 'pct'), null);
});

test('retourne null si coeff <= 1', () => {
  assert.strictEqual(Calcul.calculer(10, 1, 'coeff'), null);
  assert.strictEqual(Calcul.calculer(10, 0.5, 'coeff'), null);
});

test('TTC = HT * 1.20', () => {
  const r = Calcul.calculer(100, 50, 'euros');
  assert.strictEqual(r.pvht, 150);
  assert.strictEqual(r.pvttc, 180);
});

// ── calculerCR() ──

console.log('\n── Calcul.calculerCR() ──');

test('prix achat seul', () => {
  assert.strictEqual(Calcul.calculerCR(10, null), 10);
});

test('prix achat + transport + douane', () => {
  assert.strictEqual(Calcul.calculerCR(10, { transport: 2, douane: 1, others: [] }), 13);
});

test('prix achat + transport + douane + autres frais', () => {
  const cr = Calcul.calculerCR(10, {
    transport: 2,
    douane: 1,
    others: [{ label: 'Frais divers', val: 0.5 }, { label: 'Commission', val: 1.5 }]
  });
  assert.strictEqual(cr, 15);
});

test('valeurs invalides traitees comme 0', () => {
  assert.strictEqual(Calcul.calculerCR('abc', null), 0);
  assert.strictEqual(Calcul.calculerCR(10, { transport: 'abc', douane: null, others: [] }), 10);
});

// ── normaliserCharges() ──

console.log('\n── Calcul.normaliserCharges() ──');

test('normalise et calcule le total', () => {
  const r = Calcul.normaliserCharges({ transport: '3', douane: '1.5', others: [{ label: 'X', val: '2' }] });
  assert.strictEqual(r.transport, 3);
  assert.strictEqual(r.douane, 1.5);
  assert.strictEqual(r.others.length, 1);
  assert.strictEqual(r.total, 6.5);
});

test('filtre les autres frais a 0', () => {
  const r = Calcul.normaliserCharges({ transport: 0, douane: 0, others: [{ label: 'X', val: 0 }, { label: 'Y', val: 5 }] });
  assert.strictEqual(r.others.length, 1);
  assert.strictEqual(r.total, 5);
});

test('gere null/undefined', () => {
  const r = Calcul.normaliserCharges(null);
  assert.strictEqual(r.transport, 0);
  assert.strictEqual(r.douane, 0);
  assert.strictEqual(r.total, 0);
});

// ── formater() ──

console.log('\n── Calcul.formater() ──');

test('formate en francais', () => {
  const r = Calcul.formater(1234.5);
  // En fr-FR : "1 234,50" (espace insécable possible)
  assert.ok(r.includes('234'));
  assert.ok(r.includes('50'));
});

test('retourne — pour null/NaN', () => {
  assert.strictEqual(Calcul.formater(null), '—');
  assert.strictEqual(Calcul.formater(undefined), '—');
  assert.strictEqual(Calcul.formater(NaN), '—');
});

// ── genererCSV() ──

console.log('\n── Calcul.genererCSV() ──');

test('genere un CSV valide avec BOM', () => {
  const csv = Calcul.genererCSV([{
    created_at: '2024-01-15T10:00:00Z',
    domaine: 'Test Domaine',
    cuvee: 'Cuvée "Prestige"',
    millesime: '2020',
    prix_achat: 10,
    charges: { transport: 2, douane: 0 },
    cout_revient: 12,
    mode: 'coeff',
    mode_value: 2,
    pvht: 24,
    marge_euros: 12,
    marge_pct: 50,
    coeff: 2,
    pvttc: 28.8,
    commentaire: ''
  }]);
  assert.ok(csv.startsWith('\uFEFF')); // BOM UTF-8
  assert.ok(csv.includes('Test Domaine'));
  assert.ok(csv.includes('""Prestige""')); // guillemets escapés
  const lines = csv.split('\n');
  assert.strictEqual(lines.length, 2); // header + 1 row
});

test('CSV vide si aucune entree', () => {
  const csv = Calcul.genererCSV([]);
  const lines = csv.split('\n');
  assert.strictEqual(lines.length, 1); // header seulement
});

// ── Résumé ──

console.log(`\n══ Résultat : ${passed} passés, ${failed} échoués ══\n`);
process.exit(failed > 0 ? 1 : 0);
