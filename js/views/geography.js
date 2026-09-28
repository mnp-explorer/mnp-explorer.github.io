// Geography: where the evidence comes from — studies by region and country, by matrix and over time.
// A study is counted once per country it sampled in (multi-country studies count in each).
import { split, label } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, bars, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

export default function geography(root, D, params) {
  const C = D.vocab.country;
  const regionOf = c => (C[c] || {}).region || 'Unassigned';
  const facts = D.studies.map(s => {
    const cs = split(s.countries);
    return { s, countries: new Set(cs), regions: new Set(cs.map(regionOf)), groups: new Set(split(s.finder_groups)),
      design: s.study_design, scope: s.evidence_scope, year: s.year };
  });
  const q = { group: params.get('group') || '', design: params.get('design') || '', scope: params.get('scope') || '',
    region: params.get('region') || '' };
  const FIELDS = [
    ['region', 'Region', f => f.regions, v => v, 'Any region'],
    ['group', 'Matrix group', f => f.groups, v => v, 'Any matrix group'],
    ['design', 'Study design', f => [f.design], v => label(D, 'study_design', v), 'Any design'],
    ['scope', 'Evidence', f => [f.scope], v => (v === 'methods_only' ? 'Methods only' : 'Occurrence studies'), 'All studies'],
  ];

  root.append(h(`<section><h2>Geography</h2>
    <p class="muted">Where the studies sampled. A study that sampled in several countries counts once in each.
      Laboratory-only studies without a sampling location are not placed. Each filter narrows the others.
      <span class="ref-hint">Click any bar to see its studies.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the studies.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="geoClear">Clear</button></div>
    <div id="geo"></div></section>`));
  const out = root.querySelector('#geo');
  const sel = n => root.querySelector(`[name=${n}]`);

  const REFS = new Map();
  out.addEventListener('click', e => {
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  const spec = (title, fs) => ({
    title, valueHead: 'Sample types', rows: [...fs].sort((a, b) => (b.year || 0) - (a.year || 0)).map(({ s }) => ({
      id: s.study_id, study: s.label, matrix: split(s.finder_groups).join(', '),
      value: split(s.sample_types).map(c => label(D, 'matrix_sample_type', c)).join(', ') || '–', attribution: '' })),
    summary: `<b>${fs.length} studies</b>` });

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      sel(k).innerHTML = `<option value="">${esc(blank)}</option>` + facetOptions(facts, F, k, valuesOf, q[k]).map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#geography?${new URLSearchParams(q)}`);
    const P = crossFilter(facts, F);
    const placed = P.filter(f => f.countries.size);
    const count = (keyOf, id, labelOf) => {
      const m = new Map();
      for (const f of placed) for (const k of keyOf(f)) (m.get(k) || m.set(k, []).get(k)).push(f);
      return [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, fs]) => {
        REFS.set(`${id}|${k}`, () => spec(labelOf(k), fs));
        return [labelOf(k), fs.length, k];
      });
    };
    const countries = count(f => [...f.countries].filter(c => q.region ? regionOf(c) === q.region : true), 'c', c => label(D, 'country', c));
    const regions = count(f => f.regions, 'r', v => v);
    out.replaceChildren(kpis([[placed.length, 'studies with a location'], [countries.length, 'countries'], [regions.length, 'regions'],
      [countries[0] ? `${countries[0][0]}` : '–', countries[0] ? `most studies (${countries[0][1]})` : '']]));

    const stack = h('<div class="stack"></div>');
    const card = (title, el, note = '') => {
      const c = h(`<div class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
      c.append(el);
      stack.append(c);
    };
    card('By region', bars(regions, { limit: 12, ref: k => `r|${k}` }));
    card('By country', bars(countries, { limit: 30, ref: k => `c|${k}` }), countries.length > 30 ? `30 of ${countries.length} countries shown.` : '');

    // region × matrix group and region × period
    const regs = regions.map(([r]) => r);
    const heat = (title, cols, colOf, note) => {
      const cnt = (r, c) => placed.filter(f => f.regions.has(r) && colOf(f).includes(c)).length;
      const max = Math.max(1, ...regs.flatMap(r => cols.map(c => cnt(r, c))));
      card(title, h(`<div class="tablewrap"><table class="matrix"><thead><tr><th>Region</th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${regs.map(r => `<tr><td>${esc(r)}</td>${cols.map(c => {
          const n = cnt(r, c);
          return `<td class="heat" style="--a:${(n / max).toFixed(2)}">${n || ''}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`), note);
    };
    const topGroups = [...new Set(placed.flatMap(f => [...f.groups]))]
      .map(g => [g, placed.filter(f => f.groups.has(g)).length]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g);
    heat('Region × matrix group', topGroups, f => [...f.groups], 'Number of studies (8 most common matrix groups).');
    const years = [...new Set(placed.map(f => f.year).filter(Boolean))].sort();
    heat('Region × publication year', years.map(String), f => [String(f.year)], 'Number of studies per year of publication.');
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) q[e.target.name] = e.target.value;
    draw();
  });
  root.querySelector('#geoClear').addEventListener('click', () => {
    Object.assign(q, { group: '', design: '', scope: '', region: '' });
    draw();
  });
  draw();
}
