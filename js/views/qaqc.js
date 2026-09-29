// QA/QC: how studies control and report quality — blanks, contamination control, recovery and
// limits, identification checks and data availability — and how reporting changed over time.
// One stacked bar per item (share of studies per answer); every segment lists its studies.
import { split, label, short, quantiles, fmt } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, bars, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

const PERIODS = [['≤ 2019', 0, 2019], ['2020–21', 2020, 2021], ['2022–23', 2022, 2023], ['2024', 2024, 2024], ['2025–26', 2025, 2026]];
const period = y => (PERIODS.find(([, a, b]) => y >= a && y <= b) || [''])[0];

export default function qaqc(root, D, params) {
  const itemsVocab = Object.values(D.vocab.qaqc_item);
  const rank = v => +((D.vocab.qaqc_value[v] || {}).rank || 5);
  const good = v => rank(v) <= 2;                 // yes / full / quantified / subtraction / clean room …
  const valueLabel = v => label(D, 'qaqc_value', v);

  // recovery coverage: spiked polymers with a mass or count recovery value vs polymers reported in samples
  const topOf = c => ((D.vocab.polymer[c] || {}).parent) || c;
  const FULL = new Set(['digestion_to_end', 'physical_to_end']);
  const NOPOLY = new Set(['OTHER', 'UNSPEC', '']);
  const coverageOf = s => {
    const rec = (D.recoveryBy.get(s.study_id) || []).filter(r => r.value_pct !== '' && isFinite(+r.value_pct));
    const spiked = new Map();
    for (const r of rec) {
      if (NOPOLY.has(r.polymer_code)) continue;
      const p = topOf(r.polymer_code);
      const e = spiked.get(p) || spiked.set(p, { mass: false, count: false, full: false }).get(p);
      e[r.endpoint === 'count' ? 'count' : 'mass'] = true;
      if (FULL.has(r.scope)) e.full = true;
    }
    const reported = new Set(split(s.polymers_in_samples).filter(c => !NOPOLY.has(c)).map(topOf));
    const validated = [...reported].filter(p => (spiked.get(p) || {}).full);
    const coverage = !rec.length ? '' : !reported.size ? 'NO_SAMPLE' : !spiked.size ? 'NOT_NAMED'
      : validated.length === reported.size ? 'MATCHED' : validated.length ? 'PARTIAL' : 'NONE_MATCHED';
    const sizes = rec.map(r => +r.size_lo_um).filter(v => v > 0);
    const obs = (D.spansBy.get(s.study_id) || []).filter(x => x.span_type === 'size' && x.kind === 'observed').map(x => +x.lo).filter(v => v > 0);
    return { rec, spiked, reported, coverage, spikeMin: sizes.length ? Math.min(...sizes) : null, reportedMin: obs.length ? Math.min(...obs) : null };
  };
  const facts = D.studies.map(s => {
    const qa = Object.fromEntries((D.qaqcBy.get(s.study_id) || []).map(x => [x.item, x.value]));
    const rm = D.refmatBy.get(s.study_id) || [];
    return { s, qa, score: Object.values(qa).filter(good).length, groups: new Set(split(s.finder_groups)),
      rmTypes: rm.filter(r => r.facet === 'type').map(r => r.code), rmUses: rm.filter(r => r.facet === 'use').map(r => r.code),
      ...coverageOf(s),
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
    const st = e.target.closest('[data-study]');
    if (st) { e.preventDefault(); D.openStudy(st.dataset.study); return; }
    const el = e.target.closest('[data-ref]');
    if (el && el.tagName === 'A') e.preventDefault();
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
          return `<span class="seg r${rank(v)}" style="width:${w.toFixed(2)}%" data-ref="${esc(ref)}" tabindex="-1"
            title="${esc(valueLabel(v))}: ${fs.length} studies (${Math.round(w)}%)">${w >= 9 ? `${Math.round(w)}%` : ''}</span>`;
        }).join('');
        return `<div class="qa-row"><span class="lab" title="${esc(it.definition)}">${esc(it.label_en)}</span>
          <span class="stackbar">${segs}</span>
          <span class="legend">${vals.map(v => [v, P.filter(f => (f.qa[it.code] || 'nr') === v).length]).filter(([, n]) => n).map(([v, n]) =>
            `<span class="lg" data-ref="${esc(`${it.code}|${v}`)}"><i class="r${rank(v)}"></i>${esc(valueLabel(v))} (${n})</span>`).join('')}</span></div>`;
      }).join('');
      stack.append(h(`<div class="card"><h3>${esc(grp)}</h3>${P.length ? rows : '<p class="muted">No studies match.</p>'}</div>`));
    }

    // ---------------------------------------------------------------- reference materials (five classes)
    const described = P.filter(f => f.rmTypes.length && !f.rmTypes.includes('NONE'));
    const techList = f => split(f.s.techniques).map(c => short(D, 'method_step', c)).join(', ') || '–';
    if (P.some(f => f.rmTypes.length)) {
      const rmSpec = (title, fs, valueOf, valueHead) => ({
        title, valueHead, rows: [...fs].sort((a, b) => (b.s.year || 0) - (a.s.year || 0)).map(f => ({
          id: f.s.study_id, study: f.s.label, matrix: techList(f), value: valueOf(f), attribution: '' })),
        summary: `<b>${fs.length} studies</b>`, note: 'Matrix column: analysis techniques of the study.' });
      const usesOf = f => f.rmUses.map(c => label(D, 'refmat_use', c)).join(', ') || '–';
      const classesOf = f => f.rmTypes.map(c => label(D, 'refmat_type', c)).join(', ');
      const classes = Object.values(D.vocab.refmat_type).filter(t => t.code !== 'NONE');
      const classBars = classes.map(t => {   // kept in traceability order, strongest first
        const fs = described.filter(f => f.rmTypes.includes(t.code));
        REFS.set(`rmt|${t.code}`, () => rmSpec(t.label_en, fs, usesOf, 'Used for'));
        return [t.label_en, fs.length, t.code];
      }).filter(r => r[1]);
      const useBars = Object.values(D.vocab.refmat_use).map(u => {
        const fs = described.filter(f => f.rmUses.includes(u.code));
        REFS.set(`rmu|${u.code}`, () => rmSpec(`Used for: ${u.label_en}`, fs, classesOf, 'Material'));
        return [u.label_en, fs.length, u.code];
      }).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
      const c = h(`<div class="card"><h3>Reference materials</h3>
        <p class="muted small">${described.length} studies described a reference material; ${P.filter(f => f.rmTypes.includes('NONE')).length}
          stated that none was used. Classes run from the strongest traceability (certified) to materials that are not plastic references.</p>
        <h4 class="sub-h">Kind of material</h4></div>`);
      c.append(bars(classBars, { limit: 8, ref: k => `rmt|${k}` }));
      c.append(h(`<dl class="defs">${classes.map(t => `<dt>${esc(t.label_en)}</dt><dd>${esc(t.definition)}</dd>`).join('')}</dl>`));
      c.append(h('<h4 class="sub-h">Used for</h4>'));
      c.append(bars(useBars, { limit: 10, ref: k => `rmu|${k}` }));
      stack.append(c);
    }

    // ---------------------------------------------------------------- recovery validation coverage
    const withRec = P.filter(f => f.rec.length);
    if (withRec.length) {
      const STATUS = [['MATCHED', 'All reported polymers validated', 1], ['PARTIAL', 'Some reported polymers not validated', 2],
        ['NONE_MATCHED', 'No reported polymer validated', 4], ['NOT_NAMED', 'Spike polymer not named', 5],
        ['NO_SAMPLE', 'No polymers reported in samples', 5]];
      const spikeText = f => [...f.spiked.entries()].map(([p, e]) =>
        `${p} (${[e.mass && 'mass', e.count && 'count'].filter(Boolean).join('+')}${e.full ? '' : ', partial workflow'})`).join('; ') || '–';
      const covSpec = (title, fs, note = '') => ({
        title, valueHead: 'Spiked (recovery)', col4: 'Status',
        rows: [...fs].sort((a, b) => (b.s.year || 0) - (a.s.year || 0)).map(f => ({
          id: f.s.study_id, study: f.s.label, matrix: `Reported: ${[...f.reported].join(', ') || '–'}`, value: spikeText(f),
          attribution: (STATUS.find(x => x[0] === f.coverage) || [, ''])[1] })),
        summary: `<b>${fs.length} studies</b>`,
        note: note || 'Reported = polymers detected in study samples; spiked = polymers with a mass or count recovery value (same polymer or its family).' });
      const segs = STATUS.map(([code, lab, r]) => {
        const fs = withRec.filter(f => f.coverage === code);
        if (!fs.length) return '';
        REFS.set(`cov|${code}`, () => covSpec(lab, fs));
        const w = 100 * fs.length / withRec.length;
        return `<span class="seg r${r}" style="width:${w.toFixed(2)}%" data-ref="cov|${code}" tabindex="-1" title="${esc(lab)}: ${fs.length} studies">${w >= 8 ? fs.length : ''}</span>`;
      }).join('');
      const legend = STATUS.filter(([code]) => withRec.some(f => f.coverage === code)).map(([code, lab, r]) =>
        `<span class="lg" data-ref="cov|${code}"><i class="r${r}"></i>${esc(lab)} (${withRec.filter(f => f.coverage === code).length})</span>`).join('');

      // per polymer: studies reporting it, and whether they validated that polymer
      const reporting = P.filter(f => f.reported.size);
      const polys = [...new Set(reporting.flatMap(f => [...f.reported]))]
        .map(p => [p, reporting.filter(f => f.reported.has(p)).length]).sort((a, b) => b[1] - a[1]).slice(0, 14);
      const cell = (p, key, fs, lab) => {
        if (!fs.length) return '<td class="num muted">0</td>';
        REFS.set(`pv|${p}|${key}`, () => covSpec(`${p} – ${lab}`, fs));
        return `<td class="num" data-ref="pv|${esc(p)}|${key}">${fs.length}</td>`;
      };
      const rowsHtml = polys.map(([p, n]) => {
        const rs = reporting.filter(f => f.reported.has(p));
        const e = f => f.spiked.get(p) || {};
        const fullMass = rs.filter(f => e(f).mass && e(f).full), fullCount = rs.filter(f => e(f).count && e(f).full);
        const partial = rs.filter(f => f.spiked.has(p) && !e(f).full), none = rs.filter(f => !f.spiked.has(p));
        const valid = rs.filter(f => e(f).full).length;
        return `<tr><td>${esc(p)} <span class="muted small">${esc(label(D, 'polymer', p))}</span></td>${cell(p, 'all', rs, 'reported in samples')}
          ${cell(p, 'mass', fullMass, 'full-workflow mass recovery')}${cell(p, 'count', fullCount, 'full-workflow count recovery')}
          ${cell(p, 'partial', partial, 'partial-workflow recovery only')}${cell(p, 'none', none, 'no recovery for this polymer')}
          <td><span class="minibar"><span style="width:${(100 * valid / n).toFixed(1)}%"></span></span> ${Math.round(100 * valid / n)}%</td></tr>`;
      }).join('');

      // spike size vs smallest reported particle size
      const sized = withRec.filter(f => f.spikeMin != null && f.reportedMin != null);
      const larger = sized.filter(f => f.spikeMin > f.reportedMin);
      REFS.set('size|larger', () => covSpec('Spike particles larger than the smallest particles reported', larger,
        'Value column: spiked polymers. Each spike was larger than the smallest particle size the study reported in its samples.'));
      REFS.set('size|all', () => covSpec('Studies with both spike size and reported particle sizes', sized));

      const c = h(`<div class="card"><h3>Recovery validation coverage</h3>
        <p class="muted small">Does a mass or count <b>recovery value</b> back each polymer a study reports? Calibration alone is not
          counted. A polymer counts as validated when the study reports a full-workflow recovery (digestion → analysis) for the same
          polymer or its family (e.g. PA66 → PA); partial-workflow tests are shown separately. ${withRec.length} studies reported recovery values.</p>
        <h4 class="sub-h">Studies</h4>
        <div class="qa-row one"><span class="stackbar">${segs}</span><span class="legend">${legend}</span></div>
        <h4 class="sub-h">Polymers reported in samples, and whether they were validated</h4>
        <div class="tablewrap"><table class="small cov"><thead><tr><th>Polymer</th><th class="num">Reported in</th>
          <th class="num">Mass recovery</th><th class="num">Count recovery</th><th class="num">Partial only</th><th class="num">No recovery</th>
          <th>Validated (full workflow)</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <p class="muted small">Numbers are studies; click a number to see them. A study can count under both mass and count.</p>
        <h4 class="sub-h">Spike size vs particles reported</h4>
        <p class="small">${sized.length ? `Of <a href="#" data-ref="size|all">${sized.length} studies</a> that gave both a spike size and a
          particle size range, <a href="#" data-ref="size|larger"><b>${larger.length}</b></a> spiked particles larger than the smallest
          particles they reported — the recovery does not demonstrate that size.` : 'Spike sizes are not yet available for this selection.'}
          <span class="muted">Spike sizes are recorded for few studies so far; a targeted extraction will add them.</span></p>
      </div>`);
      stack.append(c);

      // reference material log
      const logRows = P.filter(f => f.rec.length || (f.rmTypes.length && !f.rmTypes.includes('NONE')))
        .sort((a, b) => (b.s.year || 0) - (a.s.year || 0));
      stack.append(h(`<details class="card"><summary><b>Reference material log</b> <span class="muted">· ${logRows.length} studies</span></summary>
        <div class="tablewrap"><table class="small log"><thead><tr><th>Study</th><th>Material</th><th>Used for</th>
          <th>Spiked with recovery value</th><th>Reported in samples</th><th>Status</th><th>Supplier</th></tr></thead>
        <tbody>${logRows.map(f => `<tr><td><a href="#" data-study="${esc(f.s.study_id)}">${esc(f.s.label)}</a></td>
          <td>${esc(f.rmTypes.filter(t => t !== 'NONE').map(t => label(D, 'refmat_type', t)).join(', ') || '–')}</td>
          <td>${esc(f.rmUses.map(u => label(D, 'refmat_use', u)).join(', ') || '–')}</td>
          <td>${esc(spikeText(f))}</td><td>${esc([...f.reported].join(', ') || '–')}</td>
          <td>${f.coverage ? `<span class="tag">${esc((STATUS.find(x => x[0] === f.coverage) || [, ''])[1])}</span>` : ''}</td>
          <td class="muted">pending</td></tr>`).join('')}</tbody></table></div>
        <p class="muted small">Supplier, product and certification are being extracted and will fill in the next data update.</p></details>`));
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
    // order: reference materials and recovery coverage first, the log last; only reference materials starts open
    // order: Reference materials, the QA item groups with Recovery validation coverage after Recovery and limits,
    // Reporting over time, Reference material log last (fold defaults: app.js FOLD_OPEN)
    const byTitle = t => [...stack.children].find(c => (c.querySelector(':scope > h3, :scope > summary b') || {}).textContent === t);
    ['Reference materials', 'Blanks', 'Contamination control', 'Recovery and limits', 'Recovery validation coverage', 'Identification',
      'Data availability', 'Reporting over time', 'Reference material log'].map(byTitle).filter(Boolean).forEach(c => stack.append(c));
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
