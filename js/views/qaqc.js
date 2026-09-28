// QA/QC: how studies control and report quality — blanks, contamination control, recovery and
// limits, identification checks and data availability — and how reporting changed over time.
// One stacked bar per item (share of studies per answer); every segment lists its studies.
import { split, label, short, quantiles, fmt } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

const PERIODS = [['≤ 2019', 0, 2019], ['2020–21', 2020, 2021], ['2022–23', 2022, 2023], ['2024', 2024, 2024], ['2025–26', 2025, 2026]];
const period = y => (PERIODS.find(([, a, b]) => y >= a && y <= b) || [''])[0];

export default function qaqc(root, D, params) {
  const itemsVocab = Object.values(D.vocab.qaqc_item);
  const rank = v => +((D.vocab.qaqc_value[v] || {}).rank || 5);
  const good = v => rank(v) <= 2;                 // yes / full / quantified / subtraction / clean room …
  const valueLabel = v => label(D, 'qaqc_value', v);

  const facts = D.studies.map(s => {
    const qa = Object.fromEntries((D.qaqcBy.get(s.study_id) || []).map(x => [x.item, x.value]));
    return { s, qa, score: Object.values(qa).filter(good).length, groups: new Set(split(s.finder_groups)),
      techs: new Set(split(s.techniques)), design: s.study_design, scope: s.evidence_scope, period: period(s.year) };
  });
  const q = { group: params.get('group') || '', design: params.get('design') || '', tech: params.get('tech') || '',
    scope: params.get('scope') || '', period: params.get('period') || '' };
  const FIELDS = [
    ['group', 'Matrix group', f => f.groups, v => v, 'Any matrix group'],
    ['design', 'Study design', f => [f.design], v => label(D, 'study_design', v), 'Any design'],
    ['tech', 'Technique', f => f.techs, v => short(D, 'method_step', v), 'Any technique'],
    ['scope', 'Evidence', f => [f.scope], v => (v === 'methods_only' ? 'Methods only' : 'Occurrence studies'), 'All studies'],
    ['period', 'Published', f => [f.period], v => v, 'Any year'],
  ];

  root.append(h(`<section><h2>QA/QC</h2>
    <p class="muted">How studies control contamination, validate their methods and share their data. Each bar shows the share of
      studies per answer; "not reported" means the paper did not say. Each filter narrows the others.
      <span class="ref-hint">Click a bar segment to see its studies.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the studies.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="qaClear">Clear</button></div>
    <div id="qa"></div></section>`));
  const out = root.querySelector('#qa');
  const sel = n => root.querySelector(`[name=${n}]`);

  const REFS = new Map();
  out.addEventListener('click', e => {
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  const spec = (title, fs, total) => ({
    title, rows: [...fs].sort((a, b) => (b.s.year || 0) - (a.s.year || 0)).map(({ s }) => ({
      id: s.study_id, study: s.label, matrix: split(s.finder_groups).join(', '),
      value: split(s.techniques).map(c => short(D, 'method_step', c)).join(', ') || '–', attribution: '' })),
    summary: `<b>${fs.length} of ${total} studies</b> (${Math.round(100 * fs.length / total)}%)`,
    note: 'Value column: analysis techniques used by the study.' });

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      const opts = facetOptions(facts, F, k, valuesOf, q[k]);
      if (k === 'period') opts.sort((a, b) => a[0].localeCompare(b[0]));
      sel(k).innerHTML = `<option value="">${esc(blank)}</option>` + opts.map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#qaqc?${new URLSearchParams(q)}`);
    const P = crossFilter(facts, F);
    const sc = quantiles(P.map(f => f.score));
    const share = item => (P.length ? Math.round(100 * P.filter(f => good(f.qa[item])).length / P.length) : 0);
    out.replaceChildren(kpis([[P.length, 'studies'], [sc ? fmt(sc.median) : '–', `median practices reported (of ${itemsVocab.length})`],
      [`${share('blanks_procedural')}%`, 'use procedural blanks'], [`${share('recovery_tested')}%`, 'test spike recovery'],
      [`${P.length ? Math.round(100 * P.filter(f => f.qa.raw_data === 'full').length / P.length) : 0}%`, 'share the full dataset']]));

    const stack = h('<div class="stack"></div>');
    for (const grp of [...new Set(itemsVocab.map(i => i.group))]) {
      const rows = itemsVocab.filter(i => i.group === grp).map(it => {
        const vals = it.values.split('|').sort((a, b) => rank(a) - rank(b));
        const segs = vals.map(v => {
          const fs = P.filter(f => (f.qa[it.code] || 'nr') === v);
          if (!fs.length) return '';
          const ref = `${it.code}|${v}`;
          REFS.set(ref, () => spec(`${it.label_en}: ${valueLabel(v)}`, fs, P.length));
          const w = 100 * fs.length / P.length;
          return `<span class="seg r${rank(v)}" style="width:${w.toFixed(2)}%" data-ref="${esc(ref)}"
            title="${esc(valueLabel(v))}: ${fs.length} studies (${Math.round(w)}%)">${w >= 9 ? `${Math.round(w)}%` : ''}</span>`;
        }).join('');
        return `<div class="qa-row"><span class="lab" title="${esc(it.definition)}">${esc(it.label_en)}</span>
          <span class="stackbar">${segs}</span>
          <span class="legend">${vals.filter(v => P.some(f => (f.qa[it.code] || 'nr') === v)).map(v =>
            `<i class="r${rank(v)}"></i>${esc(valueLabel(v))}`).join(' ')}</span></div>`;
      }).join('');
      stack.append(h(`<div class="card"><h3>${esc(grp)}</h3>${P.length ? rows : '<p class="muted">No studies match.</p>'}</div>`));
    }

    // reporting over time: share of studies with a positive answer, per publication period
    const byP = PERIODS.map(([p]) => [p, P.filter(f => f.period === p)]);
    stack.append(h(`<div class="card"><h3>Reporting over time</h3>
      <p class="muted small">Share of studies per publication period with a positive answer (yes, full, quantified, subtraction,
        clean room …). Darker = higher share.</p>
      <div class="tablewrap"><table class="matrix trend"><thead><tr><th>Practice</th>${byP.map(([p, fs]) =>
        `<th>${esc(p)}<br><span class="muted small">n=${fs.length}</span></th>`).join('')}</tr></thead>
      <tbody>${itemsVocab.map(it => `<tr><td>${esc(it.label_en)}</td>${byP.map(([p, fs]) => {
        if (!fs.length) return '<td></td>';
        const a = fs.filter(f => good(f.qa[it.code])).length / fs.length;
        return `<td class="heat" style="--a:${a.toFixed(2)}">${Math.round(100 * a)}%</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div></div>`));
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) q[e.target.name] = e.target.value;
    draw();
  });
  root.querySelector('#qaClear').addEventListener('click', () => {
    Object.assign(q, { group: '', design: '', tech: '', scope: '', period: '' });
    draw();
  });
  draw();
}
