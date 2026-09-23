// Method finder: rank analysis pipelines for a user's sample and target.
//
// A pipeline family is  matrix removal → separation → analysis technique,  built from the
// studies that used it. Ranking is transparent:
//   1. feasibility  – the technique must be able to deliver what the user needs
//                     (polymer identity, particle size/shape/count, or mass) and be available;
//   2. relevance    – each supporting study is weighted by how close it is to the user's case
//                     (matrix, polymer, size);
//   3. evidence tier – rule-based, never a single opaque score:
//        A  validated     ≥3 relevant studies and a full-workflow recovery within the band
//        B  supported     ≥3 relevant studies
//        C  limited       1–2 relevant studies
//        D  extrapolated  evidence only from other matrices
//      Within a tier, pipelines are ordered by the summed study weights.
// Parameters come from reported practice in the supporting studies; they are not optimised.

import { split, num, quantiles, polymerMatches } from './summaries.js';

export const SETTINGS = {
  recoveryBand: [70, 130],          // % recovery accepted as "validated"
  minStudiesSupported: 3,
  weights: { sameGroup: 1, sameCharacter: 0.5, otherMatrix: 0.15, polymerMiss: 0.4, sizeMiss: 0.3, sizeUnknown: 0.6 },
  designBonus: { method_development: 0.5, spiked_validation: 0.5, validation: 0.5 },
};

// Recovery-point reagent labels → removal categories used by studies.
export const RECOVERY_REMOVAL = {
  KOH: ['ALKALI'], TMAH: ['ALKALI'], KOH_detergent: ['ALKALI'], KOH_neutralized: ['ALKALI'],
  KOH_oxidation: ['ALKALI', 'OXIDATION'], enzyme_oxidation: ['ENZYME', 'OXIDATION'], HNO3: ['ACID'],
  pancreatin: ['ENZYME'], trypsin: ['ENZYME'], H2O2: ['OXIDATION'], acid_oxidation: ['ACID', 'OXIDATION'],
  enzyme_perchlorate: ['ENZYME', 'ACID'], acid_alkali_enzyme: ['ACID', 'ALKALI', 'ENZYME'],
  enzyme_KOH: ['ENZYME', 'ALKALI'], alkali_oxidation_acid: ['ALKALI', 'OXIDATION', 'ACID'], none: ['NONE'],
};
// Recovery-point analysis labels → technique families they can validate.
const RECOVERY_ANALYSIS = {
  pygcms: ['THERMAL'], pygcmsms: ['THERMAL'], lcms_depoly: ['LCMS'], raman: ['RAMAN'], fluorescence: ['FLUOR'],
  counting: ['FTIR', 'RAMAN', 'FLUOR', 'OPTICAL', 'SEM'],
};
const FULL_SCOPE = new Set(['digestion_to_end', 'physical_to_end']);
export const PRESENT_ROLES = new Set(['field_detection', 'reported', 'exposure_material', 'recovery_spike', 'method_material']);

// Normalised step keys: sorted, 'None' dropped when a real step is present, enzyme+chemical folded into enzyme.
export const removalKey = s => {
  const r = split(s.removal_steps).map(x => (x === 'ENZ_CHEM' ? 'ENZYME' : x)).filter(x => x !== 'NONE');
  return r.length ? [...new Set(r)].sort().join('+') : 'NONE';
};
export const separationKey = s => {
  const r = split(s.separation_steps).filter(x => x !== 'NONE');
  return r.length ? [...new Set(r)].sort().join('+') : 'NONE';
};

export function techniqueFits(D, code, q) {
  const t = D.vocab.technique_property[code];
  if (!t) return { ok: false, why: 'unknown technique' };
  if (q.instruments && q.instruments.length && !q.instruments.includes(code)) return { ok: false, why: 'not available' };
  if (q.needPolymerId && t.identifies_polymer !== 'yes') return { ok: false, why: 'does not identify polymers' };
  if (q.basis === 'mass' && t.reports_mass !== 'yes') return { ok: false, why: 'does not report mass' };
  if (q.basis === 'count' && t.reports_size_shape !== 'yes' && t.reports_count !== 'yes')
    return { ok: false, why: 'does not report particle counts / size' };
  return { ok: true };
}

function matrixRelevance(s, q) {
  if (!q.group && !q.character) return { w: 1, bucket: 'any' };
  if (q.group && split(s.finder_groups).includes(q.group)) return { w: SETTINGS.weights.sameGroup, bucket: 'group' };
  if (q.character && split(s.matrix_characters).includes(q.character))
    return { w: SETTINGS.weights.sameCharacter, bucket: 'character' };
  return { w: SETTINGS.weights.otherMatrix, bucket: 'other' };
}

function polymerRelevance(D, s, q) {
  if (!q.polymers || !q.polymers.length) return { w: 1 };
  const present = (D.findingsBy.get(s.study_id) || []).filter(f => PRESENT_ROLES.has(f.role));
  const hit = present.filter(f => q.polymers.some(p => polymerMatches(D, f.polymer_code, p)));
  if (!hit.length) return { w: SETTINGS.weights.polymerMiss, note: 'target polymer not reported' };
  const onlyExposure = hit.every(f => f.role !== 'field_detection' && f.role !== 'reported');
  return { w: 1, note: onlyExposure ? 'target polymer only as added material' : '' };
}

function sizeRelevance(D, s, q) {
  const lo = num(q.sizeLo), hi = num(q.sizeHi);
  if (lo == null && hi == null) return { w: 1 };
  const spans = (D.spansBy.get(s.study_id) || []).filter(x => x.span_type === 'size' && ['observed', 'operational'].includes(x.kind));
  const ranges = spans.map(x => [num(x.lo), num(x.hi)]).filter(([a, b]) => a != null && b != null);
  const minSize = num(s.min_particle_size_um);
  if (!ranges.length && minSize == null) return { w: SETTINGS.weights.sizeUnknown, note: 'size not reported' };
  const qLo = lo ?? 0, qHi = hi ?? Infinity;
  const overlaps = ranges.some(([a, b]) => a <= qHi && b >= qLo) || (minSize != null && minSize <= qHi && !ranges.length);
  return overlaps ? { w: 1 } : { w: SETTINGS.weights.sizeMiss, note: 'reported sizes outside the target range' };
}

function recoveryFor(D, s, removal, technique, q) {
  const fam = D.vocab.technique_property[technique].family;
  const rem = new Set(removal.split('+'));
  return (D.recoveryBy.get(s.study_id) || []).filter(p => {
    const pr = RECOVERY_REMOVAL[p.removal];
    const pa = RECOVERY_ANALYSIS[p.analysis];
    if (pr && !pr.some(x => rem.has(x))) return false;
    if (pa && !pa.includes(fam)) return false;
    if (q.basis === 'mass' && p.endpoint !== 'mass') return false;
    if (q.basis === 'count' && p.endpoint !== 'count') return false;
    return true;
  });
}

export function rankPipelines(D, q) {
  const families = new Map();
  const excluded = new Map();
  for (const s of D.studies) {
    const removal = removalKey(s), separation = separationKey(s);
    for (const run of D.runsBy.get(s.study_id) || []) {
      const fit = techniqueFits(D, run.technique, q);
      if (!fit.ok) {
        excluded.set(run.technique, fit.why);
        continue;
      }
      const key = `${removal}|${separation}|${run.technique}`;
      if (!families.has(key)) families.set(key, { key, removal, separation, technique: run.technique, studies: [] });
      const m = matrixRelevance(s, q), p = polymerRelevance(D, s, q), z = sizeRelevance(D, s, q);
      const bonus = SETTINGS.designBonus[s.study_design] || 0;
      const rec = recoveryFor(D, s, removal, run.technique, q);
      families.get(key).studies.push({
        s, bucket: m.bucket, weight: m.w * p.w * z.w * (1 + bonus), recovery: rec,
        notes: [p.note, z.note].filter(Boolean),
      });
    }
  }

  const [bandLo, bandHi] = SETTINGS.recoveryBand;
  const out = [];
  for (const f of families.values()) {
    const relevant = f.studies.filter(x => x.bucket !== 'other');
    const relRec = relevant.flatMap(x => x.recovery);
    const fullRec = relRec.filter(p => FULL_SCOPE.has(p.scope) && num(p.value_pct) != null);
    const inBand = fullRec.filter(p => num(p.value_pct) >= bandLo && num(p.value_pct) <= bandHi);
    let tier;
    if (!relevant.length) tier = 'D';
    else if (relevant.length >= SETTINGS.minStudiesSupported && inBand.length) tier = 'A';
    else if (relevant.length >= SETTINGS.minStudiesSupported) tier = 'B';
    else tier = 'C';
    const ids = new Set(f.studies.map(x => x.s.study_id));
    out.push({
      ...f, tier,
      score: f.studies.reduce((a, x) => a + x.weight, 0),
      nStudies: f.studies.length, nRelevant: relevant.length,
      recovery: { all: quantiles(relRec.map(p => num(p.value_pct))), full: quantiles(fullRec.map(p => num(p.value_pct))),
                  nInBand: inBand.length, nFull: fullRec.length, nStudies: new Set(relRec.map(p => p.study_id)).size },
      settings: practice(D, [...ids], f.technique),
      studies: f.studies.sort((a, b) => b.weight - a.weight),
    });
  }
  out.sort((a, b) => a.tier.localeCompare(b.tier) || b.score - a.score);
  return { pipelines: out, excluded: [...excluded.entries()] };
}

// Reported practice among the studies behind a pipeline.
export function practice(D, studyIds, technique) {
  const set = new Set(studyIds);
  const S = studyIds.map(id => D.study[id]);
  const range = (lo, hi) => quantiles(S.flatMap(s => [num(s[lo]), num(s[hi])].filter(v => v != null).slice(0, 1)));
  const fam = D.vocab.technique_property[technique].family;
  const params = {};
  for (const p of D.params) {
    if (!set.has(p.study_id) || (p.family !== fam && p.family !== 'SPECTRAL')) continue;
    (params[p.parameter] = params[p.parameter] || []).push(p);
  }
  const paramSummary = {};
  for (const [code, rows] of Object.entries(params)) {
    paramSummary[code] = rows[0].value_code
      ? { counts: rows.reduce((m, r) => ((m[r.value_code] = (m[r.value_code] || 0) + 1), m), {}), n: rows.length }
      : { q: quantiles(rows.map(r => num(r.value_lo))), unit: rows[0].unit };
  }
  return {
    digestionTempC: range('digestion_temp_c_lo', 'digestion_temp_c_hi'),
    digestionTimeH: range('digestion_time_h_lo', 'digestion_time_h_hi'),
    filterPoreUm: range('filter_pore_um_lo', 'filter_pore_um_hi'),
    minSizeUm: quantiles(S.filter(s => s.min_particle_size_basis === 'reported').map(s => num(s.min_particle_size_um))),
    params: paramSummary,
  };
}
