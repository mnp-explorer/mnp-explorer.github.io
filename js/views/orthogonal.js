// Orthogonal methods: how studies combined analysis techniques — in particular mass spectrometry
// (mass) with spectroscopy (particle number, size, identity) — what each reported, and whether
// the methods agreed. Technique classes come from the instrument runs; the relation codes are
// coded from each study's reported comparison of its methods.
import { split, label, short } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, bars, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

const CLASS = { PYGCMS: 'MS', TEDGCMS: 'MS', LCMS: 'MS', ICPMS: 'MS', OTHER_MS: 'MS',
  UFTIR: 'SPEC', ATR_FTIR: 'SPEC', FTIR: 'SPEC', LDIR: 'SPEC', RAMAN: 'SPEC',
  OPTICAL: 'SCREEN', FLUOR: 'SCREEN', SEM: 'IMAGING', AFM: 'IMAGING' };
const PAIRINGS = [
  ['MS+SPEC', 'Mass spectrometry + spectroscopy', c => c.has('MS') && c.has('SPEC')],
  ['SPEC+SPEC', 'Two spectroscopy techniques (e.g. FTIR + Raman)', (c, t) => t.filter(x => CLASS[x] === 'SPEC').length >= 2],
  ['SCREEN+SPEC', 'Optical / fluorescence screening + spectroscopy', c => c.has('SCREEN') && c.has('SPEC')],
  ['MS+IMAGING', 'Mass spectrometry + electron / force microscopy', c => c.has('MS') && c.has('IMAGING')],
  ['SPEC+IMAGING', 'Spectroscopy + electron / force microscopy', c => c.has('SPEC') && c.has('IMAGING')],
  ['ANY', 'Any combination of two or more techniques', (c, t) => t.length >= 2],
];

export default function orthogonal(root, D, params) {
  const unitLabel = u => label(D, 'result_unit', u);
  const occBy = new Map();
  for (const r of D.occ) (occBy.get(r.study_id) || occBy.set(r.study_id, []).get(r.study_id)).push(r);

  const facts = D.studies.map(s => {
    const techs = split(s.techniques);
    const classes = new Set(techs.map(t => CLASS[t]).filter(Boolean));
    const rs = occBy.get(s.study_id) || [];
    const units = basis => [...new Set(rs.filter(r => r.metric_basis === basis && r.unit && r.unit !== 'other').map(r => r.unit))];
    const massUnits = units('mass'), countUnits = units('count');
    const reportsBoth = (massUnits.length && countUnits.length) || s.metric_basis === 'count+mass';
    return { s, techs, classes, massUnits, countUnits,
      pairings: new Set(PAIRINGS.filter(([, , test]) => test(classes, techs)).map(([k]) => k)),
      relations: new Set((D.orthoBy.get(s.study_id) || []).map(r => r.code)),
      both: reportsBoth ? 'yes' : 'no', groups: new Set(split(s.finder_groups)), scope: s.evidence_scope };
  });
  const q = { pairing: params.get('pairing') || 'MS+SPEC', both: params.get('both') || '', relation: params.get('relation') || '',
    group: params.get('group') || '', scope: params.get('scope') || '' };
  const FIELDS = [
    ['pairing', 'Technique pairing', f => f.pairings, v => (PAIRINGS.find(p => p[0] === v) || [, v])[1], 'Any study'],
    ['both', 'Reports mass and count', f => [f.both], v => (v === 'yes' ? 'Yes – both mass and count' : 'No – one basis only'), 'Either'],
    ['relation', 'How the methods related', f => f.relations, v => label(D, 'ortho_relation', v), 'Any relation'],
    ['group', 'Matrix group', f => f.groups, v => v, 'Any matrix group'],
    ['scope', 'Evidence', f => [f.scope], v => (v === 'methods_only' ? 'Methods only' : 'Occurrence studies'), 'All studies'],
  ];

  root.append(h(`<section><h2>Orthogonal methods</h2>
    <p class="muted">How studies combined analysis techniques — for example mass spectrometry (polymer mass) with FTIR, LDIR or Raman
      (particle number, size and identity) — what each technique reported, and whether the methods agreed. Each filter narrows the others.
      <span class="ref-hint">Click a bar, a cell or a study to see details.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the studies.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="orClear">Clear</button></div>
    <div id="or"></div></section>`));
  const out = root.querySelector('#or');
  const sel = n => root.querySelector(`[name=${n}]`);

  const REFS = new Map();
  out.addEventListener('click', e => {
    const st = e.target.closest('[data-study]');
    if (st) { e.preventDefault(); D.openStudy(st.dataset.study); return; }
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  const relText = f => [...f.relations].map(c => label(D, 'ortho_relation', c)).join(', ');
  const spec = (title, fs) => ({
    title, valueHead: 'Techniques · relation', rows: [...fs].sort((a, b) => (b.s.year || 0) - (a.s.year || 0)).map(f => ({
      id: f.s.study_id, study: f.s.label, matrix: split(f.s.finder_groups).join(', '),
      value: `${f.techs.map(t => short(D, 'method_step', t)).join(' + ')}${f.relations.size ? ' · ' + relText(f) : ''}`, attribution: '' })),
    summary: `<b>${fs.length} studies</b>` });

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      let opts = facetOptions(facts, F, k, valuesOf, q[k]);
      if (k === 'pairing') opts = PAIRINGS.map(([p]) => [p, (opts.find(o => o[0] === p) || [, 0])[1]]);
      sel(k).innerHTML = `<option value="">${esc(blank)}</option>` + opts.map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#orthogonal?${new URLSearchParams(q)}`);
    const P = crossFilter(facts, F);
    const pct = n => (P.length ? `${Math.round(100 * n / P.length)}%` : '–');
    const nBoth = P.filter(f => f.both === 'yes').length;
    out.replaceChildren(kpis([[P.length, 'studies'], [nBoth, `report mass and count (${pct(nBoth)})`],
      [P.filter(f => f.relations.has('DISCORDANT')).length, 'report disagreement'],
      [P.filter(f => f.relations.has('AGREEMENT') || f.relations.has('CONFIRMATORY')).length, 'report agreement or confirmation']]));
    const stack = h('<div class="stack"></div>');
    const card = (title, el, note = '') => {
      const c = h(`<div class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
      c.append(el);
      stack.append(c);
    };
    if (!P.length) {
      stack.append(h('<p class="muted">No studies match these filters.</p>'));
      out.append(stack);
      return;
    }

    // 1. technique × technique co-use
    // lower triangle only (the grid is symmetric); totals in the labels instead of a diagonal
    const total = t => P.filter(f => f.techs.includes(t)).length;
    const techs = [...new Set(P.flatMap(f => f.techs))].map(t => [t, total(t)])
      .sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 12);
    const pairOf = (a, b) => P.filter(f => f.techs.includes(a) && f.techs.includes(b));
    const max = Math.max(1, ...techs.flatMap((a, i) => techs.slice(0, i).map(b => pairOf(a, b).length)));
    const name = t => `${esc(short(D, 'method_step', t))} <span class="muted">(${total(t)})</span>`;
    // rows: most-used technique at the bottom; columns: the others, left to right by use
    const rowTechs = techs.slice(0, -1);
    const cols = techs.slice(1);
    card('Techniques used together', techs.length < 2 ? h('<p class="muted">Fewer than two techniques in this selection.</p>')
      : h(`<div class="tablewrap"><table class="matrix pairs">
      <tbody>${rowTechs.map((a, i) => `<tr>${cols.map((b, j) => {
        if (j < i) return '<td class="blank"></td>';
        const fs = pairOf(a, b);
        if (!fs.length) return '<td class="cell"></td>';
        const ref = `p|${a}|${b}`;
        REFS.set(ref, () => spec(`${short(D, 'method_step', a)} + ${short(D, 'method_step', b)}`, fs));
        return `<td class="cell heat" data-ref="${esc(ref)}" style="--a:${(fs.length / max).toFixed(2)}">${fs.length}</td>`;
      }).join('')}<th scope="row" title="${esc(label(D, 'method_step', a))}">${name(a)}</th></tr>`).reverse().join('')}</tbody>
      <tfoot><tr>${cols.map(t => `<th title="${esc(label(D, 'method_step', t))}">${name(t)}</th>`).join('')}<td></td></tr></tfoot>
      </table></div>`),
      'Number of studies that used both techniques. Totals in brackets: all studies in this selection that used the technique.');

    // 2. how the methods related
    const rel = [...new Set(P.flatMap(f => [...f.relations]))].map(c => {
      const fs = P.filter(f => f.relations.has(c));
      REFS.set(`r|${c}`, () => spec(label(D, 'ortho_relation', c), fs));
      return [label(D, 'ortho_relation', c), fs.length, c];
    }).sort((a, b) => b[1] - a[1]);
    card('How the methods related', bars(rel, { limit: 10, ref: c => `r|${c}` }),
      `Coded from each study's own comparison of its methods; a study can have several. ${P.filter(f => !f.relations.size).length} studies did not describe the comparison.`);

    // 3. per-study table: what each class reported
    const massBy = f => f.techs.filter(t => CLASS[t] === 'MS');
    const countBy = f => f.techs.filter(t => ['SPEC', 'SCREEN', 'IMAGING'].includes(CLASS[t]) || t === 'ICPMS');
    const rows = [...P].sort((a, b) => (b.both === 'yes') - (a.both === 'yes') || (b.s.year || 0) - (a.s.year || 0)).slice(0, 150);
    card(q.pairing === 'MS+SPEC' ? 'Mass spectrometry with spectroscopy, study by study' : 'Study by study',
      h(`<div class="tablewrap"><table class="small ortho-table"><thead><tr><th>Study</th><th>Mass by</th><th>Mass units</th>
        <th>Particles by</th><th>Count units</th><th>Relation</th></tr></thead><tbody>${rows.map(f => `<tr>
        <td><a href="#" data-study="${esc(f.s.study_id)}">${esc(f.s.label)}</a><br><span class="muted">${esc(split(f.s.finder_groups).join(', '))}</span></td>
        <td>${massBy(f).map(t => esc(short(D, 'method_step', t))).join(', ') || '–'}</td>
        <td>${f.massUnits.map(u => esc(unitLabel(u))).join(', ') || (/mass/.test(f.s.metric_basis) ? 'reported' : '–')}</td>
        <td>${countBy(f).map(t => esc(short(D, 'method_step', t))).join(', ') || '–'}</td>
        <td>${f.countUnits.map(u => esc(unitLabel(u))).join(', ') || (/count/.test(f.s.metric_basis) ? 'reported' : '–')}</td>
        <td>${[...f.relations].map(c => `<span class="tag">${esc(label(D, 'ortho_relation', c))}</span>`).join(' ') || '<span class="muted">–</span>'}</td>
      </tr>`).join('')}</tbody></table></div>`),
      `Studies reporting both mass and count first${P.length > 150 ? ' (150 of ' + P.length + ' shown)' : ''}. "Mass by" lists mass-spectrometry techniques; `
      + '"particles by" lists techniques that count, size or identify particles. Units come from the occurrence results; "reported" = stated by the study without structured values.');
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) q[e.target.name] = e.target.value;
    draw();
  });
  root.querySelector('#orClear').addEventListener('click', () => {
    Object.assign(q, { pairing: '', both: '', relation: '', group: '', scope: '' });
    draw();
  });
  draw();
}
