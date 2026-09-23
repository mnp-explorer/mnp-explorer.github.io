// Method finder view: the user describes sample + target; ranked pipelines with evidence.
// Every control is cross-filtered: its options and counts come from the studies that match
// all the other current selections (script/facets.js).
import { rankPipelines, techniqueFits, SETTINGS } from '../../script/finder.js';
import { studyFacts, matching, countsFor, sizeHistogram, SIZE_DOMAIN } from '../../script/facets.js';
import { countBy, split, label, short, fmt, fmtRange, tick, num } from '../../script/summaries.js';
import { esc, h } from '../ui.js';

const TIER_TEXT = {
  A: 'Validated: 3+ studies on similar matrices and a full-workflow recovery within the accepted band',
  B: 'Supported: 3+ studies on similar matrices, no matching recovery validation',
  C: 'Limited: 1–2 studies on similar matrices',
  D: 'Extrapolated: only studies on other matrices',
};
const KEY_PARAMS = ['ftir_modality', 'ftir_resolution', 'ftir_scans', 'ftir_aperture', 'ftir_step', 'raman_laser',
  'raman_power', 'raman_objective', 'raman_acq_time', 'raman_step', 'pyro_temp', 'id_threshold', 'spectral_library', 'fluor_dye'];

// Size slider: integer positions on a log scale across SIZE_DOMAIN.
const STEPS = 300;
const [L0, L1] = SIZE_DOMAIN.map(Math.log10);
const posToSize = p => 10 ** (L0 + (L1 - L0) * p / STEPS);
const sizeToPos = v => Math.round(STEPS * (Math.log10(v) - L0) / (L1 - L0));
const nice = v => +v.toPrecision(v < 1 ? 1 : 2);

let FACTS = null;

export default function finder(root, D, params) {
  FACTS = FACTS || studyFacts(D);
  const p = Object.fromEntries(params);
  const q = {
    group: p.group || '', character: p.character || '', polymer: p.polymer || '',
    sizeLo: p.sizeLo || '', sizeHi: p.sizeHi || '', basis: p.basis || '',
    instruments: split(p.instruments), needPolymerId: p.needPolymerId !== '0',
  };

  root.append(h(`<section>
    <h2>Method finder</h2>
    <p class="muted">Describe your sample and target. Each choice narrows the others to what the evidence covers.
      Pipelines are ranked by evidence tier, then by how many studies close to your case used them.
      Settings are what those studies reported, not optimised values.</p>
    <form class="finder card" autocomplete="off">
      <label>Matrix group <select name="group"></select></label>
      <label>Matrix character <select name="character"></select></label>
      <label>Target polymer <select name="polymer"></select></label>
      <label>Result needed <select name="basis"></select></label>
      <div class="sizebox">
        <div class="sizehead"><span>Target size</span><b id="sizeText"></b></div>
        <div class="hist" id="hist" aria-hidden="true"></div>
        <div class="dual">
          <input type="range" name="sLo" min="0" max="${STEPS}" step="1" aria-label="Minimum size">
          <input type="range" name="sHi" min="0" max="${STEPS}" step="1" aria-label="Maximum size">
        </div>
        <div class="ticks">${[0.01, 0.1, 1, 10, 100, 1000, 10000].map(t =>
          `<span style="left:${(100 * sizeToPos(t) / STEPS).toFixed(2)}%">${tick(t)}</span>`).join('')}</div>
        <p class="small muted" id="sizeNote"></p>
      </div>
      <fieldset class="instr"><legend>Instruments available <span class="small muted">(none ticked = all)</span></legend>
        <div class="checks" id="instr"></div></fieldset>
      <div class="checks"><label><input type="checkbox" name="needPolymerId"> Polymer identity required</label></div>
      <div class="row"><button type="button" class="ghost" id="clear">Clear all</button></div>
    </form>
    <p class="matchline" id="matchline"></p>
    <div id="results"></div>
  </section>`));

  const form = root.querySelector('form');
  const $ = n => form.querySelector(`[name=${n}]`);
  const out = root.querySelector('#results');

  const setSelect = (name, counts, labelOf, blank) => {
    const sel = $(name);
    const cur = q[name];
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (cur && !counts.has(cur)) rows.unshift([cur, 0]);
    sel.innerHTML = `<option value="">${esc(blank)}</option>` + rows.map(([v, n]) =>
      `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
  };

  const refreshControls = () => {
    setSelect('group', countsFor(D, FACTS, q, 'group', f => f.groups), v => v, 'Any matrix group');
    setSelect('character', countsFor(D, FACTS, q, 'character', f => f.chars), v => label(D, 'matrix_character', v), 'Any matrix character');
    setSelect('polymer', countsFor(D, FACTS, q, 'polymer', f => f.polymers), v => `${v} – ${label(D, 'polymer', v)}`, 'Any polymer');
    const bc = countsFor(D, FACTS, q, 'basis', f => (f.basis || '').split('+').filter(Boolean));
    setSelect('basis', bc, v => ({ count: 'Particle count / size / shape', mass: 'Mass concentration' }[v] || v), 'Either');

    // instruments: counts over studies matching everything except the instrument choice
    const tc = new Map();
    for (const f of matching(D, FACTS, { ...q, instruments: [] }, 'instruments')) for (const t of f.techs) tc.set(t, (tc.get(t) || 0) + 1);
    const all = countBy(D.runs, r => r.technique).map(([t]) => t);
    form.querySelector('#instr').innerHTML = all.filter(t => tc.get(t) || q.instruments.includes(t)).sort((a, b) => (tc.get(b) || 0) - (tc.get(a) || 0)).map(t => {
      const fit = techniqueFits(D, t, { ...q, instruments: [] });
      return `<label class="${fit.ok ? '' : 'off'}" title="${esc(fit.ok ? label(D, 'method_step', t) : `Not usable: ${fit.why}`)}">
        <input type="checkbox" value="${esc(t)}"${q.instruments.includes(t) ? ' checked' : ''}${fit.ok ? '' : ' disabled'}>
        ${esc(short(D, 'method_step', t))} <span class="muted">${tc.get(t) || 0}</span></label>`;
    }).join('') || '<span class="muted small">No instrument matches.</span>';

    // size slider + histogram of the studies matching everything except size
    const pool = matching(D, FACTS, q, 'size');
    const hist = sizeHistogram(pool);
    const max = Math.max(1, ...hist.map(b => b.n));
    const lo = num(q.sizeLo) ?? SIZE_DOMAIN[0], hi = num(q.sizeHi) ?? SIZE_DOMAIN[1];
    form.querySelector('#hist').innerHTML = hist.map(b =>
      `<span class="${b.hi >= lo && b.lo <= hi ? 'in' : ''}" style="height:${(100 * b.n / max).toFixed(0)}%" title="${tick(nice(b.lo))}–${tick(nice(b.hi))} µm: ${b.n} studies"></span>`).join('');
    $('sLo').value = sizeToPos(lo);
    $('sHi').value = sizeToPos(hi);
    form.querySelector('#sizeText').textContent = q.sizeLo || q.sizeHi
      ? `${q.sizeLo ? fmt(+q.sizeLo) : '0'} – ${q.sizeHi ? fmt(+q.sizeHi) : 'any'} µm` : 'Any size';
    const withSize = pool.filter(f => f.sizes.length);
    const env = withSize.flatMap(f => f.sizes);
    form.querySelector('#sizeNote').textContent = env.length
      ? `${withSize.length} of ${pool.length} matching studies report sizes, spanning ${fmt(Math.min(...env.map(x => x[0])))}–${fmt(Math.max(...env.map(x => x[1])))} µm.`
      : 'No size information for the current selection.';
    $('needPolymerId').checked = q.needPolymerId;

    const exact = matching(D, FACTS, q);
    root.querySelector('#matchline').innerHTML = `<b>${exact.length}</b> of ${FACTS.length} studies match every selection.
      Rankings also draw on similar matrices, shown as lower tiers.`;
  };

  let timer;
  const update = () => {
    refreshControls();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const qs = new URLSearchParams({ group: q.group, character: q.character, polymer: q.polymer, sizeLo: q.sizeLo,
        sizeHi: q.sizeHi, basis: q.basis, instruments: q.instruments.join(';'), needPolymerId: q.needPolymerId ? '1' : '0' });
      history.replaceState(null, '', `#finder?${qs}`);
      render(out, D, { ...q, polymers: q.polymer ? [q.polymer] : [] });
    }, 120);
  };

  form.addEventListener('change', e => {
    const t = e.target;
    if (['group', 'character', 'polymer', 'basis'].includes(t.name)) q[t.name] = t.value;
    else if (t.name === 'needPolymerId') q.needPolymerId = t.checked;
    else if (t.closest('#instr')) q.instruments = [...form.querySelectorAll('#instr input:checked')].map(x => x.value);
    else return;
    update();
  });
  // slider: live text while dragging, filter on release
  const slide = () => {
    let a = +$('sLo').value, b = +$('sHi').value;
    if (a > b) [a, b] = [b, a];
    q.sizeLo = a <= 0 ? '' : String(nice(posToSize(a)));
    q.sizeHi = b >= STEPS ? '' : String(nice(posToSize(b)));
    form.querySelector('#sizeText').textContent = q.sizeLo || q.sizeHi
      ? `${q.sizeLo ? fmt(+q.sizeLo) : '0'} – ${q.sizeHi ? fmt(+q.sizeHi) : 'any'} µm` : 'Any size';
  };
  ['sLo', 'sHi'].forEach(n => {
    $(n).addEventListener('input', slide);
    $(n).addEventListener('change', () => { slide(); update(); });
  });
  root.querySelector('#clear').addEventListener('click', () => {
    Object.assign(q, { group: '', character: '', polymer: '', sizeLo: '', sizeHi: '', basis: '', instruments: [], needPolymerId: true });
    update();
  });
  update();
}

function render(out, D, q) {
  const { pipelines, excluded } = rankPipelines(D, q);
  const tiers = countBy(pipelines, p => p.tier);
  const top = pipelines.slice(0, 25);
  out.replaceChildren(h(`<div>
    <p class="small muted" style="margin-top:14px">${pipelines.length} pipeline families ·
      ${tiers.map(([t, n]) => `<span class="tier ${t}">${t}</span> ${n}`).join(' · ')}
      ${excluded.length ? ` · excluded techniques: ${excluded.map(([c, why]) => `${esc(short(D, 'method_step', c))} (${esc(why)})`).join('; ')}` : ''}</p>
    ${!q.group && !q.character ? '<p class="note">No matrix selected: every study counts as relevant. Choose a matrix group or character for a meaningful ranking.</p>' : ''}
    <div class="pipes">${top.map((p, i) => card(D, p, i)).join('') || '<p class="muted">No pipeline fits these requirements.</p>'}</div>
    ${pipelines.length > top.length ? `<p class="muted small">Showing the top ${top.length} of ${pipelines.length}.</p>` : ''}
  </div>`));
  out.querySelectorAll('[data-study]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); D.openStudy(a.dataset.study); }));
}

function card(D, p, i) {
  const step = (v, stage) => v === 'NONE' ? `<span class="chip">No ${stage}</span>` :
    v.split('+').map(c => `<span class="chip">${esc(label(D, 'method_step', c))}</span>`).join(' + ');
  const rec = p.recovery.full;
  const st = p.settings;
  const params = KEY_PARAMS.filter(k => st.params[k]).map(k => {
    const v = st.params[k];
    const val = v.counts
      ? Object.entries(v.counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c, n]) => `${esc(label(D, 'spectral_library', c))} (${n})`).join(', ')
      : `${fmtRange(v.q)} ${esc(v.unit)}${v.q.n ? ` <span class="muted">n=${v.q.n}</span>` : ''}`;
    return `<div><span>${esc(label(D, 'instrument_parameter', k))}:</span> ${val}</div>`;
  }).join('');
  const buckets = countBy(p.studies, x => x.bucket);
  const bucketText = buckets.map(([b, n]) => `${n} ${{ group: 'same group', character: 'same matrix character', other: 'other matrices', any: 'studies' }[b]}`).join(', ');
  const studies = p.studies.slice(0, 10).map(x => `<li><a href="#" data-study="${esc(x.s.study_id)}">${esc(x.s.label)}</a>
      <span class="muted small">${esc(split(x.s.finder_groups).join(', '))}${x.notes.length ? ' · ' + esc(x.notes.join('; ')) : ''}${x.recovery.length ? ` · ${x.recovery.length} recovery value(s)` : ''}</span></li>`).join('');
  return `<article class="pipe ${p.tier}">
    <h3><span class="tier ${p.tier}" title="${esc(TIER_TEXT[p.tier])}">Tier ${p.tier}</span>
      <span class="steps">${step(p.removal, 'digestion')} <span class="arrow">→</span> ${step(p.separation, 'separation')}
      <span class="arrow">→</span> <span class="chip"><b title="${esc(label(D, 'method_step', p.technique))}">${esc(short(D, 'method_step', p.technique))}</b></span></span></h3>
    <p class="small muted">${esc(TIER_TEXT[p.tier])}. Evidence: ${bucketText}.</p>
    <div class="facts">
      <div><span>Digestion temperature:</span> ${fmtRange(st.digestionTempC)} °C</div>
      <div><span>Digestion time:</span> ${fmtRange(st.digestionTimeH)} h</div>
      <div><span>Filter pore:</span> ${fmtRange(st.filterPoreUm)} µm</div>
      <div><span>Smallest size reported:</span> ${fmtRange(st.minSizeUm)} µm</div>
      <div><span>Recovery (full workflow):</span> ${rec ? `${fmtRange(rec)} % · ${p.recovery.nInBand}/${p.recovery.nFull} within ${SETTINGS.recoveryBand.join('–')}%` : 'none on similar matrices'}</div>
    </div>
    ${params ? `<details><summary>Reported instrument settings</summary><div class="facts">${params}</div></details>` : ''}
    <details${i < 2 ? ' open' : ''}><summary>Supporting studies (${p.nStudies})</summary><ol class="small">${studies}</ol>
      ${p.nStudies > 10 ? `<p class="muted small">${p.nStudies - 10} more not shown.</p>` : ''}</details>
  </article>`;
}
