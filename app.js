/* LC-MS ion explainer — everything (library lookup, cluster generation, formula
   generation, isotope interpretation) runs client-side, so a user's peak list
   never leaves their machine. No dependencies, no network calls after load.

   The identification model is the one specified in IDENTIFY_SPEC.md; the Python
   reference is scripts/identify.py and the two must agree. */
(() => {
'use strict';

const F = {}; // field name -> column index, filled once data loads
let ROWS = [], META = {}, LADDERS = [];
let MZ_ORDER = [], MZ_SORTED = null;   // row indices sorted by m/z, and their m/z
let REFTAB = [];                       // meta.refTable, absent in older bundles
let DATA_READY = false;   // never answer from an empty library

const $ = id => document.getElementById(id);
const el = (tag, cls, txt) => { const n = document.createElement(tag);
  if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };

/* ============================================================ chemistry core */
const ELECTRON = 0.000548579909;
const EL = {
  H: 1.00782503207, Li: 7.01600455, B: 11.0093054, C: 12.0, N: 14.0030740048,
  O: 15.9949146196, F: 18.99840322, Na: 22.9897692809, Al: 26.98153863,
  Si: 27.9769265325, P: 30.97376163, S: 31.972071, Cl: 34.96885268,
  K: 38.96370668, Ti: 47.9479463, Cr: 51.9405075, Fe: 55.9349375,
  Co: 58.933195, Cu: 62.9295975, Zn: 63.9291422, Br: 78.9183371, I: 126.904473
};
const NOM = {
  H: 1, Li: 7, B: 11, C: 12, N: 14, O: 16, F: 19, Na: 23, Al: 27, Si: 28,
  P: 31, S: 32, Cl: 35, K: 39, Ti: 48, Cr: 52, Fe: 56, Co: 59, Cu: 63,
  Zn: 64, Br: 79, I: 127
};
const PROTON = EL.H - ELECTRON;
const NA_H = EL.Na - EL.H;          // 21.981944 — the sodiated-partner spacing
const H_DEFECT = EL.H - 1;

/* Per-atom satellite intensities, as % of the element's OWN base-peak isotope.
   That frame matters: Fe, Cr, Ti, B and Li are not lightest-first, so a
   monoisotope-referenced table would put their intensity on the wrong side. */
const ISO = {
  C:  { a1: 1.0816, a2: 0.0 },      H:  { a1: 0.0115, a2: 0.0 },
  N:  { a1: 0.3693, a2: 0.0 },      O:  { a1: 0.0381, a2: 0.2055 },
  S:  { a1: 0.7893, a2: 4.4741 },   Si: { a1: 5.0778, a2: 3.3528 },
  Cl: { a1: 0.0, a2: 31.9614 },     Br: { a1: 0.0, a2: 97.2777 },
  K:  { a1: 0.0, a2: 7.2166 },      Cu: { a1: 0.0, a2: 44.7442 },
  Zn: { a1: 0.0, a2: 57.3703 },
  Cr: { a1: 11.339, a2: 2.822, bm2: 5.185 },
  Fe: { a1: 2.310, a2: 0.307, bm2: 6.371 },
  Ti: { a1: 7.339, a2: 7.027, bm1: 10.092, bm2: 11.191 },
  B:  { a1: 0.0, a2: 0.0, bm1: 24.844 },
  Li: { a1: 0.0, a2: 0.0, bm1: 8.213 },
  P:  { a1: 0.0, a2: 0.0 }, F: { a1: 0.0, a2: 0.0 }, Na: { a1: 0.0, a2: 0.0 },
  I:  { a1: 0.0, a2: 0.0 }, Al: { a1: 0.0, a2: 0.0 }, Co: { a1: 0.0, a2: 0.0 }
};

/* A+1 is not only 13C. Each offset is a different element and at <5 ppm they
   are resolvable, which is what stops a silicon compound reading as C33. */
const A1_OFFSETS = [
  { el: 'C',  iso: '¹³C',  off: 1.0033548, per: 1.0816, kind: 'organic' },
  { el: 'Si', iso: '²⁹Si', off: 0.9995682, per: 5.0778, kind: 'hetero' },
  { el: 'S',  iso: '³³S',  off: 0.9993878, per: 0.7893, kind: 'hetero' },
  { el: 'Cr', iso: '⁵³Cr', off: 1.0001419, per: 11.339, kind: 'metal',
    pair: { iso: '⁵⁰Cr', off: -1.9944633, per: 5.185 } },
  { el: 'Fe', iso: '⁵⁷Fe', off: 1.0004565, per: 2.310, kind: 'metal',
    pair: { iso: '⁵⁴Fe', off: -1.9953270, per: 6.371 } },
  { el: 'Ti', iso: '⁴⁹Ti', off: 0.9999237, per: 7.339, kind: 'metal',
    pair: { iso: '⁴⁷Ti', off: -0.9961832, per: 10.092 } }
];
const A2_OFFSETS = [
  { el: 'S',  iso: '³⁴S',  off: 1.9957959, per: 4.4741 },
  { el: 'Cl', iso: '³⁷Cl', off: 1.9970499, per: 31.9614 },
  { el: 'Si', iso: '³⁰Si', off: 1.9968437, per: 3.3528 },
  { el: 'Ti', iso: '⁵⁰Ti', off: 1.9968449, per: 7.027 },
  { el: 'Br', iso: '⁸¹Br', off: 1.9979535, per: 97.2777 },
  { el: 'K',  iso: '⁴¹K',  off: 1.9981191, per: 7.2166 },
  { el: 'C2', iso: 'two ¹³C', off: 2.0067097, per: null }
];
const BELOW_OFFSETS = [
  { el: 'Fe', iso: '⁵⁴Fe', off: -1.9953270, per: 6.371 },
  { el: 'Cr', iso: '⁵⁰Cr', off: -1.9944633, per: 5.185 },
  { el: 'Ti', iso: '⁴⁶Ti', off: -1.9953147, per: 11.191 },
  { el: 'Ti', iso: '⁴⁷Ti', off: -0.9961832, per: 10.092 },
  { el: 'B',  iso: '¹⁰B',  off: -0.9963684, per: 24.844 },
  { el: 'Li', iso: '⁶Li',       off: -1.0008818, per: 8.213 }
];
// metals separated by the satellite PAIR, never one alone
const METAL_PAIRS = {
  Cr: 'A+1 11.3% with 5.2% two below',
  Fe: 'A+1 2.3% with 6.4% two below',
  Ti: 'intensity on both sides — 10.1% and 11.2% below, 7.3% and 7.0% above',
  Co: 'monoisotopic — a cobalt species shows no satellite at all',
  Al: 'monoisotopic — an aluminium species shows no satellite at all'
};
const C13 = 1.0033548;

/* -------------------------------------------------- formula-generation rules */
const RDBE_V = { C: 4, H: 1, N: 3, O: 2, S: 2, P: 3, Na: 1, K: 1, Cl: 1, F: 1,
  Br: 1, I: 1, Si: 4, Fe: 2, Cu: 1, Zn: 2, Cr: 2, Ti: 2, B: 3, Li: 1, Al: 3, Co: 2 };
const MAX_V = { C: 4, H: 1, N: 5, O: 2, S: 6, P: 5, Na: 1, K: 1, Cl: 7, F: 1,
  Br: 7, I: 7, Si: 4, Fe: 3, Cu: 2, Zn: 2, Cr: 6, Ti: 4, B: 3, Li: 1, Al: 3, Co: 3 };
const HALIDE = ['Cl', 'F', 'Br', 'I'];
const EXOTIC_ORDER = ['Cl', 'K', 'S', 'P', 'Si', 'Na', 'F', 'Br', 'Cr', 'Fe',
  'Ti', 'Cu', 'Zn', 'B', 'Li', 'I'];
const BASE_ELEMENTS = ['C', 'H', 'N', 'O', 'S', 'P', 'Na', 'K', 'Cl', 'F', 'Si'];
const CAPS = { C: 80, H: 160, N: 6, O: 20, S: 4, P: 4, Na: 2, K: 2, Cl: 6, F: 9,
  Br: 3, I: 2, Si: 4, Fe: 1, Cu: 1, Zn: 1, Cr: 2, Ti: 1, B: 2, Li: 2 };
const HETERO_PENALTY = { N: 0.35, S: 0.80, P: 1.00, Cl: 1.00, F: 1.40, Na: 1.20,
  K: 1.80, Si: 1.50, Br: 1.90, Fe: 2.60, Cu: 2.60, Zn: 2.60, Cr: 2.20,
  Ti: 2.60, B: 2.40, Li: 2.40, I: 2.20 };
const A2_WINDOW = ['S', 'Cl', 'Br', 'K', 'Si', 'Cu', 'Zn', 'Ti', 'Cr'];
const MASS_WEIGHT = 3.0;

/* Ions the generator finds often enough that leaving them as bare formulas
   would be unhelpful. Keyed formula + polarity. */
const ION_NAMES = {
  'HCrO4|neg': 'hydrogen chromate — chromium(VI), from stainless-steel flow paths',
  'CrO4|neg': 'chromate — chromium(VI)',
  'HCr2O7|neg': 'hydrogen dichromate — chromium(VI)',
  'C2F3O2|neg': 'trifluoroacetate (TFA)',
  'CHO2|neg': 'formate',
  'C2H3O2|neg': 'acetate',
  'HSO4|neg': 'hydrogen sulfate',
  'H2PO4|neg': 'dihydrogen phosphate',
  'NO3|neg': 'nitrate',
  'Cl|neg': 'chloride',
  'C2H2NaO4|neg': 'sodium formate + formate cluster',
  'C4H6NaO4|neg': 'sodium acetate + acetate cluster',
  'CH3O3S|neg': 'methanesulfonate',
  'C12H25O4S|neg': 'dodecyl sulfate (SDS)',
  'C6H15N|pos': 'triethylamine',
  'C3H8NO|pos': 'protonated dimethylformamide-like fragment'
};

const hillFormula = counts => {
  const items = Object.keys(counts).filter(e => counts[e]);
  const tok = e => counts[e] === 1 ? e : e + counts[e];
  if (items.indexOf('C') >= 0) {
    const rest = items.filter(e => e !== 'C' && e !== 'H').sort();
    const order = ['C'].concat(items.indexOf('H') >= 0 ? ['H'] : []).concat(rest);
    return order.map(tok).join('');
  }
  return items.sort().map(tok).join('');
};
const signOf = pol => pol === 'neg' ? -1 : 1;
const targetAtomicMass = (mz, pol, z) =>
  mz * z + (signOf(pol) > 0 ? z * ELECTRON : -z * ELECTRON);
const mzFromAtomic = (atomic, pol, z) =>
  signOf(pol) > 0 ? (atomic - z * ELECTRON) / z : (atomic + z * ELECTRON) / z;
const rdbeOf = counts => {
  let t = 0;
  for (const e in counts) t += counts[e] * ((RDBE_V[e] == null ? 2 : RDBE_V[e]) - 2);
  return 1 + t / 2;
};
function isotopePct(counts) {
  let m1 = 0, m2 = 0;
  for (const e in counts) {
    const i = ISO[e] || { a1: 0, a2: 0 };
    m1 += counts[e] * i.a1; m2 += counts[e] * i.a2;
  }
  const nc = counts.C || 0;
  if (nc > 1) m2 += (nc * (nc - 1) / 2) * Math.pow(ISO.C.a1 / 100, 2) * 100;
  return [m1, m2];
}
const a2Window = counts => {
  let s = 0;
  for (const e in counts) if (A2_WINDOW.indexOf(e) >= 0) s += counts[e] * ISO[e].a2;
  return s;
};

/* ------------------------------------------------------------------ loading */
async function load() {
  try {
    const res = await fetch('data/contaminants.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    data.fields.forEach((name, i) => F[name] = i);
    ROWS = data.rows; META = data.meta;
    REFTAB = (META && Array.isArray(META.refTable)) ? META.refTable : [];
    DATA_READY = ROWS.length > 0;

    $('statIons').textContent = META.n_ions.toLocaleString();
    $('statCompounds').textContent = META.n_compounds.toLocaleString();

    const cats = [...new Set(ROWS.map(r => r[F.cat]).filter(Boolean))].sort();
    const sel = $('category');
    cats.forEach(c => { const o = el('option', null, prettyCat(c)); o.value = c; sel.append(o); });

    const seen = new Map();
    ROWS.forEach(r => { if (r[F.fam] && r[F.spacing]) seen.set(r[F.fam], r[F.spacing]); });
    LADDERS = [...seen.entries()].sort((a, b) => a[1] - b[1]);

    // m/z-sorted index, so a lookup touches only the rows inside the window.
    // searchMz used to scan all ~5,000 rows and run passesFilters (ten DOM
    // reads) on each; once per peak that is 5,000 x n, which is what actually
    // froze the tab on a large peak list.
    MZ_ORDER = ROWS.map((r, i) => i).filter(i => isFinite(ROWS[i][F.mz]))
      .sort((a, b) => ROWS[a][F.mz] - ROWS[b][F.mz]);
    MZ_SORTED = Float64Array.from(MZ_ORDER, i => ROWS[i][F.mz]);

    $('status').textContent = '';
    showWelcome();
    if (location.hash.length > 1) {
      // decodeURIComponent throws URIError on a stray '%'. Left uncaught inside
      // the loader's try block it reported "could not load the data" on a
      // perfectly loaded app.
      let seed = '';
      try { seed = decodeURIComponent(location.hash.slice(1)); }
      catch (e) { seed = location.hash.slice(1); }
      $('q').value = seed; run();
    }
  } catch (e) {
    $('status').innerHTML = '<strong>Could not load the contaminant data.</strong> ' +
      'If you opened this file directly, serve the folder over HTTP instead ' +
      '(for example <code>python -m http.server</code>) — browsers block local file reads.';
  }
}

/* ------------------------------------------------------------------ helpers */
/* Optional data columns. They are read through a string key on purpose: they
   may or may not be present in data/contaminants.json, and tools/check_site.py
   (rightly) fails any F.<name> the data does not define. Returns '' when the
   column, or the value in it, is absent. */
const optCol = (r, key) => (F[key] != null && r[F[key]] != null) ? String(r[F[key]]) : '';
const splitList = s => (s || '').split(';').map(x => x.trim()).filter(Boolean);

/* One row here is one ION, not one compound name. The table is merged on the
   ion's elemental composition, so a single row can stand for several
   contaminants, several reported origins and several adduct spellings — the
   trifluoroacetate anion arrives both as the mobile-phase additive and as the
   sodium trifluoroacetate calibrant. That is the most useful thing this data
   knows about a peak, so it is shown on the card rather than hidden: an ion with
   three possible sources is three leads, not clutter. */
function altBlock(r) {
  const names = splitList(optCol(r, 'altn'));
  const origins = splitList(optCol(r, 'alto'));
  const notations = splitList(optCol(r, 'alta'));
  if (!names.length && !origins.length && !notations.length) return null;
  const box = el('div', 'alt-info');
  const line = (label, items, mono) => {
    if (!items.length) return;
    const p = el('p');
    p.append(el('b', null, label + ' '));
    p.append(el('span', mono ? 'mono' : null,
      items.slice(0, 6).join(' · ') +
      (items.length > 6 ? ' · +' + (items.length - 6) + ' more' : '')));
    box.append(p);
  };
  line('Also arises from:', names);
  line('Also reported from:', origins);
  line('Also written as:', notations, true);
  return box;
}

/* Citations. `refs` is an array of indices into meta.refTable, not a string,
   so it cannot go through optCol. Every step is feature-detected and
   bounds-checked: a browser holding a stale cached bundle can carry indices
   the current refTable does not reach, and "undefined | undefined" printed as
   a citation would be worse than printing nothing. */
function refsOf(r) {
  if (F.refs == null || !REFTAB.length) return [];
  const v = r[F.refs];
  if (!v || typeof v.map !== 'function') return [];
  return v.map(i => REFTAB[i]).filter(s => typeof s === 'string' && s);
}

/* One citation, with its bare-URL segments made clickable. These strings are
   pipe-separated provenance trails; a segment is linkified only when the WHOLE
   segment is an http(s) URL, so free text that merely mentions a DOI stays
   text. Building this as DOM nodes rather than an HTML string is what escapes
   it -- textContent is the escape mechanism used everywhere else in this file,
   and the scheme test is what keeps a javascript: URL out of href. */
function refNode(str) {
  const span = el('span');
  // Citations carry unbreakable tokens -- DOIs, raw.githubusercontent.com
  // paths, uwpr_commonmassspeccontaminants.xls -- that are wider than a 390 px
  // phone and push the whole page sideways. styles.css cannot be edited here,
  // so the wrap rule is set on the node itself.
  span.style.display = 'block';
  span.style.overflowWrap = 'anywhere';
  span.style.wordBreak = 'break-word';
  str.split(/\s*\|\s*/).forEach((seg, i) => {
    if (i) span.append(document.createTextNode(' | '));
    if (/^https?:\/\/[^\s"'<>]+$/.test(seg)) {
      const a = el('a', 'ref-link', seg);
      a.href = seg; a.target = '_blank'; a.rel = 'noopener noreferrer';
      // styles.css has no rule for links; the UA default is unreadable on the
      // dark theme, and these DOIs are long enough to overflow a narrow card
      a.style.color = 'var(--accent)'; a.style.wordBreak = 'break-word';
      span.append(a);
    } else span.append(document.createTextNode(seg));
  });
  return span;
}

function citationBlock(r) {
  const refs = refsOf(r);
  if (!refs.length) return null;
  const b = el('div', 'ev-block');
  b.append(el('div', 'ev-title', refs.length === 1 ? 'Source' : 'Sources (' + refs.length + ')'));
  const ul = el('ul', 'ev-list');
  refs.forEach(s => { const li = el('li'); li.append(refNode(s)); ul.append(li); });
  b.append(ul);
  return b;
}

const prettyCat = c => c.replace(/_/g, ' ').replace(/\b(peg|ppg|ms1|ms2)\b/gi, m => m.toUpperCase());
const fmt = (v, n = 4) => (v == null || v === '') ? '—' : Number(v).toFixed(n);
const num = id => { const v = parseFloat($(id).value); return isNaN(v) ? null : v; };
const ppmOf = (obs, calc) => (obs - calc) / calc * 1e6;

/* ============================================================ input parsing */
/* `371+1` is deliberately rejected: it reads as arithmetic, and M+1 already
   means the first isotope everywhere else in this app. */
function parseBasePeak(raw) {
  const s = (raw || '').trim();
  if (!s) return { kind: 'empty' };

  let adduct = null, adductZ = null, adductPol = null, body = s;
  const am = s.match(/\[([^\]]{1,40})\]\s*(\d*)\s*([+-])/);
  if (am) {
    adduct = '[' + am[1] + ']' + (am[2] || '') + am[3];
    adductZ = am[2] ? parseInt(am[2], 10) : 1;
    adductPol = am[3] === '+' ? 'pos' : 'neg';
    body = (s.slice(0, am.index) + ' ' + s.slice(am.index + am[0].length)).trim();
  }

  const nm = body.match(/^([0-9]*\.?[0-9]+)\s*(.*)$/);
  if (!nm) return { kind: 'text', text: s.toLowerCase() };
  const numTxt = nm[1];
  const mz = parseFloat(numTxt);
  const decimals = (numTxt.split('.')[1] || '').length;
  let rest = nm[2].trim().replace(/^[([]\s*/, '').replace(/\s*[)\]]$/, '').trim();

  let z = null, pol = adductPol;
  if (rest === '') {
    if (adductZ) z = adductZ;
  } else if (/^[+-]\s*\d+$/.test(rest)) {
    return { kind: 'chargeAmbiguous', mz: mz, raw: s };
  } else if (/^z\s*=?\s*(\d+)\s*([+-])?$/i.test(rest)) {
    const m = rest.match(/^z\s*=?\s*(\d+)\s*([+-])?$/i);
    z = parseInt(m[1], 10);
    if (m[2]) pol = m[2] === '+' ? 'pos' : 'neg';
  } else if (/^(\d+)\s*[+-]$/.test(rest)) {
    const m = rest.match(/^(\d+)\s*([+-])$/);
    z = parseInt(m[1], 10); pol = m[2] === '+' ? 'pos' : 'neg';
  } else if (/^(\+|-)\1*$/.test(rest)) {
    // A single sign states POLARITY only. Reading it as an explicit z=1
    // suppressed charge inference, so "89.5069+" returned "no explanation
    // found" while the identical "89.5069" correctly inferred 2+ -- and the
    // welcome-screen example used the signed form.
    // "++" / "+++" remain the old instrument shorthand for 2+ / 3+.
    if (rest.length > 1) z = rest.length;
    pol = rest.charAt(0) === '+' ? 'pos' : 'neg';
  } else if (/^(pos|positive|neg|negative)$/i.test(rest)) {
    pol = /^p/i.test(rest) ? 'pos' : 'neg';
  } else {
    return { kind: 'text', text: s.toLowerCase() };
  }

  if (z != null && (z < 1 || z > 8)) return { kind: 'badCharge', z: z, mz: mz };
  return { kind: 'mz', mz: mz, decimals: decimals, polarity: pol || '',
           charge: z, adduct: adduct };
}

// Auto tolerance mirrors how precisely the user typed: "371" means "somewhere
// near 371", "371.1012" means "this exact mass".
function unitResolution() {
  const el = $('resolution');
  return !!el && el.value === 'unit';
}

function toleranceFor(mz, decimals) {
  const mode = $('tolMode').value;
  if (mode === 'ppm') return mz * (parseFloat($('tolValue').value) || 10) / 1e6;
  if (mode === 'da') return parseFloat($('tolValue').value) || 0.01;
  // A quadrupole or ion trap reports a nominal mass. Honouring typed decimals
  // there would pretend to an accuracy the instrument cannot deliver, so unit
  // mode fixes the window at half a Dalton however precisely the user types.
  if (unitResolution()) return 0.5;
  const byDec = { 0: 0.5, 1: 0.05, 2: 0.01, 3: 0.005 };
  if (decimals in byDec) return byDec[decimals];
  return Math.max(mz * 10 / 1e6, 0.002);
}

// Window for matching an observed isotope OFFSET to a specific nuclide.
//
// This was called but never defined, so entering any B+1 m/z threw a
// ReferenceError that aborted the render and left the previous query's cards on
// screen -- the app showed a confident answer for a different ion. The isotope
// engine had therefore never executed in production.
//
// The offsets it must separate are only millidaltons apart (13C +1.00336,
// 53Cr +1.00014, 57Fe +1.00046, 29Si +0.99957), so the window has to be tight.
// But it can never be tighter than the precision the user actually typed:
// claiming to resolve 3 mDa from a value given to 2 decimals would be inventing
// certainty. Where the window is too wide to separate candidates, the caller
// keeps every survivor and reports the ambiguity rather than picking one.
function isoOffsetTol(obs, mz, decimals) {
  // Unit resolution cannot separate 13C (+1.00336) from 53Cr (+1.00014); they
  // are 3 mDa apart. Widening to half a Dalton makes every A+1 nuclide a hit,
  // which is the honest outcome -- the caller then reports the ambiguity rather
  // than naming an element the instrument could not have distinguished.
  if (unitResolution()) return 0.5;
  const byDec = { 0: 0.5, 1: 0.05, 2: 0.01, 3: 0.005 };
  const typed = (decimals in byDec) ? byDec[decimals] : 0.001;
  return Math.max(typed, (mz || 100) * 5 / 1e6, 0.0005);
}

/* =========================================================== charge inference
   PRIMARY: isotope spacing, which works for every z.
   FALLBACK: the fractional-m/z heuristic — fine for 2+, degenerate above it,
   so z>=3 is never asserted from the fraction alone. */
const MAX_DEFECT_PER_DA = 0.00113, MIN_DEFECT_PER_DA = -0.00095;
const SPACING_TABLE = [1.0034, 0.5017, 0.3345, 0.2508, 0.2007, 0.1672, 0.1433, 0.1254];

function inferCharge(mz, b1mz) {
  if (b1mz != null && b1mz > mz) {
    const gap = b1mz - mz;
    const raw = C13 / gap;
    const z = Math.round(raw);
    if (z >= 1 && z <= 8 && Math.abs(raw - z) / z <= 0.15) {
      return { z: z, strength: 'strong', why:
        'the B+1 peak sits ' + gap.toFixed(4) + ' above the base peak, and 1.0034 ÷ ' +
        gap.toFixed(4) + ' = ' + raw.toFixed(2) + ' → z = ' + z +
        ' (the reference spacing for ' + z + '+ is ' + SPACING_TABLE[z - 1].toFixed(4) + ')' };
    }
    return { z: 1, strength: 'weak', why:
      'the B+1 spacing of ' + gap.toFixed(4) + ' is not within 15% of any 1.0034/z, so it may not be an ' +
      'isotope of this ion at all; assuming z = 1' };
  }
  const defect = mz - Math.round(mz);
  const frac = mz - Math.floor(mz);
  const outsideEnvelope = defect > MAX_DEFECT_PER_DA * mz + 0.03 ||
                          defect < MIN_DEFECT_PER_DA * mz - 0.03;
  if (frac >= 0.40 && frac <= 0.60) {
    if (outsideEnvelope) return { z: 2, strength: 'moderate', why:
      'the fractional part is ' + frac.toFixed(3) + ' and a mass defect of ' + defect.toFixed(4) +
      ' is outside anything a singly charged C,H,N,O,S,P,Na,K,Cl,F,Si ion can reach at this m/z → 2+' };
    return { z: 2, strength: 'weak', why:
      'the fractional part is ' + frac.toFixed(3) + ', which usually means 2+ — though above about m/z 450 a ' +
      'genuine 1+ lipid can also sit near .5, so confirm with the B+1 spacing' };
  }
  if ((frac >= 0.28 && frac < 0.40) || (frac > 0.60 && frac <= 0.72)) {
    return { z: 1, strength: 'weak', possible: 3, why:
      'the fractional part is ' + frac.toFixed(3) + ', which is consistent with 3+, but the fraction alone ' +
      'degenerates above 2+ — z = 3 is a possibility, not a call. Enter the B+1 m/z to settle it.' };
  }
  return { z: 1, strength: 'assumed', why: 'no B+1 m/z given and the mass defect is inside the 1+ envelope, so z = 1 is assumed' };
}

/* ======================================================= isotope interpretation */
function interpretIsotopes(obs) {
  const out = { evidence: [], caveats: [], required: {}, forbidden: [],
                a1pct: null, a2pct: null, a1elements: [], notes: [] };
  const z = obs.charge;
  const tolB = toleranceFor(obs.mz, obs.decimals);

  /* ---- guard 1: satellite of a neighbour ---- */
  const sats = [];
  if (obs.b1pct != null) sats.push(['B+1', obs.b1pct]);
  if (obs.b2pct != null) sats.push(['B+2', obs.b2pct]);
  for (const s of sats) {
    if (s[1] > 100) {
      out.caveats.push('The ' + s[0] + ' peak you entered is ' + s[1] + '% of the peak you called the base peak. ' +
        'A satellite cannot exceed its own base peak — this m/z is a satellite of a larger ion nearby, ' +
        'not an ion in its own right. Re-run using the taller peak as B0.');
    } else if (s[1] > 50 && s[0] === 'B+1') {
      out.caveats.push('A ' + s[0] + ' at ' + s[1] + '% of B0 is very large for an A+1. Unless the ion carries ' +
        'many carbons, check that this peak is not itself a satellite of a bigger neighbour.');
    }
  }

  /* ---- A+1 ---- */
  if (obs.b1mz != null) {
    const offset = (obs.b1mz - obs.mz) * z;      // per-charge spacing to real mass
    const tol = isoOffsetTol(obs, obs.b1mz, obs.b1decimals);
    const hits = [];
    for (const e of A1_OFFSETS) {
      if (Math.abs(offset - e.off) > tol) continue;
      const h = { entry: e, dev: Math.abs(offset - e.off), n: null, nInt: null,
                  ok: true, why: [], massScore: Math.abs(offset - e.off) / tol, intScore: 0 };
      if (obs.b1pct != null && e.per) {
        h.n = obs.b1pct / e.per;
        h.nInt = Math.max(1, Math.round(h.n));
        h.intScore = Math.abs(obs.b1pct - h.nInt * e.per) / Math.max(1.5, 0.25 * obs.b1pct);
        if (e.kind === 'metal') {
          if (h.n < 0.6 || h.n > 2.6) { h.ok = false; h.why.push('would need ' + h.n.toFixed(1) + ' atoms'); }
        } else if (e.el === 'Si' || e.el === 'S') {
          if (h.n > (CAPS[e.el] + 0.6)) { h.ok = false; h.why.push('would need ' + h.n.toFixed(1) + ' atoms'); }
        }
      }
      // metals are called on the PAIR, never on one satellite alone
      if (e.kind === 'metal') {
        if (!obs.below) { h.ok = false; h.why.push('no peak below the base peak, and ' + e.el +
          ' cannot appear without one (' + METAL_PAIRS[e.el] + ')'); }
      }
      h.total = h.massScore + h.intScore;
      hits.push(h);
    }
    const keep = hits.filter(h => h.ok);

    /* ---- guard 2: window merging above ~m/z 300 ---- */
    const c13hit = hits.filter(h => h.entry.el === 'C')[0];
    const heteroKept = keep.filter(h => h.entry.el !== 'C');
    if (obs.mz * z > 300 && heteroKept.length && c13hit) {
      const sep = Math.abs(heteroKept[0].entry.off - C13);
      if (sep < 2 * tol) {
        out.caveats.push('At m/z ' + obs.mz.toFixed(4) + ' the ¹³C offset and the ' +
          heteroKept[0].entry.iso + ' offset differ by only ' + sep.toFixed(5) +
          ' Da, which your mass accuracy cannot resolve. No heteroatom is claimed from A+1 here — ' +
          'this is exactly how a false chromium was manufactured on m/z 377.2731.');
        keep.length = 0;
        if (c13hit) keep.push(c13hit);
      }
    }

    if (!keep.length) {
      out.caveats.push('The B+1 spacing of ' + ((obs.b1mz - obs.mz)).toFixed(4) +
        ' does not match any isotope offset at z = ' + z + '. It may belong to a different ion.');
    } else {
      keep.sort((a, b) => a.total - b.total);
      out.a1elements = keep.map(h => h.entry.el);
      const named = keep.map(h => {
        let t = h.entry.iso + ' (offset ' + h.entry.off.toFixed(5) + ' vs your ' + offset.toFixed(5) + ')';
        if (h.n != null) t += ' → ' + (h.entry.el === 'C' ? Math.round(h.n) + ' carbons'
                                                          : h.nInt + ' × ' + h.entry.el +
                                                            ' predicts ' + (h.nInt * h.entry.per).toFixed(1) + '%');
        return t;
      });
      out.evidence.push('B+1 exact mass, ranked on offset and intensity together: ' + named.join('; ') + '.');
      const rejected = hits.filter(h => !h.ok);
      if (rejected.length) out.evidence.push('Ruled out at that offset: ' +
        rejected.map(h => h.entry.iso + ' (' + h.why.join('; ') + ')').join('; ') + '.');

      // assert an element only when one candidate clearly dominates
      const best = keep[0], second = keep[1];
      const dominant = best.total < 0.5 && (!second || second.total > 3 * best.total);
      if (dominant && best.entry.el !== 'C') {
        out.required[best.entry.el] = best.nInt || 1;
        out.evidence.push('Only ' + best.entry.iso + ' fits that offset and that intensity together, so this ion ' +
          'contains ' + best.entry.el + '. Reading the same A+1 as ¹³C would have claimed ' +
          Math.round((obs.b1pct || 0) / ISO.C.a1) + ' carbons that are not there — which is exactly the ' +
          'failure this tool exists to stop.');
      } else if (dominant && best.entry.el === 'C' && obs.b1pct != null) {
        out.evidence.push('A+1 of ' + obs.b1pct + '% at the ¹³C offset → about ' +
          Math.round(obs.b1pct / ISO.C.a1) + ' carbons.');
      } else if (keep.length > 1) {
        out.caveats.push('At your mass accuracy the ' + keep.map(h => h.entry.iso).join(', ') +
          ' offsets are not separated cleanly enough to name the element outright, so all of them stay on the ' +
          'table. They are resolvable below about 5 ppm — more decimal places on the B+1 m/z would settle it.');
      }
    }
    if (obs.b1pct != null) out.a1pct = obs.b1pct;
  } else if (obs.b1pct != null) {
    out.a1pct = obs.b1pct;
    out.evidence.push('A+1 of ' + obs.b1pct + '% — read as ¹³C that is about ' +
      Math.round(obs.b1pct / ISO.C.a1) + ' carbons, but with no B+1 m/z the element behind it is unproven.');
    out.caveats.push('Without the B+1 m/z, A+1 was assumed to be ¹³C. ²⁹Si, ³³S, ' +
      '⁵³Cr and ⁵⁷Fe all sit within 0.004 Da of it and each would give a completely different formula.');
  }

  /* ---- A+2 ---- */
  if (obs.b2mz != null) {
    const offset2 = (obs.b2mz - obs.mz) * z;
    const tol2 = (tolB + toleranceFor(obs.b2mz, obs.b2decimals)) * z;
    const hits2 = A2_OFFSETS.filter(e => Math.abs(offset2 - e.off) <= tol2);
    if (hits2.length) {
      out.evidence.push('B+2 exact mass matches ' + hits2.map(e => e.iso +
        ' (' + e.off.toFixed(5) + ')').join(' or ') + '; yours is ' + offset2.toFixed(5) + '.');
      const halogen = hits2.filter(e => e.el === 'Cl' || e.el === 'Br');
      if (hits2.length === 1 && hits2[0].el !== 'C2' && obs.b2pct != null) {
        const n = obs.b2pct / hits2[0].per;
        if (n >= 0.6) {
          out.required[hits2[0].el] = Math.max(1, Math.round(n));
          out.evidence.push('At ' + obs.b2pct + '% that is ' + Math.round(n) + ' × ' + hits2[0].el + '.');
        }
      } else if (halogen.length && obs.b2pct != null && obs.b2pct >= 20) {
        out.evidence.push('An A+2 of ' + obs.b2pct + '% is halogen territory — probing A+2 only at the ' +
          'two-¹³C offset is what made every chlorinated species in the reference blank read "no halogen".');
      }
    } else {
      out.caveats.push('The B+2 spacing of ' + (obs.b2mz - obs.mz).toFixed(4) +
        ' matches no A+2 isotope offset at z = ' + z + '.');
    }
  }
  if (obs.b2pct != null) out.a2pct = obs.b2pct;

  /* ---- below the base peak ---- */
  if (obs.below) {
    const cands = BELOW_OFFSETS.slice();
    const supported = [];
    for (const b of cands) {
      if (out.required[b.el]) supported.push(b);
    }
    if (supported.length) {
      out.evidence.push('The peak below your base peak is the ' + supported.map(b => b.iso).join('/') +
        ' satellite — that pair (' + METAL_PAIRS[supported[0].el] + ') is what separates ' +
        supported[0].el + ' from the other metals; one satellite alone never would.');
    } else {
      out.evidence.push('Intensity below the base peak restricts this to the ~3% of formulas that have any: ' +
        BELOW_OFFSETS.map(b => b.iso).join(', ') + ', tin, several bromines, or a large biopolymer.');
      out.notes.push('below-peak present');
    }
  } else if (obs.b1mz != null) {
    out.notes.push('no below-peak: Cr, Fe, Ti, B and Li are all excluded');
  }

  /* ---- guard 3: intensity dependence ---- */
  if (out.a1pct != null || out.a2pct != null) {
    out.caveats.push('Isotope ratios are only valid in the middle of an ion’s dynamic range — the noise floor ' +
      'biases them low and saturation biases them high. A drift of more than 1.5 percentage points across the range ' +
      'means the ratio is a hint, not a constraint, so 1.5 points of slack were added before using yours.');
  }
  return out;
}

/* ======================================================== layer 1 — library */
const ISO_RANGES = { none: [0, 3], s: [3.5, 8], si: [10, 25], cl1: [26, 38], cl2: [55, 75], br1: [85, 110] };

function passesFilters(r) {
  const pol = $('polarity').value;
  if (pol && r[F.pol] !== pol) return false;
  const cat = $('category').value;
  if (cat && r[F.cat] !== cat) return false;
  if ($('onlyMs2').checked && !r[F.ms2n]) return false;
  if ($('onlyMulti').checked && (r[F.nsrc] || 1) < 2) return false;
  const ch = $('charge').value;
  if (ch && String(r[F.charge]) !== ch) return false;
  const elu = $('elution').value;
  if (elu && r[F.elution] !== elu) return false;
  if ($('requireLogp').checked && r[F.logp] == null) return false;
  const preset = $('isoPreset').value;
  if (preset && preset !== 'custom') {
    const rg = ISO_RANGES[preset] || [0, 1e9];
    if (r[F.m2] == null || r[F.m2] < rg[0] || r[F.m2] > rg[1]) return false;
  } else if (preset === 'custom') {
    const m2 = parseFloat($('isoM2').value), m1 = parseFloat($('isoM1').value);
    if (!isNaN(m2)) { if (r[F.m2] == null || Math.abs(r[F.m2] - m2) > Math.max(2, m2 * 0.25)) return false; }
    if (!isNaN(m1)) { if (r[F.m1] == null || Math.abs(r[F.m1] - m1) > Math.max(2, m1 * 0.25)) return false; }
  }
  return true;
}

function prominence(r) {
  let p = Math.min(r[F.nsrc] || 1, 8) / 8 * 0.5;
  if (r[F.conf] === 'high') p += 0.25;
  else if (r[F.conf] === 'medium') p += 0.1;
  if (r[F.ms2n]) p += 0.15;
  if (r[F.src] === 'memory+web') p += 0.1;
  return p;
}

// first index of MZ_SORTED whose value is >= v
function lowerBound(v) {
  let lo = 0, hi = MZ_SORTED.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (MZ_SORTED[mid] < v) lo = mid + 1; else hi = mid; }
  return lo;
}

function searchMz(mz, tol, polarity) {
  const out = [];
  if (MZ_SORTED && MZ_SORTED.length === MZ_ORDER.length && MZ_ORDER.length) {
    for (let k = lowerBound(mz - tol); k < MZ_SORTED.length && MZ_SORTED[k] <= mz + tol; k++) {
      const r = ROWS[MZ_ORDER[k]], d = r[F.mz] - mz;
      if (polarity && r[F.pol] !== polarity) continue;
      if (!passesFilters(r)) continue;
      out.push({ r: r, delta: d });
    }
  } else for (const r of ROWS) {          // index not built yet (data still loading)
    const d = r[F.mz] - mz;
    if (Math.abs(d) > tol) continue;
    if (polarity && r[F.pol] !== polarity) continue;
    if (!passesFilters(r)) continue;
    out.push({ r: r, delta: d });
  }
  const mode = $('sortBy').value;
  out.sort((a, b) => {
    if (mode === 'mass') return Math.abs(a.delta) - Math.abs(b.delta);
    if (mode === 'common') return prominence(b.r) - prominence(a.r) || Math.abs(a.delta) - Math.abs(b.delta);
    const sa = Math.abs(a.delta) / tol - prominence(a.r) * 0.6;
    const sb = Math.abs(b.delta) / tol - prominence(b.r) * 0.6;
    return sa - sb;
  });
  return out;
}

function layerLibrary(obs, iso) {
  const hits = searchMz(obs.mz, obs.tol, obs.polarity);
  const out = [];
  for (const h of hits.slice(0, 12)) {
    const r = h.r;
    const ev = ['matches a curated library entry to ' + ppmOf(obs.mz, r[F.mz]).toFixed(1) + ' ppm'];
    if ((r[F.nsrc] || 1) > 1) ev.push(r[F.nsrc] + ' independent sources report this ion');
    if (r[F.origin]) ev.push('reported origin: ' + r[F.origin]);
    // the same ion from a different contaminant is a different lead, and the
    // whole point of merging on ion identity was to keep those rather than
    // publish one row per spelling
    const altNames = splitList(optCol(r, 'altn'));
    if (altNames.length) ev.push('the same ion also arises from ' +
      altNames.slice(0, 3).join(', ') +
      (altNames.length > 3 ? ' and ' + (altNames.length - 3) + ' more' : ''));
    const altAd = splitList(optCol(r, 'alta'));
    if (altAd.length) ev.push('also written as ' + altAd.slice(0, 3).join(', '));
    if (r[F.ms2n]) ev.push(r[F.ms2n] + ' public MS2 spectra exist for confirmation');
    if (r[F.fam] && r[F.spacing]) ev.push('member of the ' + r[F.fam] + ' series, members ' +
      fmt(r[F.spacing]) + ' apart' + (obs.charge > 1 ? ' (÷ ' + obs.charge + ' = ' +
      (r[F.spacing] / obs.charge).toFixed(4) + ' in m/z at this charge)' : ''));
    const cav = [];
    if (r[F.ms1tier] === 'ms1_alone_insufficient') cav.push('mass alone is not diagnostic here — ' +
      (r[F.nnb] || 'several') + ' other known structures sit within 5 ppm.');
    if (String(r[F.charge]) !== String(obs.charge)) cav.push('the library lists this ion at charge ' +
      r[F.charge] + ', but you specified ' + obs.charge + '.');
    // isotope cross-check against the library's predicted envelope
    if (iso.a2pct != null && r[F.m2] != null) {
      const d = Math.abs(r[F.m2] - iso.a2pct);
      if (d > Math.max(2, 0.4 * iso.a2pct) + 1.5) cav.push('its predicted A+2 of ' + r[F.m2] +
        '% disagrees with your measured ' + iso.a2pct + '%.');
      else ev.push('predicted A+2 of ' + r[F.m2] + '% agrees with your measured ' + iso.a2pct + '%');
    }
    let conf = 'low';
    if ((r[F.nsrc] || 1) > 1 && r[F.ms1tier] === 'high') conf = 'high';
    else if ((r[F.nsrc] || 1) > 1 || r[F.conf] === 'high') conf = 'medium';
    if (cav.length) conf = conf === 'high' ? 'medium' : conf;
    // A source's nominal value is not an exact mass and must not be shown as
    // one, nor scored on a ppm error computed against it: m/z 45.0000 "formate"
    // otherwise ranks first at +0.0 ppm while the true 44.9982 entry is
    // labelled +40 ppm -- exactly inverted.
    const basis = F.basis != null ? r[F.basis] : 'calc';
    if (basis === 'nominal') {
      cav.push('the source published only a nominal (integer) mass for this ion, ' +
               'so the ppm figure is not meaningful and no exact mass is claimed');
      conf = conf === 'high' ? 'medium' : conf;
    } else if (basis === 'reported') {
      cav.push('m/z as published by the source; we hold no formula for this ion, ' +
               'so it has not been independently recomputed here');
    }
    out.push({
      identity: r[F.name], species: r[F.adduct] || '', formula: r[F.formula] || '',
      calc: r[F.mz], basis: basis,
      ppm: basis === 'nominal' ? null : ppmOf(obs.mz, r[F.mz]),
      layer: 'library', confidence: conf,
      evidence: ev, caveats: cav, row: r,
      score: Math.abs(ppmOf(obs.mz, r[F.mz])) / Math.max(1, obs.ppmTol) - prominence(r)
    });
  }
  return out;
}

/* ================================================ layer 2 — computed clusters */
const SOLVENTS = {
  water: { label: 'water', abbr: 'H₂O', mass: 18.0105646 },
  acn:   { label: 'acetonitrile', abbr: 'ACN', mass: 41.0265491 },
  meoh:  { label: 'methanol', abbr: 'MeOH', mass: 32.0262147 },
  ipa:   { label: 'isopropanol', abbr: 'IPA', mass: 60.0575149 },
  fa:    { label: 'formic acid', abbr: 'FA', mass: 46.0054793 },
  aa:    { label: 'acetic acid', abbr: 'AcOH', mass: 60.0211294 },
  amfo:  { label: 'ammonia (from ammonium formate)', abbr: 'NH₃', mass: 17.0265491 },
  amac:  { label: 'ammonia (from ammonium acetate)', abbr: 'NH₃', mass: 17.0265491 },
  tfa:   { label: 'trifluoroacetic acid', abbr: 'TFA', mass: 113.9928639 }
};
const CATIONS = [
  { name: 'H', mass: PROTON }, { name: 'Na', mass: EL.Na - ELECTRON },
  { name: 'K', mass: EL.K - ELECTRON },
  { name: 'NH4', mass: EL.N + 4 * EL.H - ELECTRON, needs: ['amfo', 'amac'] }
];
const ANIONS = [
  { name: '-H', mass: -PROTON, label: '-H' },
  { name: '+Cl', mass: EL.Cl + ELECTRON, label: '+Cl' },
  { name: '+HCOO', mass: EL.C + EL.H + 2 * EL.O + ELECTRON, label: '+HCOO', needs: ['fa', 'amfo'] },
  { name: '+CH3COO', mass: 2 * EL.C + 3 * EL.H + 2 * EL.O + ELECTRON, label: '+CH3COO', needs: ['aa', 'amac'] },
  { name: '+CF3COO', mass: 2 * EL.C + 3 * EL.F + 2 * EL.O + ELECTRON, label: '+CF3COO', needs: ['tfa'] }
];

function selectedSolvents() {
  const boxes = document.querySelectorAll('#solvents input[type=checkbox]');
  const out = [];
  boxes.forEach(b => { if (b.checked) out.push(b.getAttribute('data-solvent')); });
  return out;
}

function unitMultisets(keys, maxUnits) {
  const out = [[]];
  let frontier = [[]];
  for (let n = 1; n <= maxUnits; n++) {
    const next = [];
    for (const f of frontier) {
      const start = f.length ? keys.indexOf(f[f.length - 1]) : 0;
      for (let i = start; i < keys.length; i++) next.push(f.concat([keys[i]]));
    }
    out.push.apply(out, next);
    frontier = next;
  }
  return out;
}

function layerClusters(obs, iso) {
  const chosen = selectedSolvents();
  if (!chosen.length) return [];
  const z = obs.charge;
  if (z > 2) return [];   // solvent clusters above 2+ are not a real population
  const carriers = obs.polarity === 'neg'
    ? ANIONS.filter(a => !a.needs || a.needs.some(k => chosen.indexOf(k) >= 0))
    : CATIONS.filter(c => !c.needs || c.needs.some(k => chosen.indexOf(k) >= 0));
  const combos = unitMultisets(chosen, 4);
  const out = [];
  const seen = {};

  for (const units of combos) {
    let mass = 0;
    for (const u of units) mass += SOLVENTS[u].mass;
    if (mass > obs.mz * z + 5) continue;
    for (const c1 of carriers) {
      const pairs = z === 2 ? carriers.map(c2 => [c1, c2]) : [[c1]];
      for (const pair of pairs) {
        let cm = 0;
        for (const c of pair) cm += c.mass;
        for (let na = 0; na <= 2; na++) {
          const atoms = mass + cm + na * NA_H;
          const calc = atoms / z;
          if (Math.abs(calc - obs.mz) > obs.tol) continue;
          if (!units.length && !na && pair.length === 1 && pair[0].name === '-H') continue;
          const counts = {};
          for (const u of units) counts[u] = (counts[u] || 0) + 1;
          const label = Object.keys(counts).map(u =>
            (counts[u] > 1 ? counts[u] : '') + SOLVENTS[u].abbr).join('+') || '';
          const carrierLabel = pair.map(c => obs.polarity === 'neg' ? c.label : '+' + c.name).join('');
          const naLabel = na ? '+' + (na > 1 ? na : '') + 'Na-' + (na > 1 ? na : '') + 'H' : '';
          const species = '[' + (label || 'H') + carrierLabel + naLabel + ']' +
            (z > 1 ? z : '') + (obs.polarity === 'neg' ? '-' : '+');
          if (seen[species]) continue;
          seen[species] = 1;
          const solventNames = [...new Set(units)].map(u => SOLVENTS[u].label);
          const ev = ['computed from the mobile phase you selected: ' +
            (solventNames.length ? solventNames.join(' + ') : 'charge carrier only') +
            ', to ' + ppmOf(obs.mz, calc).toFixed(1) + ' ppm'];
          if (na) ev.push('includes ' + na + ' Na→H exchange (+' + NA_H.toFixed(5) +
            ' each) — sodium is present in every glass-contacting flow path');
          if (units.length > 1) ev.push('a cluster ladder should be visible: neighbouring members at ' +
            (obs.mz - SOLVENTS[units[units.length - 1]].mass / z).toFixed(4) + ' and ' +
            (obs.mz + SOLVENTS[units[units.length - 1]].mass / z).toFixed(4) + ' m/z');
          const cav = ['Gradient consistency: this assumes ' +
            (solventNames.length ? solventNames.join(' and ') : 'the charge carrier') +
            ' was actually flowing' + (obs.rt != null ? ' at ' + obs.rt + ' min' : ' at this retention time') +
            '. Untick anything that was not — an [ACN+IPA+H]⁺ assignment once survived review until ' +
            'someone pointed out IPA only enters after 70 min.'];
          if (iso.a1pct != null) {
            const nC = countCarbons(units) + (obs.polarity === 'neg' ? carbonsInCarrier(pair) : 0);
            const pred = nC * ISO.C.a1;
            if (Math.abs(pred - iso.a1pct) > Math.max(1.2, 0.3 * iso.a1pct) + 1.5)
              cav.push('its ' + nC + ' carbons predict an A+1 of ' + pred.toFixed(1) +
                '%, against your measured ' + iso.a1pct + '%.');
            else ev.push(nC + ' carbons predict an A+1 of ' + pred.toFixed(1) +
              '%, matching your measured ' + iso.a1pct + '%');
          }
          out.push({
            identity: (solventNames.length ? solventNames.join(' + ') : 'charge carrier') + ' cluster',
            species: species, formula: '', calc: calc, ppm: ppmOf(obs.mz, calc),
            layer: 'cluster', confidence: units.length > 1 ? 'medium' : 'low',
            evidence: ev, caveats: cav,
            score: 0.5 + Math.abs(ppmOf(obs.mz, calc)) / Math.max(1, obs.ppmTol) + 0.15 * units.length
          });
        }
      }
    }
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, 8);
}
const CARBONS = { water: 0, acn: 2, meoh: 1, ipa: 3, fa: 1, aa: 2, amfo: 0, amac: 0, tfa: 2 };
const countCarbons = units => units.reduce((s, u) => s + CARBONS[u], 0);
const carbonsInCarrier = pair => pair.reduce((s, c) =>
  s + (c.name === '+HCOO' ? 1 : c.name === '+CH3COO' ? 2 : c.name === '+CF3COO' ? 2 : 0), 0);

/* ============================================ layer 3 — formula generation */
function exoticCombos(elements, caps) {
  const species = EXOTIC_ORDER.filter(e => elements.indexOf(e) >= 0 && (caps[e] || 0) > 0);
  const combos = [{ mass: 0, nom: 0, d: {} }];
  const push = d => {
    let m = 0, nm = 0;
    for (const e in d) { m += EL[e] * d[e]; nm += NOM[e] * d[e]; }
    combos.push({ mass: m, nom: nm, d: d });
  };
  for (let i = 0; i < species.length; i++) {
    const a = species[i];
    const loA = a === 'F' ? 2 : 1;
    for (let na = loA; na <= caps[a]; na++) {
      const d1 = {}; d1[a] = na; push(d1);
      for (let j = i + 1; j < species.length; j++) {
        const b = species[j];
        if ((a === 'F' && HALIDE.indexOf(b) >= 0) || (b === 'F' && HALIDE.indexOf(a) >= 0)) continue;
        const loB = b === 'F' ? 2 : 1;
        for (let nb = loB; nb <= caps[b]; nb++) { const d2 = {}; d2[a] = na; d2[b] = nb; push(d2); }
      }
    }
  }
  combos.sort((x, y) => x.mass - y.mass);
  return combos;
}

function chemistryOk(counts, z, pol, rd, flags, atomic, nominal) {
  // alkali charge balance
  const nAlk = (counts.Na || 0) + (counts.K || 0);
  if (nAlk) {
    if (nAlk > 2) return false;
    const unbal = signOf(pol) > 0 ? Math.max(0, nAlk - z) : nAlk + z;
    let sites = counts.O || 0;
    for (const h of HALIDE) sites += 2 * (counts[h] || 0);
    if (sites < 2 * unbal) return false;
  }
  // phosphorus: essentially always phosphate-like, with the phosphine-oxide exception
  const p = counts.P || 0;
  if (p) {
    const o = counts.O || 0;
    if (o < 3 * p) {
      if (!(p === 1 && o >= 1 && (counts.C || 0) >= 6 && rd >= 4)) return false;
      flags.push('low-O phosphorus (phosphine-oxide-like exception)');
    }
  }
  // fluorine only in perfluoro-like groups
  const f = counts.F || 0;
  if (f) {
    if (counts.Cl || counts.Br || counts.I) return false;
    const c = counts.C || 0;
    if (f < 2 || c < 1 || f > 2 * c + 1) return false;
    if (atomic - nominal >= 0) return false;
    flags.push(f >= 3 ? 'perfluoro (CF3-like)' : 'perfluoro (CF2-like)');
  }
  // Senior connectivity
  let nAtoms = 0, sumVal = 0, nHal = 0;
  for (const e in counts) {
    nAtoms += counts[e];
    sumVal += counts[e] * (MAX_V[e] == null ? 2 : MAX_V[e]);
    if (HALIDE.indexOf(e) >= 0) nHal += counts[e];
  }
  if (nAtoms > 1 && sumVal < 2 * (nAtoms - 1 - Math.min(nAlk, nHal))) return false;
  // element-ratio sanity
  const c = counts.C || 0;
  if (c) {
    if ((counts.H || 0) > 3.1 * c) return false;
    if ((counts.O || 0) > 3.0 * c) return false;
    if ((counts.N || 0) > 1.3 * c) return false;
  }
  return true;
}

function isotopesOk(counts, iso) {
  if (iso.a1pct != null) {
    const p1 = isotopePct(counts)[0];
    const tol = Math.max(1.2, 0.3 * iso.a1pct) + 1.5;   // +1.5 pp for guard 3
    if (Math.abs(p1 - iso.a1pct) > tol) return false;
  }
  if (iso.a2pct != null) {
    const p2 = a2Window(counts);
    const tol = Math.max(2.0, 0.4 * iso.a2pct) + 1.5;
    if (p2 > iso.a2pct + tol) return false;             // upper bound: always
    if (iso.a2pct >= 20 && p2 < iso.a2pct - tol) return false;  // lower: halogens only
  }
  return true;
}

function penaltyOf(counts, rd, iso, flags) {
  let pen = 0;
  const c = counts.C || 0, h = counts.H || 0, n = counts.N || 0, o = counts.O || 0;
  const exotic = EXOTIC_ORDER.filter(e => counts[e]);
  for (const e of exotic.concat(n ? ['N'] : [])) pen += HETERO_PENALTY[e] == null ? 1.0 : HETERO_PENALTY[e];
  for (const e of ['S', 'P', 'Na', 'K', 'Cl', 'Si', 'Br']) pen += 0.4 * Math.max(0, (counts[e] || 0) - 1);
  pen += 0.15 * Math.max(0, (counts.F || 0) - 3);
  pen += 1.5 * Math.max(0, exotic.length - 1);
  if (c) {
    const hc = h / c, oc = o / c, nc = n / c;
    if (oc > 1.5) pen += 0.8;
    if (oc > 2.5) pen += 0.8;
    if (nc > 0.6) pen += 0.8;
    if (hc > 2.6) pen += 0.6;
    if (hc < 0.4 && HALIDE.reduce((s, x) => s + (counts[x] || 0), 0) < c) pen += 0.8;
    if (rd > 0.5 + 0.7 * c) pen += 1.0;
  } else pen += 0.3;
  if (flags.indexOf('low-O phosphorus (phosphine-oxide-like exception)') >= 0) pen += 2.5;
  if (iso.a1pct != null) {
    const tol = Math.max(1.2, 0.3 * iso.a1pct) + 1.5;
    pen += 0.8 * Math.abs(isotopePct(counts)[0] - iso.a1pct) / tol;
  }
  if (iso.a2pct != null) {
    const tol = Math.max(2.0, 0.4 * iso.a2pct) + 1.5;
    const d = a2Window(counts) - iso.a2pct;
    pen += (d > 0 ? 0.8 : 0.4) * Math.abs(d) / tol;
  }
  return pen;
}

function generateFormulas(obs, iso, maxResults) {
  const z = obs.charge, pol = obs.polarity;
  const target = targetAtomicMass(obs.mz, pol, z);
  const tol = obs.tol * z;
  const caps = Object.assign({}, CAPS);
  let elements = BASE_ELEMENTS.slice();
  // isotope evidence decides which exotic elements are even on the table
  for (const e in iso.required) { if (elements.indexOf(e) < 0) elements.push(e); }
  for (const e of iso.a1elements) { if (e !== 'C' && elements.indexOf(e) < 0) elements.push(e); }
  if (obs.below) { for (const e of ['Fe', 'Cr', 'Ti', 'B', 'Li'])
    if (elements.indexOf(e) < 0) elements.push(e); }
  if (iso.a2pct != null && iso.a2pct >= 30) { if (elements.indexOf('Br') < 0) elements.push('Br'); }

  // an A+2 below the noise floor is a positive statement that heavy-A+2 elements are absent
  if (iso.a2pct != null) {
    const ceiling = iso.a2pct + Math.max(2.0, 0.4 * iso.a2pct) + 1.5;
    for (const e of A2_WINDOW) if (ISO[e].a2 > ceiling) caps[e] = 0;
  }
  if (iso.a1pct != null) {
    const ctol = Math.max(1.2, 0.3 * iso.a1pct) + 1.5;
    caps.C = Math.min(caps.C, Math.floor((iso.a1pct + ctol) / ISO.C.a1) + 1);
  }
  for (const e in iso.required) caps[e] = Math.max(caps[e] || 0, iso.required[e]);
  elements = elements.filter(e => (caps[e] || 0) > 0 || ['C', 'H', 'N', 'O'].indexOf(e) >= 0);

  const reqKeys = Object.keys(iso.required);
  const nMax = Math.min(caps.N, Math.floor(target / NOM.N));
  const oMax = Math.min(caps.O, Math.floor(target / NOM.O));
  let combos = exoticCombos(elements, caps);
  if (reqKeys.length) combos = combos.filter(cb =>
    reqKeys.every(e => e === 'C' || (cb.d[e] || 0) >= iso.required[e]));

  const parity = z % 2 === 0 ? 0 : 0.5;
  const out = [];
  for (const cb of combos) {
    if (cb.mass > target + tol) break;
    for (let nN = 0; nN <= nMax; nN++) {
      const m1 = cb.mass + nN * EL.N;
      if (m1 > target + tol) break;
      for (let nO = 0; nO <= oMax; nO++) {
        const m2 = m1 + nO * EL.O;
        if (m2 > target + tol) break;
        const rem = target - m2;
        const nomBase = cb.nom + nN * NOM.N + nO * NOM.O;
        const fl = Math.floor(rem);
        for (let k = 0; k < 3; k++) {
          const nomRem = fl - k;
          if (nomRem < 0) continue;
          const hExact = (rem - nomRem) / H_DEFECT;
          if (hExact < -0.5) continue;
          const nH = Math.round(hExact);
          if (nH < 0 || nH > caps.H) continue;
          const c12 = nomRem - nH;
          if (c12 < 0 || c12 % 12) continue;
          const nC = c12 / 12;
          if (nC > caps.C) continue;
          if (reqKeys.indexOf('C') >= 0 && nC < iso.required.C) continue;
          const atomic = m2 + nC * EL.C + nH * EL.H;
          if (Math.abs(atomic - target) > tol) continue;
          const counts = Object.assign({}, cb.d);
          if (nC) counts.C = nC;
          if (nH) counts.H = nH;
          if (nN) counts.N = nN;
          if (nO) counts.O = nO;
          if (!Object.keys(counts).length) continue;
          const rd = rdbeOf(counts);
          if (rd < -0.5) continue;
          if (rd > 1.0 + 0.75 * (nC + nN + (counts.S || 0) + (counts.P || 0))) continue;
          if (Math.abs((rd - Math.floor(rd)) - parity) > 1e-9) continue;
          const flags = [];
          if (!chemistryOk(counts, z, pol, rd, flags, atomic, nomBase + nomRem)) continue;
          if (!isotopesOk(counts, iso)) continue;
          const calc = mzFromAtomic(atomic, pol, z);
          const pen = penaltyOf(counts, rd, iso, flags);
          const ppm = ppmOf(obs.mz, calc);
          out.push({ counts: counts, formula: hillFormula(counts), calc: calc, ppm: ppm,
            rdbe: rd, flags: flags, pen: pen,
            score: pen + MASS_WEIGHT * Math.abs(ppm) / Math.max(obs.ppmTol, 1e-9) });
        }
      }
    }
  }
  out.sort((a, b) => a.score - b.score || Math.abs(a.ppm) - Math.abs(b.ppm));
  return out.slice(0, maxResults || 8);
}

function layerFormula(obs, iso) {
  const cands = generateFormulas(obs, iso, 8);
  const z = obs.charge;
  return cands.map(c => {
    const key = c.formula + '|' + obs.polarity;
    const named = ION_NAMES[key];
    const pieces = isotopePct(c.counts);
    const ev = ['generated composition, not a lookup: ' + c.formula + ' fits at ' +
      c.ppm.toFixed(1) + ' ppm with RDBE ' + c.rdbe.toFixed(1)];
    ev.push('even-electron parity holds (RDBE is ' + (z % 2 ? 'half-integral' : 'integral') +
      ' for charge ' + z + '), which removes about half of all mass-correct compositions for free');
    if (iso.a1pct != null) ev.push('predicted A+1 ' + pieces[0].toFixed(1) +
      '% against your measured ' + iso.a1pct + '%');
    if (iso.a2pct != null) ev.push('predicted A+2 (S/Cl/Br/K/Si window) ' + a2Window(c.counts).toFixed(1) +
      '% against your measured ' + iso.a2pct + '%');
    for (const e in iso.required) if (c.counts[e]) ev.push('carries the ' + e +
      ' that the B+1/B+2 exact mass demanded');
    for (const f of c.flags) ev.push('flagged: ' + f);
    const cav = [];
    if (!iso.a1pct && !iso.a2pct) cav.push('No measured isotope intensities, so this is constrained by mass and ' +
      'chemistry only. Entering B+1 and B+2 typically removes most of these candidates.');
    if (c.pen > 3) cav.push('chemically unusual for a background ion — treat as a long shot.');
    return {
      identity: named || ('composition ' + c.formula),
      species: '[' + c.formula + ']' + (z > 1 ? z : '') + (obs.polarity === 'neg' ? '-' : '+'),
      formula: c.formula, calc: c.calc, ppm: c.ppm, layer: 'formula',
      confidence: named ? 'medium' : (iso.a1pct != null || iso.a2pct != null) ? 'medium' : 'low',
      evidence: ev, caveats: cav, score: 1.0 + c.score * 0.25
    };
  });
}

/* ================================== layer 4 — companion / ladder / deconvolution */
const CARRIER_SETS = [
  { name: 'H', mass: EL.H }, { name: 'Na', mass: EL.Na },
  { name: 'NH4', mass: EL.N + 4 * EL.H }, { name: 'K', mass: EL.K }
];
const REPEATS = [
  { name: 'PEG / ethoxylate', mass: 44.0262 },
  { name: 'PPG', mass: 58.0419 },
  { name: 'cyclic siloxane (PDMS)', mass: 74.0188 },
  { name: 'CH₂ alkyl homologue', mass: 14.0157 }
];

/* ---------------------------------------------------- peak-list input parsing
   Two guards live here, and both exist because getting them wrong returns a
   confident WRONG answer rather than an error.

   1. The decimal comma. A European export writes siloxane D5 as "371,1012".
      Splitting the line on commas first turns that into 371.0000 -- a
      plausible-looking m/z that is 101 mDa (272 ppm) away from the truth, and
      the tool then names a different compound with no warning at all. The
      convention is therefore decided ONCE for the whole pasted block from
      unambiguous evidence, never guessed line by line, and whatever was
      assumed is stated on screen.
   2. Size. A peak list is pasted, so it can be arbitrarily long, and every
      stage downstream is synchronous. Past the cap the tab simply freezes. */
const MAX_PEAKS = 20000;       // peaks accepted from the paste box
const MAX_PEAK_ROWS = 500;     // result rows actually rendered

/* Evidence for which mark is the decimal point, gathered from one numeric run
   (a maximal stretch of digits, dots and commas). A thousands separator ALWAYS
   groups exactly three digits, so a mark followed by any other run length is a
   decimal point and can be nothing else. Runs that admit both readings, such
   as 1,234, contribute no evidence on purpose -- they are the ambiguous case,
   and counting them as evidence is exactly the guess this code must not make. */
function markEvidence(run, ev) {
  const hasDot = run.indexOf('.') >= 0, hasComma = run.indexOf(',') >= 0;
  if (hasDot && hasComma) {
    const li = Math.max(run.lastIndexOf('.'), run.lastIndexOf(','));
    const mark = run.charAt(li), head = run.slice(0, li), tail = run.slice(li + 1);
    // for the later mark to be the decimal point, the earlier one must be a
    // valid thousands separator throughout: 1,371.1012 and 1.371,1012
    const grouped = mark === ',' ? /^\d{1,3}(?:\.\d{3})+$/.test(head)
                                 : /^\d{1,3}(?:,\d{3})+$/.test(head);
    if (grouped && /^\d+$/.test(tail)) { ev[mark === ',' ? 'comma' : 'dot']++; return; }
    // it cannot be a decimal point, so it separates two columns
    // (371.1012,4500000 is m/z then intensity) -- judge the first column only
    markEvidence(head, ev);
    return;
  }
  const mark = hasDot ? '.' : hasComma ? ',' : '';
  if (!mark) return;
  const parts = run.split(mark);
  if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
    if (parts[1].length !== 3) ev[mark === ',' ? 'comma' : 'dot']++;   // 371,1012 / 371.1012
    else ev.grouped++;                                                 // 1,234 -- both readings work
    return;
  }
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(run)) ev.grouped++;               // 1.371.000
}

const numericRuns = line => (line.match(/\d[\d.,]*/g) || []).map(r => r.replace(/[.,]+$/, ''));

function decimalConvention(lines) {
  const ev = { dot: 0, comma: 0, grouped: 0 };
  lines.forEach(line => numericRuns(line).forEach(r => markEvidence(r, ev)));
  if (ev.dot && !ev.comma) return { mark: '.', note: '' };
  if (ev.comma && !ev.dot) return { mark: ',', note:
    'Decimal comma assumed: ' + ev.comma + ' value(s) here have a comma in front of something other than ' +
    'three digits, which no thousands separator ever does. Commas were read as decimal marks, not as ' +
    'column separators. If your file uses commas between columns, separate them with a tab or a semicolon.' };
  if (ev.dot && ev.comma) return { mark: '.', note:
    'This list mixes both conventions: ' + ev.dot + ' value(s) use a decimal point and ' + ev.comma +
    ' use a decimal comma. The decimal POINT was assumed and commas were treated as column separators, ' +
    'so any comma-decimal value was truncated at the comma. Check the m/z column below before trusting it, ' +
    'and re-paste in one convention.' };
  if (ev.grouped) {
    // Every comma in the block sits in front of exactly three digits, so
    // 371,101 could mean 371.101 or 371101 and nothing in the text decides it.
    // Break the tie on plausibility rather than on locale folklore: an m/z of
    // 371101 is outside anything this tool covers.
    let asDecimal = 0, asGroup = 0;
    lines.forEach(line => numericRuns(line).forEach(r => {
      if (!/^\d{1,3}(?:,\d{3})+$/.test(r)) return;
      const g = parseFloat(r.replace(/,/g, ''));
      if (g > 0 && g <= 100000) asGroup++;
      if (r.split(',').length === 2) { const d = parseFloat(r.replace(',', '.')); if (d > 0 && d <= 100000) asDecimal++; }
    }));
    if (!asDecimal && !asGroup) return { mark: '.', note: '' };
    const comma = asDecimal > asGroup;
    return { mark: comma ? ',' : '.', note:
      'Ambiguous decimal mark: every comma here groups exactly three digits, so 371,101 could mean 371.101 ' +
      'or 371101 and the text cannot decide it. It was read as ' + (comma ? 'a decimal comma' : 'a thousands/column separator') +
      ' because that is the reading which puts these values inside the m/z range this tool covers (' +
      (comma ? asDecimal : asGroup) + ' plausible vs ' + (comma ? asGroup : asDecimal) + '). ' +
      'Give the values to four decimals, or use a tab between columns, to remove the ambiguity.' };
  }
  return { mark: '.', note: '' };
}

/* Pull the m/z out of one line, given the block-wide decimal mark. */
function firstNumericToken(line, mark) {
  if (mark === ',') {
    // the comma is the decimal mark here, so it can never split columns
    let tok = line.split(/[;\t]|\s+/)[0].trim();
    if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(tok)) tok = tok.replace(/\./g, '');   // 1.371,1012
    return tok.replace(',', '.');
  }
  // genuine thousands grouping, anchored so "1,371.1012, 4.5e6" also works.
  // The trailing guard is what keeps 371,1012 out: a fourth digit after the
  // group means it was never a thousands separator.
  const g = line.match(/^\+?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/);
  if (g) return g[0].replace(/,/g, '');
  // first column only: m/z then intensity is the usual export shape
  return line.split(/[,;\t]|\s{2,}/)[0].trim();
}

function peakListValues() {
  const lines = ($('peaklist').value || '').split(/[\r\n]+/)
    .map(s => s.trim()).filter(Boolean);
  const conv = decimalConvention(lines);
  const out = [];
  let rejected = 0, overflow = 0;
  for (const line of lines) {
    const tok = firstNumericToken(line, conv.mark);
    // whole token must be a number, optionally in scientific notation
    if (!/^\+?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(tok)) { rejected++; continue; }
    const v = parseFloat(tok);
    if (!isFinite(v) || v <= 0 || v > 100000) { rejected++; continue; }
    if (out.length >= MAX_PEAKS) { overflow++; continue; }
    out.push(v);
  }
  out.rejected = rejected;
  out.overflow = overflow;          // valid peaks dropped by the cap, never silently
  out.convention = conv;
  return out;
}

function layerCompanion(obs, iso) {
  const z = obs.charge, pol = obs.polarity;
  const peaks = peakListValues();
  const near = (v, t) => peaks.some(p => Math.abs(p - v) <= (t || 0.02));
  const ev = [], cav = [], checks = [];

  // deconvolution: never assume protonation
  const neutrals = [];
  if (z >= 1) {
    for (const c of CARRIER_SETS) {
      if (pol === 'neg' && c.name !== 'H') continue;
      const M = pol === 'pos'
        ? obs.mz * z + z * ELECTRON - z * c.mass
        : obs.mz * z - z * ELECTRON + z * c.mass;
      if (M > 0) neutrals.push({ label: '[M+' + (z > 1 ? z : '') + c.name + ']' + (z > 1 ? z : '') + '+', M: M, name: c.name });
    }
    if (pol === 'neg') {
      const M = obs.mz * z - z * ELECTRON + z * EL.H;
      neutrals.length = 0;
      neutrals.push({ label: '[M-' + (z > 1 ? z : '') + 'H]' + (z > 1 ? z : '') + '-', M: M, name: 'H' });
    }
    if (pol === 'pos' && z === 2) {
      const M = obs.mz * 2 + 2 * ELECTRON - EL.H - EL.Na;
      neutrals.push({ label: '[M+H+Na]2+', M: M, name: 'H+Na' });
    }
  }
  if (z > 1 && neutrals.length) {
    ev.push('At z = ' + z + ' the neutral mass depends entirely on what the ion picked up, and polymers take ' +
      'multiple sodiums at least as readily as multiple protons: ' +
      neutrals.map(n => n.label + ' → M = ' + n.M.toFixed(4)).join(' · '));
  }

  // ladder companions, spacing divided by charge
  for (const rep of REPEATS) {
    const step = rep.mass / z;
    if (near(obs.mz + step) && near(obs.mz - step)) {
      ev.push('your peak list contains neighbours at ±' + step.toFixed(4) +
        ' — that is the ' + rep.name + ' repeat of ' + rep.mass.toFixed(4) +
        (z > 1 ? ' divided by the charge ' + z : '') + ', so this is a polymer envelope');
    } else {
      checks.push('a ' + rep.name + ' envelope would put neighbours at ' +
        (obs.mz - step).toFixed(4) + ' and ' + (obs.mz + step).toFixed(4) +
        (z > 1 ? ' (repeat ' + rep.mass.toFixed(4) + ' ÷ ' + z + ')' : ''));
    }
  }

  if (pol === 'pos') {
    const naPartner = obs.mz + NA_H / z;
    if (near(naPartner)) ev.push('a sodiated partner is present at ' + naPartner.toFixed(4) +
      ' (+' + (NA_H / z).toFixed(5) + '). The Na/H intensity ratio is the sharpest single discriminator there is: ' +
      'solvent clusters sit near 10⁻³, genuine molecules near 10⁻¹ — read it off and decide.');
    else checks.push('the sodiated partner would be at ' + naPartner.toFixed(4) +
      '; its intensity ratio to this peak separates a solvent cluster (~10⁻³) from a molecule (~10⁻¹)');
  }
  const dimer = (2 * obs.mz * z - (pol === 'pos' ? PROTON : -PROTON)) / z;
  checks.push('a proton-bound dimer would appear near ' + dimer.toFixed(4));
  const waterLoss = obs.mz - 18.0105646 / z;
  if (near(waterLoss)) ev.push('an in-source water loss is present at ' + waterLoss.toFixed(4));
  else checks.push('an in-source water loss would be at ' + waterLoss.toFixed(4));
  const cross = pol === 'pos' ? obs.mz - 2 * PROTON / z : obs.mz + 2 * PROTON / z;
  checks.push('the cross-polarity partner of the same neutral would be near ' + cross.toFixed(4) +
    ' in ' + (pol === 'pos' ? 'negative' : 'positive') + ' mode');

  if (!ev.length && !checks.length) return [];
  return [{
    identity: 'Companion evidence — what would settle this',
    species: '', formula: '', calc: null, basis: 'calc', ppm: null, layer: 'companion',
    confidence: ev.length ? 'medium' : 'low',
    evidence: ev.length ? ev : ['nothing in the Peak list tab matched a companion; paste your full peak list there and this layer will check for them automatically'],
    caveats: cav, checks: checks, score: 4
  }];
}

/* ============================================================ guard 5 — co-isolation */
function coIsolation(obs) {
  const width = 0.5;
  const out = [];
  for (const r of ROWS) {
    if (obs.polarity && r[F.pol] !== obs.polarity) continue;
    const d = r[F.mz] - obs.mz;
    if (Math.abs(d) > width || Math.abs(d) <= obs.tol) continue;
    out.push(r);
  }
  out.sort((a, b) => Math.abs(a[F.mz] - obs.mz) - Math.abs(b[F.mz] - obs.mz));
  const uniq = [], seen = {};
  for (const r of out) { if (!seen[r[F.name]]) { seen[r[F.name]] = 1; uniq.push(r); } }
  return uniq.slice(0, 4);
}

/* =================================================================== rendering */
function chip(text, cls) { return el('span', 'chip ' + (cls || ''), text); }

const LAYER_LABEL = { library: 'library', cluster: 'mobile-phase cluster',
  formula: 'formula generation', companion: 'companion logic' };

function explanationCard(x, obs) {
  const c = el('div', 'card exp exp-' + x.layer);
  const top = el('div', 'card-top');
  const nom = x.basis === 'nominal';
  top.append(el('span', 'card-mz',
    x.calc == null ? '—' : (nom ? '~' + Math.round(x.calc) : fmt(x.calc))));
  if (nom) top.append(chip('nominal mass only', 'warn'));
  top.append(el('span', 'card-name', x.identity));
  if (x.ppm != null) top.append(el('span', 'delta',
    (x.ppm >= 0 ? '+' : '') + x.ppm.toFixed(1) + ' ppm'));
  c.append(top);

  const chips = el('div', 'chips');
  chips.append(chip(LAYER_LABEL[x.layer], 'layer-' + x.layer));
  if (x.species) chips.append(chip(x.species, 'mono'));
  if (x.formula) chips.append(chip(x.formula, 'mono'));
  chips.append(chip('confidence: ' + x.confidence,
    x.confidence === 'high' ? 'good' : x.confidence === 'low' ? 'warn' : ''));
  if (x.row && x.row[F.cat]) chips.append(chip(prettyCat(x.row[F.cat])));
  c.append(chips);

  if (x.evidence && x.evidence.length) {
    const b = el('div', 'ev-block');
    b.append(el('div', 'ev-title', 'Evidence'));
    const ul = el('ul', 'ev-list');
    x.evidence.forEach(t => ul.append(el('li', null, t)));
    b.append(ul); c.append(b);
  }
  if (x.checks && x.checks.length) {
    const b = el('div', 'ev-block');
    b.append(el('div', 'ev-title', 'Look for these next'));
    const ul = el('ul', 'ev-list');
    x.checks.forEach(t => ul.append(el('li', null, t)));
    b.append(ul); c.append(b);
  }
  if (x.caveats && x.caveats.length) {
    const b = el('div', 'ev-block caveats');
    b.append(el('div', 'ev-title', 'Caveats'));
    const ul = el('ul', 'ev-list');
    x.caveats.forEach(t => ul.append(el('li', null, t)));
    b.append(ul); c.append(b);
  }
  if (x.row) { const cite = citationBlock(x.row); if (cite) c.append(cite); }

  if (x.row) {
    const r = x.row;
    const det = el('details');
    det.append(el('summary', null, 'Library details, sources and how to confirm'));
    const g = el('div', 'detail-grid');
    const row = (k, v) => { if (!v && v !== 0) return; const d = el('div');
      d.append(el('span', 'dk', k), el('span', null, String(v))); g.append(d); };
    row('Likely origin', r[F.origin]);
    row('Ion composition', optCol(r, 'ionf'));
    row('Also arises from', splitList(optCol(r, 'altn')).join(', '));
    row('Also reported from', splitList(optCol(r, 'alto')).join('; '));
    row('Also written as', splitList(optCol(r, 'alta')).join(', '));
    row('Reported by', r[F.src] === 'memory+web' ? 'independent recall and published sources'
        : r[F.src] === 'web' ? 'published sources' : 'domain knowledge');
    row('Confidence', r[F.conf]);
    row('Charge', r[F.charge]);
    if (r[F.m2] != null) row('Predicted isotopes', 'M+1 ' + r[F.m1] + '% · M+2 ' + r[F.m2] + '%');
    if (r[F.logp] != null) row('logP (XLogP)', r[F.logp] + ' — expect to elute ' + r[F.elution]);
    if (r[F.rmd]) row('Relative mass defect', r[F.rmd] + ' ppm');
    if (r[F.nnb]) row('Competing structures', r[F.nnb] + ' other known compounds within 5 ppm');
    if (r[F.ms2n]) row('MS2 availability', r[F.ms2n] + ' public spectra');
    row('Notes', r[F.note]);
    det.append(g);
    if (r[F.fam] && r[F.spacing]) {
      const l = el('div', 'ladder');
      l.append(el('strong', null, r[F.fam]));
      l.append(document.createTextNode(' — members are ' + fmt(r[F.spacing]) + ' apart' +
        (obs.charge > 1 ? ', i.e. ' + (r[F.spacing] / obs.charge).toFixed(4) + ' in m/z at ' + obs.charge + '+' : '') + '. '));
      const jump = (mz, label) => {
        if (!mz) return;
        const b = el('button', 'ladder-link', label + ' ' + fmt(mz));
        b.onclick = () => { $('q').value = fmt(mz) + (obs.polarity === 'neg' ? '-' : '+'); run();
          window.scrollTo({ top: 0, behavior: 'smooth' }); };
        l.append(b, document.createTextNode(' '));
      };
      jump(r[F.prev_mz], '← previous');
      jump(r[F.next_mz], 'next →');
      det.append(l);
    }
    c.append(det);
  }
  return c;
}

function showWelcome() {
  const box = $('cards'); box.textContent = '';
  const e = el('div', 'empty');
  e.append(el('h3', null, 'Start with the tallest peak of the cluster'));
  e.append(el('p', null, 'Give it a polarity, and a charge if you know one. Try:'));
  const ex = el('div', 'examples');
  [['116.9286-', 'a chromate — and the reason A+1 is not only 13C'],
   ['89.5069+', 'returns nothing if you assume 1+'],
   ['112.9857-', 'two answers, and mass cannot separate them'],
   ['371.1012+', 'cyclic siloxane D5'],
   ['PEG', 'browse a family']].forEach(v => {
    const b = el('button', 'ghost-btn', v[0]);
    b.title = v[1];
    b.onclick = () => { $('q').value = v[0]; run(); };
    ex.append(b);
  });
  e.append(ex);
  box.append(e);
}

function showCards(hits, headline) {
  const box = $('cards'); box.textContent = '';
  $('status').textContent = headline;
  const limit = 60;
  hits.slice(0, limit).forEach(h => box.append(libraryCard(h)));
  if (hits.length > limit)
    box.append(el('p', 'status', 'Showing the top ' + limit + ' of ' + hits.length + ' matches.'));
}

function libraryCard(hit) {
  const r = hit.r, c = el('div', 'card ' + r[F.pol]);
  const top = el('div', 'card-top');
  // A source that published a nominal integer mass must never be rendered to
  // four decimals: "45.0000" for formate reads as an exact mass but is 40 ppm
  // from the true 44.9982, which would falsify the site's central claim.
  const nominal = F.basis != null && r[F.basis] === 'nominal';
  top.append(el('span', 'card-mz', nominal ? '~' + Math.round(r[F.mz]) : fmt(r[F.mz])));
  top.append(el('span', 'card-name', r[F.name]));
  if (nominal) top.append(chip('nominal mass only', 'warn'));
  c.append(top);
  const chips = el('div', 'chips');
  chips.append(chip(r[F.pol] === 'pos' ? 'positive' : 'negative', 'pol-' + r[F.pol]));
  if (r[F.adduct]) chips.append(chip(r[F.adduct], 'mono'));
  if (r[F.formula]) chips.append(chip(r[F.formula], 'mono'));
  if (r[F.cat]) chips.append(chip(prettyCat(r[F.cat])));
  if (r[F.charge] && String(r[F.charge]) !== '1') chips.append(chip('charge ' + r[F.charge], 'strong'));
  c.append(chips);
  if (r[F.origin]) c.append(el('p', 'why', r[F.origin]));
  const alt = altBlock(r);
  if (alt) c.append(alt);
  const cite = citationBlock(r);
  if (cite) c.append(cite);
  return c;
}

function searchText(q) {
  const out = [];
  for (const r of ROWS) {
    if (!passesFilters(r)) continue;
    // merged rows must stay findable under every name and origin they absorbed
    const hay = (r[F.name] + ' ' + r[F.formula] + ' ' + r[F.cat] + ' ' + r[F.fam] + ' ' + r[F.origin] +
      ' ' + optCol(r, 'syn') + ' ' + optCol(r, 'altn') + ' ' + optCol(r, 'alto') +
      ' ' + optCol(r, 'ionf')).toLowerCase();
    const i = hay.indexOf(q);
    if (i >= 0) out.push({ r: r, delta: null, rank: i + (r[F.name].toLowerCase().startsWith(q) ? -100 : 0) });
  }
  out.sort((a, b) => a.rank - b.rank || prominence(b.r) - prominence(a.r));
  return out;
}

/* ================================================================ main flow */
function buildObservation(q) {
  const obs = {
    mz: q.mz, decimals: q.decimals,
    polarity: q.polarity || $('polarity').value || 'pos',
    charge: q.charge, chargeGiven: q.charge != null,
    b1mz: num('b1mz'), b1pct: num('b1pct'),
    b2mz: num('b2mz'), b2pct: num('b2pct'),
    below: $('belowB0').checked, rt: num('rtMin'), adduct: q.adduct
  };
  obs.b1decimals = ($('b1mz').value.split('.')[1] || '').length;
  obs.b2decimals = ($('b2mz').value.split('.')[1] || '').length;
  obs.polarityGiven = !!(q.polarity || $('polarity').value);
  const inf = obs.chargeGiven ? null : inferCharge(obs.mz, obs.b1mz);
  if (!obs.chargeGiven) { obs.charge = inf.z; obs.chargeInference = inf; }
  else if (obs.b1mz != null) {
    const check = inferCharge(obs.mz, obs.b1mz);
    if (check.z !== obs.charge && check.strength === 'strong') obs.chargeConflict = check;
  }
  obs.tol = toleranceFor(obs.mz, obs.decimals);
  obs.ppmTol = obs.tol / obs.mz * 1e6;
  return obs;
}

function explain(obs) {
  const iso = interpretIsotopes(obs);
  let all = [];
  all = all.concat(layerLibrary(obs, iso));
  all = all.concat(layerClusters(obs, iso));
  all = all.concat(layerFormula(obs, iso));
  // Do not repeat an ion the library already named. The generated candidate is
  // an ION composition, so it has to be compared against the library row's ion
  // composition as well as its neutral formula -- otherwise "sodium formate +
  // formate cluster, C2H2NaO4" is offered twice at 112.9856, once as a library
  // hit written [2M+Na-2H]- of CH2O2 and once as a generated composition.
  const libFormulas = {};
  all.forEach(x => {
    if (x.layer !== 'library') return;
    if (x.formula) libFormulas[x.formula] = 1;
    const ionf = x.row ? optCol(x.row, 'ionf') : '';
    if (ionf) libFormulas[ionf] = 1;
  });
  all = all.filter(x => !(x.layer === 'formula' && libFormulas[x.formula]));
  all.sort((a, b) => a.score - b.score);
  const companion = layerCompanion(obs, iso);
  return { iso: iso, explanations: all, companion: companion };
}

function renderExplanations(obs, res) {
  const box = $('cards'); box.textContent = '';
  const list = res.explanations;
  const polText = obs.polarity === 'pos' ? 'positive' : 'negative';

  const head = el('div', 'card summary-card');
  head.append(el('div', 'card-name', 'm/z ' + obs.mz + ' · ' + polText + ' · charge ' + obs.charge));
  const sub = el('div', 'chips');
  sub.append(chip('± ' + (obs.tol < 0.01 ? obs.ppmTol.toFixed(0) + ' ppm' : obs.tol.toFixed(3) + ' Da')));
  sub.append(chip(obs.chargeGiven ? 'charge as you typed it' : 'charge inferred',
    obs.chargeGiven ? '' : 'warn'));
  sub.append(chip(list.length + ' explanation' + (list.length === 1 ? '' : 's')));
  head.append(sub);
  const notes = [];
  if (obs.chargeInference) notes.push('Charge: ' + obs.chargeInference.why + '.');
  if (obs.chargeInference && obs.chargeInference.possible)
    notes.push('z = ' + obs.chargeInference.possible + ' is also possible; the fractional part alone cannot ' +
      'assert a charge above 2. The B+1 m/z can.');
  if (obs.chargeConflict) notes.push('Warning: the B+1 spacing says z = ' + obs.chargeConflict.z +
    ', not the ' + obs.charge + ' you specified.');
  if (!obs.polarityGiven) notes.push('No polarity given, so positive was assumed — add + or - to be sure.');
  res.iso.notes.forEach(n => notes.push(n.charAt(0).toUpperCase() + n.slice(1) + '.'));
  if (notes.length) {
    const ul = el('ul', 'ev-list');
    notes.forEach(t => ul.append(el('li', null, t)));
    head.append(ul);
  }
  if (res.iso.evidence.length) {
    const b = el('div', 'ev-block');
    b.append(el('div', 'ev-title', 'What the isotope pattern says'));
    const ul = el('ul', 'ev-list');
    res.iso.evidence.forEach(t => ul.append(el('li', null, t)));
    b.append(ul); head.append(b);
  }
  const guards = res.iso.caveats.slice();
  const co = coIsolation(obs);
  if (co.length) guards.push('Co-isolation: ' + co.map(r => r[F.name] + ' at ' + fmt(r[F.mz])).join(', ') +
    ' lie within a typical ±0.5 Da isolation window. A blended MS2 produces confident wrong library matches — ' +
    'narrow the window or check the precursor purity before trusting any MS2 identification.');
  if (guards.length) {
    const b = el('div', 'ev-block caveats');
    b.append(el('div', 'ev-title', 'Caveats that apply to everything below'));
    const ul = el('ul', 'ev-list');
    guards.forEach(t => ul.append(el('li', null, t)));
    b.append(ul); head.append(b);
  }
  box.append(head);

  if (!list.length) {
    box.append(el('p', 'empty', 'No layer could explain this ion at ±' +
      obs.tol.toFixed(4) + ' Da. Widen the tolerance, check the polarity and charge, ' +
      'or enter the B+1 m/z — it fixes the charge and names the element behind A+1.'));
  } else {
    const distinct = new Set(list.map(x => x.identity)).size;
    if (distinct > 1) {
      const note = el('p', 'isobaric-note');
      note.textContent = 'Isobaric alternatives — all ' + distinct + ' of these fit your mass. ' +
        'They are listed side by side and deliberately not resolved: mass alone cannot separate ' +
        'trifluoroacetate (C2F3O2⁻) from a sodium formate cluster (C2H2NaO4⁻), both 112.9856. ' +
        'Candidates that are the SAME ion by elemental composition — protonated ' +
        'N-methylpyrrolidone and the acetone/acetonitrile cluster are both C5H10NO⁺ — appear ' +
        'instead as one card listing every contaminant it can come from. ' +
        'Use the companion evidence at the bottom to choose.';
      box.append(note);
    }
    list.slice(0, 14).forEach(x => box.append(explanationCard(x, obs)));
  }
  res.companion.forEach(x => box.append(explanationCard(x, obs)));

  $('status').textContent = list.length
    ? list.length + ' explanation' + (list.length === 1 ? '' : 's') + ' for m/z ' + obs.mz + ' (' + polText + ', ' + obs.charge + ')'
    : 'No explanation found for m/z ' + obs.mz + '.';
}


// A failed or stalled load must produce a refusal, not a confident negative.
function libraryUnavailable() {
  if (DATA_READY) return false;
  const box = $('cards');
  if (box) box.textContent = '';
  const st = $('status');
  if (st) {
    st.innerHTML = '<strong>The contaminant library is not loaded, so no answer can be given.</strong> ' +
      'Reload the page. Nothing here means &quot;not a contaminant&quot; \u2014 it means the data is missing.';
  }
  const dl = $('downloadList');
  if (dl) dl.hidden = true;
  return true;
}

function run() {
  if (libraryUnavailable()) return;
  const q = parseBasePeak($('q').value);
  // replaceState, not assignment: assigning to location.hash pushes a new
  // history entry on every debounced keystroke, so Back stopped working.
  try {
    history.replaceState(null, '',
      $('q').value ? '#' + encodeURIComponent($('q').value) : location.pathname);
  } catch (e) { /* file:// and some embeds disallow this; harmless */ }
  updateBadges();

  if (q.kind === 'empty') { $('status').textContent = ''; $('parseHint').textContent =
    'Type the m/z of the tallest peak in the cluster, with polarity and charge: 371+, 371 2+, 371(3+), 371 z=5, [M+H]+ 371.1012.';
    showWelcome(); return; }

  if (q.kind === 'chargeAmbiguous') {
    $('parseHint').innerHTML = '<strong>Charge is not written that way here.</strong> <code>' +
      q.raw.replace(/</g, '&lt;') + '</code> reads as arithmetic, and <em>M+1</em> already means the first ' +
      'isotope everywhere else in this app. Write the charge as <code>' + q.mz + ' 2+</code>, ' +
      '<code>' + q.mz + '(2+)</code> or <code>' + q.mz + ' z=2</code>.';
    $('cards').textContent = ''; $('status').textContent = '';
    return;
  }
  if (q.kind === 'badCharge') {
    $('parseHint').textContent = 'Charge ' + q.z + ' is outside the supported range of 1 to 8.';
    $('cards').textContent = ''; $('status').textContent = '';
    return;
  }
  if (q.kind === 'text') {
    const hits = searchText(q.text);
    $('parseHint').textContent = 'Searching names, formulas and classes for “' + q.text + '”.';
    showCards(hits, hits.length + ' entries matching “' + q.text + '”.');
    return;
  }

  const obs = buildObservation(q);
  $('parseHint').innerHTML = 'Base peak <code>' + obs.mz + '</code>, ' +
    (obs.polarity === 'pos' ? 'positive' : 'negative') + ', charge <code>' + obs.charge + '</code>' +
    (obs.chargeGiven ? '' : ' (inferred)') + ', ± ' +
    (obs.tol < 0.01 ? obs.ppmTol.toFixed(0) + ' ppm' : obs.tol.toFixed(3) + ' Da') + '.';
  renderExplanations(obs, explain(obs));
}

/* ------------------------------------------------------------- peak list mode */
/* Series spacing is divided by charge: a 3+ PEG envelope steps by 14.6754, and
   an analyst staring at 14.68 will not recognise it as PEG unless told. */
/* Tolerance for matching a SPACING. A spacing is a difference of two measured
   masses, so it carries both peaks' error -- but it is still a mass difference
   on a mass spectrometer, not a free parameter. */
function seriesTol(step) {
  // A quadrupole or trap reports nominal masses: the siloxane repeat 74.0188
  // and the CH2-family spacing 74.1353 both read as "74", and no window will
  // separate them. Half a nominal unit is the honest answer, matching what
  // toleranceFor() already does for unit-resolution matching.
  if (unitResolution()) return 0.4;
  // High resolution. The old window was step * 0.002 -- 2000 ppm, +-0.148 Da on
  // a 74 Da repeat. That is 1.3x the ENTIRE 0.1165 Da gap between the siloxane
  // and CH2 repeats, so every alkyl homologue ladder was reported as PDMS.
  //
  // Floor of 0.0025 Da: 10 ppm of a 44.0262 ethoxylate step is only 0.44 mDa,
  // tighter than a real difference of two centroids, so a ppm-only rule would
  // miss genuine low-mass ladders. Two peak positions each good to ~1 mDa
  // (routine for a centroided Orbitrap peak; a peak list quoted to 4 decimals
  // adds +-0.05 mDa of quantisation) subtract to ~1.4 mDa, so 0.0025 Da is a
  // ~2-sigma allowance. It is 59x tighter than the old window and still 23x
  // smaller than the 0.1165 Da separation this detector has to preserve.
  const floor = 0.0025;
  const mode = $('tolMode') ? $('tolMode').value : 'auto';
  const val = parseFloat($('tolValue') ? $('tolValue').value : '');
  if (mode === 'ppm' && val > 0) return Math.max(step * val / 1e6, floor);
  // A user-set Da window is honoured, but capped at 0.05: half the gap between
  // the repeats above is 0.058 Da, so a wider spacing window could not tell
  // them apart at all and would reinstate the defect this replaces.
  if (mode === 'da' && val > 0) return Math.min(Math.max(val, floor), 0.05);
  return Math.max(step * 10 / 1e6, floor);
}

/* Two passes, because one greedy pass gets both the chains and the ownership
   wrong. Pass 1 enumerates the MAXIMAL chain through every peak for each
   repeat/charge -- each peak has at most one successor at a fixed spacing, so
   the chains of one repeat are disjoint by construction and no near-duplicate
   sub-chains are produced. Pass 2 hands peaks out best-first across ALL repeat
   families, so a peak that has been explained as PDMS can no longer also be
   sold as a KCl cluster. */
function detectSeries(mzs) {
  let sorted = [...new Set(mzs)].sort((a, b) => a - b);
  if (sorted.length > MAX_PEAKS) sorted = sorted.slice(0, MAX_PEAKS);
  const n = sorted.length;
  if (n < 3) return [];
  const reps = REPEATS.concat(LADDERS.map(l => ({ name: l[0], mass: l[1] })));
  const seenRep = {};
  const cands = [];
  const next = new Int32Array(n), head = new Uint8Array(n);

  for (const rep of reps) {
    if (!rep.mass || seenRep[rep.name]) continue;
    seenRep[rep.name] = 1;
    for (let z = 1; z <= 4; z++) {
      const step = rep.mass / z;
      if (step < 3) continue;
      const tol = seriesTol(step);
      // sorted[i] + step is monotonic in i because sorted is sorted, so one
      // forward pointer finds every successor in a single O(n) sweep. The old
      // code rescanned the whole tail from every start index: O(n^2) per
      // repeat per charge, ~30 x 4 times over.
      next.fill(-1); head.fill(1);
      let p = 1;
      for (let i = 0; i < n; i++) {
        const t = sorted[i] + step;
        if (p <= i) p = i + 1;
        while (p < n && sorted[p] < t - tol) p++;
        let best = -1, bestd = tol;
        for (let q = p; q < n && sorted[q] <= t + tol; q++) {
          const d = Math.abs(sorted[q] - t);
          if (d <= bestd) { bestd = d; best = q; }
        }
        next[i] = best;
        if (best >= 0) head[best] = 0;      // it has a predecessor, so it starts nothing
      }
      for (let i = 0; i < n; i++) {
        if (!head[i] || next[i] < 0) continue;
        const idx = [i]; let resid = 0, cur = i;
        while (next[cur] >= 0) { resid += Math.abs(sorted[next[cur]] - sorted[cur] - step); cur = next[cur]; idx.push(cur); }
        if (idx.length < 3) continue;
        cands.push({ name: rep.name, z: z, step: step, repeat: rep.mass, idx: idx,
                     resid: resid / (idx.length - 1) });
      }
    }
  }

  // longest chain first, then the tighter mean residual, then the larger
  // repeat (a 74 Da ladder explains more than the CH2 sub-pattern inside it),
  // then the name -- fully deterministic, never array order.
  cands.sort((a, b) => b.idx.length - a.idx.length || a.resid - b.resid ||
                       b.repeat - a.repeat || (a.name < b.name ? -1 : a.name > b.name ? 1 : a.z - b.z));
  const claimed = new Uint8Array(n);
  const found = [];
  for (const c of cands) {
    if (found.length >= 12) break;
    let free = true;
    for (const i of c.idx) if (claimed[i]) { free = false; break; }
    if (!free) continue;                       // exclusive: one peak, one explanation
    for (const i of c.idx) claimed[i] = 1;
    found.push({ name: c.name, z: c.z, step: c.step, repeat: c.repeat,
                 resid: c.resid, members: c.idx.map(i => sorted[i]) });
  }
  return found;
}

function runPeakList() {
  if (libraryUnavailable()) return;
  const mzs = peakListValues();
  if (!mzs.length) { $('status').textContent = 'No numbers found in that list.'; return; }

  const pol = $('polarity').value;
  const results = mzs.map(mz => {
    const tol = toleranceFor(mz, 4);
    const hits = searchMz(mz, tol, pol);
    return { mz: mz, best: hits[0] || null, n: hits.length };
  });

  const box = $('cards'); box.textContent = '';
  const matched = results.filter(r => r.best).length;
  $('status').textContent = matched + ' of ' + mzs.length + ' peaks matched a known contaminant.';

  // Anything the parser had to assume, or anything it dropped, is stated here.
  // el() writes through textContent, which is how every other string from the
  // data or the user reaches the DOM in this file -- it escapes by construction.
  const notes = [];
  if (mzs.convention && mzs.convention.note) notes.push(mzs.convention.note);
  if (mzs.overflow) notes.push('Peak-list cap reached: the first ' + MAX_PEAKS.toLocaleString() +
    ' peaks were processed and ' + mzs.overflow.toLocaleString() + ' further valid peaks were ignored. ' +
    'Everything here is synchronous and runs in your browser; past this size the tab stops responding. ' +
    'Split the list if you need the rest.');
  if (mzs.rejected) notes.push(mzs.rejected.toLocaleString() + ' line(s) held nothing readable as an m/z and were skipped.');
  if (notes.length) {
    const nb = el('div', 'card');
    nb.append(el('div', 'card-name', 'How this list was read'));
    notes.forEach(t => nb.append(el('p', 'why', t)));
    box.append(nb);
  }

  const series = detectSeries(mzs);
  if (series.length) {
    const h = el('div', 'card');
    h.append(el('div', 'card-name', 'Homologous series detected'));
    for (const s of series) {
      const d = el('div', 'series-line');
      d.append(el('strong', null, s.name + (s.z > 1 ? ' at ' + s.z + '+' : '')));
      d.append(document.createTextNode(' — ' + s.members.length + ' peaks, spacing ' +
        s.step.toFixed(4) + (s.z > 1 ? ' (repeat ' + s.repeat.toFixed(4) + ' ÷ ' + s.z +
        ', which is why it does not look like ' + s.repeat.toFixed(2) + ')' : '') + ': '));
      d.append(el('span', 'mono-small', s.members.map(m => m.toFixed(4)).join(', ')));
      h.append(d);
    }
    box.append(h);
  }

  const tbl = el('table', 'peaks');
  tbl.innerHTML = '<thead><tr><th class="num">your m/z</th><th>best match</th>' +
    '<th class="num">Δ ppm</th><th>class</th><th class="num">other candidates</th></tr></thead>';
  const tb = el('tbody');
  for (const res of results.slice(0, MAX_PEAK_ROWS)) {
    const tr = el('tr');
    tr.append(el('td', 'num', fmt(res.mz)));
    if (res.best) {
      const r = res.best.r;
      tr.append(el('td', null, r[F.name] + ' ' + (r[F.adduct] || '')));
      tr.append(el('td', 'num', ((res.best.delta / r[F.mz]) * 1e6).toFixed(1)));
      tr.append(el('td', null, prettyCat(r[F.cat])));
      tr.append(el('td', 'num', res.n - 1 || ''));
    } else {
      const td = el('td', null, 'no match'); td.colSpan = 4; td.style.color = 'var(--muted)';
      tr.append(td);
    }
    tb.append(tr);
  }
  tbl.append(tb);
  const wrap = el('div', 'scroll-x'); wrap.append(tbl); box.append(wrap);
  // Truncating a results table without saying so reads as "that was all of it".
  if (results.length > MAX_PEAK_ROWS)
    box.append(el('p', 'status', 'Showing the first ' + MAX_PEAK_ROWS.toLocaleString() + ' of ' +
      results.length.toLocaleString() + ' peaks. The CSV download contains all ' +
      results.length.toLocaleString() + '.'));

  const btn = $('downloadList');
  btn.hidden = false;
  btn.onclick = () => {
    const rows = [['query_mz', 'match', 'adduct', 'formula', 'delta_ppm', 'class', 'family', 'n_candidates']];
    results.forEach(res => rows.push(res.best ? [res.mz, res.best.r[F.name], res.best.r[F.adduct],
      res.best.r[F.formula], ((res.best.delta / res.best.r[F.mz]) * 1e6).toFixed(2),
      res.best.r[F.cat], res.best.r[F.fam], res.n] : [res.mz, 'no match', '', '', '', '', '', 0]));
    const csv = rows.map(r => r.map(v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'contaminant-matches.csv'; a.click();
  };
}

/* ---------------------------------------------------------- delta explainer */
const ISOTOPE_GAPS = [
  [1.003355, '¹³C — one carbon isotope apart, so this ion is singly charged'],
  [0.501677, '¹³C at charge 2 — doubly charged envelope'],
  [0.334452, '¹³C at charge 3 — triply charged envelope'],
  [0.250839, '¹³C at charge 4'],
  [0.200671, '¹³C at charge 5'],
  [0.167226, '¹³C at charge 6'],
  [0.143336, '¹³C at charge 7'],
  [0.125419, '¹³C at charge 8'],
  [0.999568, '²⁹Si — silicon, not carbon; 0.0038 below the ¹³C offset'],
  [0.999388, '³³S — sulfur'],
  [1.000142, '⁵³Cr — chromium; look for ⁵⁰Cr two below as well'],
  [1.000457, '⁵⁷Fe — iron; look for ⁵⁴Fe two below as well'],
  [1.995796, '³⁴S − ³²S — sulfur'],
  [1.997050, '³⁷Cl − ³⁵Cl — chlorine'],
  [1.997954, '⁸¹Br − ⁷⁹Br — bromine'],
  [1.996844, '³⁰Si − ²⁸Si — silicon (siloxane?)'],
  [2.006710, 'two ¹³C — no heteroatom needed'],
  [1.995327, '⁵⁴Fe below the base peak — iron'],
  [1.994463, '⁵⁰Cr below the base peak — chromium'],
  [0.996368, '¹⁰B below the base peak — boron'],
  [1.000882, '⁶Li below the base peak — lithium']
];
const ADDUCT_GAPS = [
  [21.981944, '[M+Na]⁺ − [M+H]⁺ — sodiated vs protonated'],
  [37.955882, '[M+K]⁺ − [M+H]⁺ — potassiated'],
  [15.973945, '[M+K]⁺ − [M+Na]⁺'],
  [17.026549, '[M+NH₄]⁺ − [M+H]⁺'],
  [18.010565, 'water — hydrate/cluster or a neutral loss of H₂O'],
  [32.026215, 'methanol adduct or loss'],
  [41.026549, 'acetonitrile adduct or loss'],
  [46.005479, 'formic acid adduct or loss'],
  [60.021129, 'acetic acid adduct or loss'],
  [113.992864, 'trifluoroacetic acid (TFA) adduct']
];
const NEUTRAL_LOSSES = [
  [17.026549, 'NH₃'], [18.010565, 'H₂O'], [27.994915, 'CO'], [28.031300, 'C₂H₄'],
  [30.010565, 'CH₂O'], [35.976678, 'HCl'], [42.010565, 'C₂H₂O (ketene)'],
  [43.989829, 'CO₂'], [46.005479, 'HCOOH'], [60.021129, 'CH₃COOH'],
  [79.956815, 'SO₃'], [79.966331, 'HPO₃'], [97.976896, 'H₃PO₄'],
  [162.052824, 'hexose (glycoside)'], [176.032088, 'glucuronide'],
  [15.023475, 'CH₃'], [16.031300, 'CH₄ — classic siloxane in-source loss']
];

function runDelta() {
  let d = parseFloat($('dDelta').value);
  const a = parseFloat($('d1').value), b = parseFloat($('d2').value);
  if (isNaN(d) && !isNaN(a) && !isNaN(b)) d = Math.abs(b - a);
  if (isNaN(d)) { $('status').textContent = 'Enter two m/z values, or the difference between them.'; return; }
  d = Math.abs(d);
  const tol = d < 2.5 ? 0.004 : 0.01;
  const box = $('cards'); box.textContent = '';
  $('status').textContent = 'Explanations for a gap of ' + d.toFixed(4) + '.';

  const found = [];
  ISOTOPE_GAPS.forEach(g => { if (Math.abs(g[0] - d) <= tol) found.push(['Isotope spacing', g[0], g[1]]); });
  ADDUCT_GAPS.forEach(g => { if (Math.abs(g[0] - d) <= 0.01) found.push(['Adduct difference', g[0], g[1]]); });
  NEUTRAL_LOSSES.forEach(g => { if (Math.abs(g[0] - d) <= 0.01) found.push(['Neutral loss', g[0], 'loss of ' + g[1]]); });
  LADDERS.forEach(l => {
    for (let z = 1; z <= 4; z++) {
      const step = l[1] / z;
      if (Math.abs(step - d) <= 0.01) found.push(['Polymer repeat unit', step,
        l[0] + (z > 1 ? ' at charge ' + z + ' (repeat ' + l[1].toFixed(4) + ' ÷ ' + z + ')'
                      : ' — adjacent members of this series')]);
    }
    for (const n of [2, 3]) if (Math.abs(l[1] * n - d) <= 0.01)
      found.push(['Polymer repeat unit', l[1] * n, l[0] + ' — ' + n + ' repeat units apart']);
  });

  if (!found.length) {
    box.append(el('p', 'empty', 'No standard explanation within ' + tol +
      ' Da. It may be an unrelated pair, or a loss we do not list.'));
    return;
  }
  found.sort((x, y) => Math.abs(x[1] - d) - Math.abs(y[1] - d));
  for (const f of found.slice(0, 25)) {
    const c = el('div', 'card');
    const t = el('div', 'card-top');
    t.append(el('span', 'card-mz', f[1].toFixed(4)));
    t.append(el('span', 'card-name', f[0]));
    t.append(el('span', 'delta', (f[1] - d >= 0 ? '+' : '') + (f[1] - d).toFixed(4) + ' from yours'));
    c.append(t);
    c.append(el('p', 'why', f[2]));
    box.append(c);
  }
}

/* --------------------------------------------------------------------- wiring */
function updateBadges() {
  const refineOn = $('polarity').value || $('category').value || $('onlyMs2').checked ||
    $('onlyMulti').checked || $('tolMode').value !== 'auto' || $('sortBy').value !== 'blend';
  const moreOn = $('charge').value || $('isoPreset').value || $('elution').value || $('requireLogp').checked;
  const isoOn = $('b1mz').value || $('b1pct').value || $('b2mz').value || $('b2pct').value ||
    $('belowB0').checked || $('rtMin').value;
  $('refineBadge').hidden = !refineOn; $('refineBadge').textContent = 'on';
  $('moreBadge').hidden = !moreOn; $('moreBadge').textContent = 'on';
  $('isoBadge').hidden = !isoOn; $('isoBadge').textContent = 'on';
}

function switchTab(which) {
  for (const t of ['find', 'list', 'delta']) {
    const on = t === which;
    $('tab-' + t).classList.toggle('active', on);
    $('tab-' + t).setAttribute('aria-selected', on ? 'true' : 'false');
    $('panel-' + t).hidden = !on;
  }
  $('cards').textContent = ''; $('status').textContent = '';
  if (which === 'find') showWelcome();
}

function init() {
  let timer;
  $('q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 160); });
  $('clear').onclick = () => { $('q').value = ''; run(); $('q').focus(); };
  $('runList').onclick = runPeakList;
  $('runDelta').onclick = runDelta;

  ['tolMode', 'tolValue', 'resolution', 'polarity', 'category', 'sortBy', 'onlyMs2', 'onlyMulti',
   'charge', 'isoPreset', 'isoM1', 'isoM2', 'elution', 'requireLogp',
   'b1mz', 'b1pct', 'b2mz', 'b2pct', 'belowB0', 'rtMin']
    .forEach(id => $(id).addEventListener('change', () => {
      if (id === 'tolMode') {
        const auto = $('tolMode').value === 'auto';
        $('tolValue').disabled = auto;
        if (!auto) $('tolValue').value = $('tolMode').value === 'ppm' ? 10 : 0.01;
      }
      if (id === 'isoPreset') $('isoCustom').hidden = $('isoPreset').value !== 'custom';
      run();
    }));
  document.querySelectorAll('#solvents input[type=checkbox]').forEach(b =>
    b.addEventListener('change', run));

  $('resetFilters').onclick = () => {
    ['polarity', 'category', 'charge', 'isoPreset', 'elution'].forEach(i => $(i).value = '');
    ['onlyMs2', 'onlyMulti', 'requireLogp'].forEach(i => $(i).checked = false);
    $('tolMode').value = 'auto'; $('tolValue').disabled = true; $('sortBy').value = 'blend';
    $('isoCustom').hidden = true; run();
  };
  ['find', 'list', 'delta'].forEach(t => $('tab-' + t).onclick = () => switchTab(t));

  const saved = localStorage.getItem('theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  $('themeToggle').onclick = () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? '' : 'dark';
    if (next) { document.documentElement.setAttribute('data-theme', next); localStorage.setItem('theme', next); }
    else { document.documentElement.removeAttribute('data-theme'); localStorage.removeItem('theme'); }
  };
  load();
}

document.addEventListener('DOMContentLoaded', init);
})();
