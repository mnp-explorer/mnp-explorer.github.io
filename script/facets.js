// Faceted filtering: each field's options are counted over the studies that match
// every *other* current selection, so the choices narrow as the user selects.

import { split, num, polymerMatches } from './summaries.js';
import { PRESENT_ROLES, techniqueFits } from './finder.js';

export const SIZE_DOMAIN = [0.01, 10000];   // µm, log scale

// Per-study facts used by the filters (computed once).
export function studyFacts(D) {
  return D.studies.map(s => {
    const spans = (D.spansBy.get(s.study_id) || [])
      .filter(x => x.span_type === 'size' && ['observed', 'operational'].includes(x.kind))
      .map(x => [num(x.lo), num(x.hi)]).filter(([a, b]) => a != null && b != null);
    const min = num(s.min_particle_size_um);
    if (!spans.length && min != null && s.min_particle_size_basis === 'reported') spans.push([min, min]);
    return {
      s, id: s.study_id,
      groups: new Set(split(s.finder_groups)),
      chars: new Set(split(s.matrix_characters)),
      polymers: new Set((D.findingsBy.get(s.study_id) || []).filter(f => PRESENT_ROLES.has(f.role)).map(f => f.polymer_code)),
      sizes: spans,
      basis: s.metric_basis,
      techs: new Set((D.runsBy.get(s.study_id) || []).map(r => r.technique)),
    };
  });
}

const sizeActive = q => num(q.sizeLo) != null || num(q.sizeHi) != null;

// One predicate per field; `null` when the field is not set.
function predicates(D, q) {
  const lo = num(q.sizeLo) ?? 0, hi = num(q.sizeHi) ?? Infinity;
  const usable = t => techniqueFits(D, t, { ...q, instruments: [] }).ok;
  return {
    group: q.group ? f => f.groups.has(q.group) : null,
    character: q.character ? f => f.chars.has(q.character) : null,
    polymer: q.polymer ? f => [...f.polymers].some(c => polymerMatches(D, c, q.polymer)) : null,
    size: sizeActive(q) ? f => f.sizes.some(([a, b]) => a <= hi && b >= lo) : null,
    basis: q.basis ? f => (f.basis || '').split('+').includes(q.basis) : null,
    // a study must have used at least one selected instrument that can deliver what is needed
    instruments: f => [...f.techs].some(t => usable(t) && (!q.instruments.length || q.instruments.includes(t))),
  };
}

// Studies matching all fields except `skip` (use skip = null for the full match).
export function matching(D, facts, q, skip = null) {
  const P = predicates(D, q);
  return facts.filter(f => Object.entries(P).every(([k, p]) => k === skip || !p || p(f)));
}

export function countsFor(D, facts, q, field, valuesOf) {
  const m = new Map();
  for (const f of matching(D, facts, q, field)) for (const v of valuesOf(f)) m.set(v, (m.get(v) || 0) + 1);
  return m;
}

// Histogram of study size ranges over log bins, for the slider background.
export function sizeHistogram(studies, bins = 30) {
  const [a, b] = SIZE_DOMAIN.map(Math.log10);
  const edges = Array.from({ length: bins + 1 }, (_, i) => 10 ** (a + (b - a) * i / bins));
  return edges.slice(0, -1).map((e0, i) => {
    const e1 = edges[i + 1];
    return { lo: e0, hi: e1, n: studies.filter(f => f.sizes.some(([x, y]) => x <= e1 && y >= e0)).length };
  });
}

// Generic cross-filter for any view. `filters` maps field → predicate (or null when unset).
// Returns the items matching every filter except `skip`.
export function crossFilter(items, filters, skip = null) {
  return items.filter(it => Object.entries(filters).every(([k, p]) => k === skip || !p || p(it)));
}

// Option counts for one field: items matching all *other* filters, counted by `valuesOf(item)`.
// The current value is kept (with count 0) so a selection never silently disappears.
export function facetOptions(items, filters, field, valuesOf, current = '') {
  const m = new Map();
  for (const it of crossFilter(items, filters, field)) for (const v of valuesOf(it)) m.set(v, (m.get(v) || 0) + 1);
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1]);
  if (current && !m.has(current)) rows.unshift([current, 0]);
  return rows;
}
