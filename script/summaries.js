// Shared data helpers: indexing the public dataset and small statistics.
// Used by the views and by finder.js. No DOM code here.

export const split = v => (v == null || v === '' ? [] : String(v).split(';').map(s => s.trim()).filter(Boolean));
export const num = v => (v === '' || v == null || isNaN(+v) ? null : +v);

export function countBy(items, key) {
  const m = new Map();
  for (const it of items) for (const k of [].concat(key(it)).filter(x => x != null && x !== '')) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function quantiles(values) {
  const v = values.filter(x => x != null && isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = p => {
    const i = (v.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { n: v.length, min: v[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: v[v.length - 1] };
}

export function fmt(x, digits = 3) {
  if (x == null || !isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1000) return Math.round(x).toLocaleString('en-US');
  return String(+x.toPrecision(digits));
}

export function fmtRange(q) {
  if (!q) return '–';
  return q.n >= 4 ? `${fmt(q.median)} (${fmt(q.q1)}–${fmt(q.q3)})` : `${fmt(q.median)}`;
}

// Build lookups once. `db` is the parsed mnp_public.json.
export function indexData(db) {
  const vocab = {};
  for (const [name, rows] of Object.entries(db.vocab)) vocab[name] = Object.fromEntries(rows.map(r => [r.code, r]));
  const byStudy = key => {
    const m = new Map();
    for (const r of db[key]) (m.get(r.study_id) || m.set(r.study_id, []).get(r.study_id)).push(r);
    return m;
  };
  const studies = db.studies.map(s => ({ ...s, year: num(s.year) }));
  // method_step codes are unique only within a stage (NONE exists for several stages)
  const stepVocab = {};
  for (const r of db.vocab.method_step) (stepVocab[r.stage] = stepVocab[r.stage] || {})[r.code] = r;
  return {
    meta: db.meta, vocab, stepVocab, summary: db.instrument_summary, studies,
    study: Object.fromEntries(studies.map(s => [s.study_id, s])),
    runs: db.instrument_runs, params: db.instrument_parameters, results: db.instrument_results,
    findings: db.polymer_findings, matrix: db.matrix, recovery: db.recovery_points, spans: db.spans,
    runsBy: byStudy('instrument_runs'), findingsBy: byStudy('polymer_findings'), recoveryBy: byStudy('recovery_points'),
    spansBy: byStudy('spans'), matrixBy: byStudy('matrix'),
  };
}

// Human-readable label for a code in a vocabulary.
export function label(D, vocabName, code) {
  const r = D.vocab[vocabName] && D.vocab[vocabName][code];
  return r ? (r.label_en || code) : code;
}

// Label of a pipeline step within its stage: physical / removal / separation / analysis.
export function stepLabel(D, stage, code) {
  const r = D.stepVocab[stage] && D.stepVocab[stage][code];
  return r ? r.label_en : label(D, 'method_step', code);
}

// Short label (e.g. "µ-FTIR") where the vocabulary has one.
export function short(D, vocabName, code) {
  const r = D.vocab[vocabName] && D.vocab[vocabName][code];
  return r ? (r.short_label || r.label_en || code) : code;
}

// Compact axis numbers: 0.01, 0.1, 1, 10, 100, 1k, 10k, 100k.
export function tick(x) {
  if (x >= 1e6) return `${x / 1e6}M`;
  if (x >= 1e3) return `${x / 1e3}k`;
  return String(+x.toPrecision(3));
}

// Polymer codes a study counts as present in its samples (unqualified detections).
export const samplePolymers = s => split(s.polymers_in_samples);

// A polymer query matches a code or any of its descendants (PE matches PE-LD, PE-HD ...).
export function polymerMatches(D, code, wanted) {
  let c = code;
  while (c) {
    if (c === wanted) return true;
    c = D.vocab.polymer[c] && D.vocab.polymer[c].parent;
  }
  return false;
}
