// Occurrence: reported MNP concentrations and detection frequencies in biological samples.
// Rules from the dataset: values are compared only within one unit; a study-level aggregate is
// dropped where the same study reports its subgroups; non-comparable summaries (pooled totals,
// single samples, ranges of means …) are left out of the charts; non-detects never count as zero.
import { split, label, short, quantiles, fmt, num, centralValue, resultText, resultTags } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, ranges, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

export default function occurrence(root, D, params) {
  const orgGroup = c => (D.vocab.matrix_organism[c] || {}).finder_group || 'Other';
  const region = c => (D.vocab.country[c] || {}).region || '';
  const comparable = lvl => ((D.vocab.summary_level[lvl || ''] || {}).comparable || 'yes') === 'yes';
  const analyteLabel = a => (D.vocab.analyte_group[a] ? D.vocab.analyte_group[a].label_en
    : `${a} – ${label(D, 'polymer', a)}`);
  const unitLabel = u => label(D, 'result_unit', u);

  // study aggregates overlap their own subgroups: keep an aggregate only when the study has no subgroup value
  const key = r => `${r.study_id}|${r.analyte}|${r.unit}`;
  const hasSub = new Set(D.occ.filter(r => (D.group[r.group_id] || {}).group_scope !== 'study_aggregate').map(key));
  const items = [];
  let nondetect = 0, notComparable = 0;
  for (const r of D.occ) {
    const g = D.group[r.group_id];
    const s = D.study[r.study_id];
    if (!g || !s || !r.unit || r.unit === 'other') continue;
    if (g.group_scope === 'study_aggregate' && hasSub.has(key(r))) continue;
    if (!comparable(r.summary_level)) { notComparable++; continue; }
    const c = centralValue(r);
    if (!c) { nondetect++; continue; }
    items.push({ r, g, s, value: c.v, stat: c.stat, unit: r.unit, analyte: r.analyte, sample: g.sample_type_code,
      group: orgGroup(g.organism_code), regions: new Set(split(s.countries).map(region).filter(Boolean)),
      techs: new Set(split(g.technique_codes).length ? split(g.technique_codes) : split(s.techniques)) });
  }
  const units = [...new Set(items.map(f => f.unit))];
  const unitRank = u => +((D.vocab.result_unit[u] || {}).sort || 99);
  const q = { unit: params.get('unit') || '', group: params.get('group') || '', sample: params.get('sample') || '',
    analyte: params.get('analyte') || '', tech: params.get('tech') || '', region: params.get('region') || '' };

  const FIELDS = [
    ['unit', 'Measure', f => [f.unit], unitLabel],
    ['group', 'Organism group', f => [f.group], v => v, 'Any organism'],
    ['sample', 'Sample type', f => [f.sample], v => label(D, 'matrix_sample_type', v), 'Any sample type'],
    ['analyte', 'Polymer', f => [f.analyte], analyteLabel, 'Any polymer or total'],
    ['tech', 'Technique', f => f.techs, v => short(D, 'method_step', v), 'Any technique'],
    ['region', 'Region', f => f.regions, v => v, 'Any region'],
  ];

  root.append(h(`<section><h2>Occurrence</h2>
    <p class="muted">Concentrations and detection frequencies reported for untreated biological samples. Values are compared only
      within one measure (unit); choose the measure first. Each filter narrows the others.
      <span class="ref-hint">Click any row to see the studies and values.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the values.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="occClear">Clear</button></div>
    <div id="occ"></div></section>`));
  const out = root.querySelector('#occ');
  const sel = n => root.querySelector(`[name=${n}]`);

  const REFS = new Map();
  out.addEventListener('click', e => {
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  const spec = (title, its) => {
    const qq = quantiles(its.map(f => f.value));
    const rows = [...its].sort((a, b) => a.value - b.value).map(({ r, g, s }) => ({
      id: s.study_id, study: s.label,
      matrix: `${g.group_label}${g.n_samples ? ` (n = ${g.n_samples})` : ''}`,
      value: `${resultText(r)} ${unitLabel(r.unit)}${r.analyte ? ' · ' + r.analyte : ''}`,
      attribution: resultTags(r).join(', ') }));
    return { title, rows, col4: 'Qualifier',
      summary: qq ? `Median of reported values <b>${fmt(qq.median)} ${esc(unitLabel(its[0].unit))}</b>
        (IQR ${fmt(qq.q1)}–${fmt(qq.q3)}) · ${its.length} values from ${new Set(its.map(f => f.s.study_id)).size} studies` : '',
      note: 'Each value is one group statistic as reported (median, mean or other central value; see the value text). '
        + 'Groups are separate populations; values are not pooled across studies.' };
  };

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  const draw = () => {
    closePopover();
    REFS.clear();
    // the measure is always set: keep the chosen one, else the most common under the other filters
    let F = filters();
    const unitOpts = facetOptions(items, F, 'unit', f => [f.unit], q.unit);
    if (!q.unit || !units.includes(q.unit)) q.unit = (unitOpts.find(([, n]) => n) || [units[0]])[0];
    F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      const opts = facetOptions(items, F, k, valuesOf, q[k]);
      if (k === 'unit') opts.sort((a, b) => unitRank(a[0]) - unitRank(b[0]));
      sel(k).innerHTML = (blank ? `<option value="">${esc(blank)}</option>` : '') + opts.map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#occurrence?${new URLSearchParams(q)}`);

    const P = crossFilter(items, F);
    // a polymer's value is part of its study's total: with no polymer chosen, compare totals (when there are any)
    const totals = P.filter(f => D.vocab.analyte_group[f.analyte]);
    const base = q.analyte || !totals.length ? P : totals;
    const pct = /^pct_/.test(q.unit);
    const vals = P.map(f => f.value).filter(v => v > 0);
    const lo = vals.length ? 10 ** Math.floor(Math.log10(Math.min(...vals))) : 0.01;
    const hi = vals.length ? 10 ** Math.ceil(Math.log10(Math.max(...vals))) : 100;
    const opts = pct ? { domain: [0, 100], unit: '%', scale: 'linear', step: 20 }
      : { domain: [lo, hi === lo ? lo * 10 : hi], unit: unitLabel(q.unit), scale: 'log' };
    const all = quantiles(base.map(f => f.value));
    out.replaceChildren(kpis([[P.length, 'reported values'], [new Set(P.map(f => f.g.group_id)).size, 'sample groups'],
      [new Set(P.map(f => f.s.study_id)).size, 'studies'], [all ? `${fmt(all.median)}` : '–', `median (${unitLabel(q.unit)})`]]));

    const stack = h('<div class="stack"></div>');
    const section = (title, id, keyOf, labelOf, limit = 20, src = base) => {
      const groups = new Map();
      for (const f of src) for (const k of [].concat(keyOf(f))) (groups.get(k) || groups.set(k, []).get(k)).push(f);
      const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, limit).map(([k, its]) => {
        const ref = `${id}|${k}`;
        REFS.set(ref, () => spec(`${title}: ${labelOf(k)}`, its));
        return { label: labelOf(k), q: quantiles(its.map(f => f.value).filter(v => pct || v > 0)), ref };
      });
      if (rows.length < 1) return;
      const el = ranges(rows, opts);
      el.querySelectorAll('.range').forEach((row, i) => { if (rows[i]) { row.dataset.ref = rows[i].ref; row.classList.add('clickable'); } });
      const c = h(`<div class="card"><h3>${title}</h3></div>`);
      c.append(el);
      stack.append(c);
    };
    if (!P.length) {
      stack.append(h('<p class="muted">No reported values match these filters.</p>'));
    } else {
      if (base !== P) {
        stack.append(h(`<p class="muted small">No polymer chosen: the charts by sample type, organism and region compare
          <b>total</b> values (all particles or all polymers); "By polymer" shows each polymer separately.</p>`));
      }
      section('By sample type', 'st', f => f.sample, v => label(D, 'matrix_sample_type', v));
      section('By polymer', 'an', f => f.analyte, analyteLabel, 16, P);
      section('By organism group', 'og', f => f.group, v => v);
      section('By region', 'rg', f => [...f.regions], v => v);
    }
    stack.append(h(`<div class="card rules"><h3>How values are compared</h3><ul class="reading">
      <li>Only values with the same measure and unit are shown together; wet- and dry-weight values are not converted.</li>
      <li>Each value is a group statistic reported by a study (median, mean or other central value). A study-level total is left out
        when the same study reports its subgroups.</li>
      <li>Non-detects and values below the detection or quantification limit are not plotted and never count as zero
        (${nondetect.toLocaleString('en-US')} such results in the dataset).</li>
      <li>Pooled totals, single samples, ranges of means and author extrapolations are listed in each study's details but not plotted
        (${notComparable} results).</li>
      <li>Tags mark qualifiers reported by the paper (tentative, contamination-qualified …) and values read from figures or computed
        from reported data.</li></ul></div>`));
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) q[e.target.name] = e.target.value;
    draw();
  });
  root.querySelector('#occClear').addEventListener('click', () => {
    Object.assign(q, { group: '', sample: '', analyte: '', tech: '', region: '' });
    draw();
  });
  draw();
}
