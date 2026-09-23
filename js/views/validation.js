// Validation: spike-recovery evidence. Filters narrow each other (over recovery values);
// each summary row opens a reference popover with every value behind it.
import { countBy, split, label, stepLabel, quantiles, fmt, num } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { RECOVERY_REMOVAL } from '../../script/finder.js';
import { esc, h, ranges, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

const SCOPE = { digestion_to_end: 'Digestion → analysis', physical_to_end: 'Physical treatment → analysis',
  partial: 'Partial workflow', stability: 'Material stability only' };
const ANALYSIS = { pygcms: 'Py-GC-MS', pygcmsms: 'Py-GC-MS/MS', lcms_depoly: 'LC-MS (depolymerisation)', counting: 'Particle counting',
  fluorescence: 'Fluorescence', raman: 'Raman', gravimetry: 'Gravimetry' };
const BAND = [70, 130];

export default function validation(root, D, params) {
  // one item per recovery value, with the facets used by the filters
  const items = D.recovery.map(r => {
    const s = D.study[r.study_id];
    return { r, s, value: num(r.value_pct),
      groups: new Set(split(s.finder_groups)), chars: new Set(split(s.matrix_characters)),
      digestion: [...(RECOVERY_REMOVAL[r.removal] || ['UNRESOLVED'])].sort().join('+'),
      polymer: r.polymer_code || 'POOLED', analysis: r.analysis, endpoint: r.endpoint, scope: r.scope };
  });
  const q = { endpoint: params.get('endpoint') || '', scope: params.get('scope') || 'digestion_to_end', group: params.get('group') || '',
    character: params.get('character') || '', digestion: params.get('digestion') || '', polymer: params.get('polymer') || '',
    analysis: params.get('analysis') || '' };

  // single digestion: full name; combinations: short names ("Acid + Alkali + Enzyme") so labels stay on one line
  const digLabel = v => {
    if (v === 'UNRESOLVED') return 'Not resolved';
    const codes = v.split('+');
    return codes.length === 1 ? stepLabel(D, 'removal', v) : codes.map(c => (D.stepVocab.removal[c] || {}).short_label || c).join(' + ');
  };
  const polyLabel = v => (v === 'POOLED' ? 'Pooled / unspecified' : `${v} – ${label(D, 'polymer', v)}`);
  const FIELDS = [
    ['endpoint', 'Endpoint', f => [f.endpoint], v => ({ mass: 'Mass', count: 'Particle count' }[v] || v), 'Any endpoint'],
    ['scope', 'Scope', f => [f.scope], v => SCOPE[v] || v, 'Any scope'],
    ['group', 'Matrix group', f => f.groups, v => v, 'Any matrix group'],
    ['character', 'Matrix character', f => f.chars, v => label(D, 'matrix_character', v), 'Any matrix character'],
    ['digestion', 'Digestion', f => [f.digestion], digLabel, 'Any digestion'],
    ['polymer', 'Polymer', f => [f.polymer], polyLabel, 'Any polymer'],
    ['analysis', 'Analysis', f => [f.analysis], v => ANALYSIS[v] || v, 'Any analysis'],
  ];

  root.append(h(`<section><h2>Validation</h2>
    <p class="muted">Spike-recovery values reported by ${new Set(D.recovery.map(r => r.study_id)).size} studies.
      Full-workflow recoveries (digestion → analysis) show how much of a spike survives the whole method; partial and stability
      tests are listed separately. Each filter narrows the others.
      <span class="ref-hint">Click any row to see the individual values.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the individual values.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="valClear">Clear</button>
    </div><div id="val"></div></section>`));
  const out = root.querySelector('#val');
  const sel = n => root.querySelector(`[name=${n}]`);

  // reference popovers
  const REFS = new Map();
  out.addEventListener('click', e => {
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  const pointSpec = (title, its) => {
    const q = quantiles(its.map(f => f.value));
    const inBand = its.filter(f => f.value >= BAND[0] && f.value <= BAND[1]).length;
    const rows = [...its].sort((a, b) => a.value - b.value).map(({ r, s }) => {
      const size = r.size_lo_um ? `${fmt(num(r.size_lo_um))}${r.size_hi_um && r.size_hi_um !== r.size_lo_um ? '–' + fmt(num(r.size_hi_um)) : ''} µm` : '';
      const sd = r.sd ? ` ± ${fmt(num(r.sd))} (${r.variability_metric})` : '';
      return { id: r.study_id, study: s.label, matrix: `${r.matrix.replace(/-/g, ' ')} · ${split(s.finder_groups).join(', ')}`,
        value: `${fmt(num(r.value_pct))}%${sd} · ${r.polymer_code || r.polymer_raw}${size ? ' · ' + size : ''} · ${r.removal.replace(/_/g, ' + ')} → ${ANALYSIS[r.analysis] || r.analysis}${r.n ? ` · n=${r.n}` : ''}`,
        attribution: '' };
    });
    return { title, rows,
      summary: q ? `Median <b>${fmt(q.median)}%</b> (IQR ${fmt(q.q1)}–${fmt(q.q3)}) · ${its.length} values from ${new Set(its.map(f => f.r.study_id)).size} studies ·
        ${inBand} within ${BAND.join('–')}%` : '',
      note: 'Matrix is the material the spike was added to (controls such as water or reagent are named).' };
  };

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      sel(k).innerHTML = `<option value="">${esc(blank)}</option>` + facetOptions(items, F, k, valuesOf, q[k]).map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#validation?${new URLSearchParams(q)}`);

    const P = crossFilter(items, F);
    const all = quantiles(P.map(f => f.value));
    out.replaceChildren(kpis([[P.length, 'recovery values'], [new Set(P.map(f => f.r.study_id)).size, 'studies'],
      [all ? fmt(all.median) + '%' : '–', 'median recovery'], [P.filter(f => f.value >= BAND[0] && f.value <= BAND[1]).length, `within ${BAND.join('–')}%`]]));

    const stack = h('<div class="stack"></div>');
    const section = (title, key, keyOf, labelOf) => {
      const groups = new Map();
      for (const f of P) for (const k of [].concat(keyOf(f))) (groups.get(k) || groups.set(k, []).get(k)).push(f);
      const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, its]) => {
        const id = `${key}|${k}`;
        REFS.set(id, () => pointSpec(`${title}: ${labelOf(k)}`, its));
        return { label: labelOf(k), q: quantiles(its.map(f => f.value)), ref: id };
      });
      const el = ranges(rows, { domain: [0, 160], unit: '%', scale: 'linear', step: 20 });
      // make each row clickable
      el.querySelectorAll('.range').forEach((row, i) => { if (rows[i]) { row.dataset.ref = rows[i].ref; row.classList.add('clickable'); } });
      const c = h(`<div class="card"><h3>${title}</h3></div>`);
      c.append(el);
      stack.append(c);
    };
    section('By digestion', 'dig', f => f.digestion, digLabel);
    section('By analysis', 'ana', f => f.analysis, v => ANALYSIS[v] || v);
    section('By polymer', 'pol', f => f.polymer, polyLabel);
    section('By matrix character', 'chr', f => [...f.chars], v => label(D, 'matrix_character', v));
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    const t = e.target;
    if (t.name in q) q[t.name] = t.value;
    draw();
  });
  root.querySelector('#valClear').addEventListener('click', () => {
    Object.assign(q, { endpoint: '', scope: 'digestion_to_end', group: '', character: '', digestion: '', polymer: '', analysis: '' });
    draw();
  });
  draw();
}
