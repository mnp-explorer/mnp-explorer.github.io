// Occurrence: what was measured in which organ or sample matrix, over which particle sizes, and by
// which kind of method. One row per organism × organ/site (e.g. Human · blood); expand a row for its
// studies. Each row and study shows two detection windows on a log size axis —
//   spectroscopic methods (FTIR, LDIR, Raman; microscopy counts where used): smallest to largest particle counted;
//   mass methods (Py-GC-MS, TED-GC-MS, LC-MS, ICP-MS): everything above the filter pore —
// and the reported mass and count values. ◆ marks studies whose mass and count come from
// independent (orthogonal) methods: a mass method and a particle-identifying spectroscopy.
// Rules from the dataset: values compared only within one unit (convertible units are converted);
// a study total is dropped where the study reports its subgroups; non-comparable summaries and
// non-detects are not plotted; values are never summed across groups or polymers.
import { split, label, short, quantiles, fmt, num, centralValue, resultText, resultTags } from '../../script/summaries.js';
import { facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, ranges, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

const MASS_TECH = new Set(['PYGCMS', 'TEDGCMS', 'LCMS', 'ICPMS']);
const PARTICLE_TECH = new Set(['UFTIR', 'ATR_FTIR', 'FTIR', 'LDIR', 'RAMAN', 'FLUOR', 'OPTICAL', 'SEM', 'AFM']);
const ID_TECH = new Set(['UFTIR', 'ATR_FTIR', 'FTIR', 'LDIR', 'RAMAN']);
const MASS_UNIT = { ug_per_g: ['µg/g', 1], mg_per_g: ['µg/g', 1000], ng_per_g: ['µg/g', 0.001], ug_per_mL: ['µg/mL', 1], ng_per_mL: ['µg/mL', 0.001] };
const COUNT_UNIT = { particles_per_g: ['particles/g', 1], particles_per_mL: ['particles/mL', 1], particles_per_L: ['particles/mL', 0.001],
  particles_per_individual: ['particles/individual', 1], particles_per_organ: ['particles/organ', 1], particles_per_sample: ['particles/sample', 1] };
const TOTALS = { mass: new Set(['TOTAL_MASS']), count: new Set(['TOTAL_COUNT']) };
const BANDS = [[0, 1, '< 1 µm'], [1, 10, '1–10 µm'], [10, 20, '10–20 µm'], [20, 100, '20–100 µm'], [100, Infinity, '> 100 µm']];
const DOMAIN = [0.01, 10000];
const METHOD_SETS = { both: 'Mass + spectroscopic methods', particle: 'Spectroscopic methods only', mass: 'Mass methods only', none: 'Method not coded' };
// organisms in a fixed order: human first, then vertebrates, invertebrates, plants and products
const ORGANISM_ORDER = ['Human', 'Mammal (non-human)', 'Bird', 'Other vertebrate', 'Fish', 'Crustacean', 'Bivalve',
  'Other invertebrate', 'Plant or alga', 'Food product', 'Cell culture', 'Other'];
const orgRank = g => { const i = ORGANISM_ORDER.indexOf(g); return i < 0 ? 99 : i; };

const pos = v => +(100 * (Math.log10(Math.min(Math.max(v, DOMAIN[0]), DOMAIN[1])) - Math.log10(DOMAIN[0]))
  / (Math.log10(DOMAIN[1]) - Math.log10(DOMAIN[0]))).toFixed(2);
const median = vs => { const q = quantiles(vs); return q ? q.median : null; };

export default function occurrence(root, D, params) {
  const orgGroup = c => (D.vocab.matrix_organism[c] || {}).finder_group || 'Other';
  const siteLabel = c => label(D, 'organ_site', c || 'OTHER');
  const comparable = lvl => ((D.vocab.summary_level[lvl || ''] || {}).comparable || 'yes') === 'yes';
  const analyteLabel = a => (D.vocab.analyte_group[a] ? D.vocab.analyte_group[a].label_en : `${a} – ${label(D, 'polymer', a)}`);

  // ---------------------------------------------------------------- study facts: methods and windows
  const studyInfo = new Map();
  const info = sid => {
    if (studyInfo.has(sid)) return studyInfo.get(sid);
    const s = D.study[sid];
    const techs = split(s.techniques);
    const hasMass = techs.some(t => MASS_TECH.has(t)), hasPart = techs.some(t => PARTICLE_TECH.has(t));
    const sizes = (D.spansBy.get(sid) || []).filter(x => x.span_type === 'size' && x.kind === 'observed');
    const minRep = num(s.min_particle_size_um);
    const lo = minRep ?? (sizes.length ? Math.min(...sizes.map(x => +x.lo)) : null);
    const hi = sizes.length ? Math.max(...sizes.map(x => +x.hi)) : null;
    const it = { s, techs, hasMass, hasPart, idTech: techs.some(t => ID_TECH.has(t)),
      method: hasMass && hasPart ? 'both' : hasPart ? 'particle' : hasMass ? 'mass' : 'none',
      partLo: hasPart ? lo : null, partHi: hasPart ? hi : null, pore: hasMass ? num(s.filter_pore_um_lo) : null };
    studyInfo.set(sid, it);
    return it;
  };

  // ---------------------------------------------------------------- result values (comparable, converted)
  const rkey = r => `${r.study_id}|${r.analyte}|${r.unit}`;
  const hasSub = new Set(D.occ.filter(r => (D.group[r.group_id] || {}).group_scope !== 'study_aggregate').map(rkey));
  const valuesByGroup = new Map();
  for (const r of D.occ) {
    const g = D.group[r.group_id];
    if (!g || (g.group_scope === 'study_aggregate' && hasSub.has(rkey(r))) || !comparable(r.summary_level)) continue;
    const conv = MASS_UNIT[r.unit] ? ['mass', ...MASS_UNIT[r.unit]] : COUNT_UNIT[r.unit] ? ['count', ...COUNT_UNIT[r.unit]] : null;
    if (!conv) continue;
    const c = centralValue(r);
    if (!c) continue;
    (valuesByGroup.get(g.group_id) || valuesByGroup.set(g.group_id, []).get(g.group_id))
      .push({ r, kind: conv[0], unit: conv[1], value: c.v * conv[2], stat: c.stat });
  }

  // ---------------------------------------------------------------- items for the filters: one per sample group
  const items = D.groups.filter(g => D.study[g.study_id]).map(g => {
    const it = info(g.study_id);
    const vals = valuesByGroup.get(g.group_id) || [];
    return { g, it, key: `${orgGroup(g.organism_code)}|${g.site_code || 'OTHER'}`, group: orgGroup(g.organism_code),
      site: g.site_code || 'OTHER', samples: new Set(split(g.sample_type_code)), method: it.method,
      analytes: new Set(vals.map(v => v.r.analyte)), vals };
  });
  const q = { group: params.get('group') || '', sample: params.get('sample') || '', site: params.get('site') || '',
    analyte: params.get('analyte') || '', method: params.get('method') || '',
    mass: params.get('mass') || 'auto', count: params.get('count') || 'auto' };
  const FIELDS = [
    ['group', 'Organism', f => [f.group], v => v, 'Any organism'],
    ['sample', 'Sample type', f => f.samples, v => label(D, 'matrix_sample_type', v), 'Any sample type'],
    ['site', 'Organ / site', f => [f.site], siteLabel, 'Any organ or site'],
    ['analyte', 'Polymer', f => f.analytes, analyteLabel, 'Totals (all polymers)'],
    ['method', 'Methods used', f => [f.method], v => METHOD_SETS[v], 'Any methods'],
  ];

  root.append(h(`<section><h2>Occurrence</h2>
    <p class="muted">What was measured in each organ or sample matrix, over which particle sizes, and by which kind of method.
      Each row groups the studies of one organism and organ or site; open a row to see its studies. <span class="ref-hint">Click a
      value or a coverage cell to see the studies behind it.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the values.</p>
    <div class="toolbar">${FIELDS.map(([k, lab]) => `<label>${lab} <select name="${k}"></select></label>`).join('')}
      <button type="button" class="ghost" id="occClear">Clear</button></div>
    <div id="occ"></div></section>`));
  const out = root.querySelector('#occ');
  const sel = n => root.querySelector(`[name=${n}]`);
  const REFS = new Map();
  const open = new Set(params.get('open') ? params.get('open').split(',') : []);

  out.addEventListener('click', e => {
    const st = e.target.closest('[data-study]');
    if (st) { e.preventDefault(); D.openStudy(st.dataset.study); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const k = tg.dataset.toggle;
      open.has(k) ? open.delete(k) : open.add(k);
      const lanes = out.querySelector(`[data-lanes="${CSS.escape(k)}"]`);
      if (lanes) lanes.hidden = !open.has(k);
      tg.querySelector('.caret').textContent = open.has(k) ? '▾' : '▸';
      tg.setAttribute('aria-expanded', open.has(k));
      return;
    }
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen() || !REFS.has(el.dataset.ref)) return;
    e.preventDefault();
    e.stopPropagation();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  });
  out.addEventListener('change', e => {
    if (e.target.name === 'massUnit') { q.mass = e.target.value; draw(); }
    if (e.target.name === 'countUnit') { q.count = e.target.value; draw(); }
  });

  const filters = () => Object.fromEntries(FIELDS.map(([k, , valuesOf]) => [k, q[k] ? f => [...valuesOf(f)].includes(q[k]) : null]));

  // one study within one row: its windows and its values (median of its groups, per unit)
  const laneOf = (sid, fs) => {
    const it = info(sid);
    const pick = kind => fs.flatMap(f => f.vals).filter(v => v.kind === kind
      && (q.analyte ? v.r.analyte === q.analyte : TOTALS[kind].has(v.r.analyte)));
    const byUnit = kind => {
      const m = new Map();
      for (const v of pick(kind)) (m.get(v.unit) || m.set(v.unit, []).get(v.unit)).push(v);
      return m;
    };
    const mass = byUnit('mass'), count = byUnit('count');
    const perPolymerOnly = kind => !q.analyte && !pick(kind).length && fs.some(f => f.vals.some(v => v.kind === kind));
    const both = mass.size && count.size;
    return { sid, it, fs, mass, count, massPoly: perPolymerOnly('mass'), countPoly: perPolymerOnly('count'),
      ortho: both && it.hasMass && it.idTech, twoNotOrtho: both && !(it.hasMass && it.idTech) };
  };
  // 'auto' = the unit most studies in this row use
  const rowUnit = (lanes, kind, pref) => {
    if (pref !== 'auto') return pref;
    const c = new Map();
    for (const l of lanes) for (const u of l[kind].keys()) c.set(u, (c.get(u) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  };
  const unitMedian = (lanes, kind, unit) => median(lanes.map(l => l[kind].get(unit)).filter(Boolean).map(vs => median(vs.map(v => v.value))));

  const windowHtml = (partLo, partHi, pore, hasMass, hasPart, medLo) => {
    const bars = [];
    if (hasMass) {
      const l = pore != null ? pos(pore) : 0;
      bars.push(`<span class="win mass${pore == null ? ' faded' : ''}" style="left:${l}%;width:calc(${100 - l}% - 9px)"
        title="Mass method: everything above ${pore != null ? fmt(pore) + ' µm (filter pore)' : 'an unreported filter size'}"></span>`);
    }
    if (hasPart) {
      if (partLo != null) {
        const l = pos(partLo), r = partHi != null ? pos(partHi) : 100;
        bars.push(`<span class="win part${partHi == null ? ' open' : ''}" style="left:${l}%;width:${Math.max(0.8, r - l)}%"
          title="Spectroscopic method: ${fmt(partLo)}–${partHi != null ? fmt(partHi) + ' µm' : '? µm (largest size not reported)'}"></span>`);
        if (medLo != null) bars.push(`<span class="tick" style="left:${pos(medLo)}%" title="Median smallest size: ${fmt(medLo)} µm"></span>`);
      } else {
        bars.push('<span class="win-note">particle sizes not reported</span>');
      }
    }
    return `<span class="track">${bars.join('')}</span>`;
  };
  const valueHtml = (kind, lanes, pref, ref) => {
    const unit = rowUnit(lanes, kind, pref);
    const withUnit = lanes.filter(l => l[kind].get(unit));
    const others = [...new Set(lanes.flatMap(l => [...l[kind].keys()]))].filter(u => u !== unit)
      .map(u => `${u}: ${lanes.filter(l => l[kind].get(u)).length}`);
    const m = unitMedian(lanes, kind, unit);
    const poly = lanes.filter(l => (kind === 'mass' ? l.massPoly : l.countPoly)).length;
    const title = [others.length ? `Other units — ${others.join(', ')}` : '', poly ? `${poly} studies report ${kind} per polymer only` : ''].filter(Boolean).join('. ');
    if (!withUnit.length) return `<span class="val muted" title="${esc(title)}">${others.length || poly ? '·' : '–'}</span>`;
    return `<a href="#" class="val" data-ref="${esc(ref)}" title="${esc(title)}">${fmt(m)} <span class="muted">n=${withUnit.length}</span>${
      pref === 'auto' ? `<br><span class="unit">${esc(unit)}</span>` : ''}</a>`;
  };
  const laneValue = (l, kind, unit) => {
    const vs = l[kind].get(unit);
    if (vs) return `${fmt(median(vs.map(v => v.value)))}`;
    const other = [...l[kind].keys()][0];
    if (other) return `<span class="muted" title="${esc(other)}">${fmt(median(l[kind].get(other).map(v => v.value)))} ${esc(other.replace('particles/', '/'))}</span>`;
    if (kind === 'mass' ? l.massPoly : l.countPoly) return '<span class="muted" title="Reported per polymer only; choose a polymer">per polymer</span>';
    return '<span class="muted">–</span>';
  };
  const valuesSpec = (title, lanes, kind, unit) => ({
    title, valueHead: `${kind === 'mass' ? 'Mass' : 'Count'} (${unit})`, col4: 'Qualifier',
    rows: lanes.filter(l => l[kind].get(unit)).flatMap(l => l[kind].get(unit).map(v => ({
      id: l.sid, study: l.it.s.label, matrix: `${v.r.group_id ? D.group[v.r.group_id].group_label : ''}`,
      value: `${fmt(v.value)} ${unit} · reported: ${resultText(v.r)} ${label(D, 'result_unit', v.r.unit)}`, attribution: resultTags(v.r).join(', ') }))).sort((a, b) => a.study.localeCompare(b.study)),
    summary: `Median of study values <b>${fmt(unitMedian(lanes, kind, unit))} ${esc(unit)}</b> · ${lanes.filter(l => l[kind].get(unit)).length} studies`,
    note: 'One value per sample group as reported (median, mean or other central value). Study medians are compared; groups are never summed.' });
  const studiesSpec = (title, lanes) => ({
    title, valueHead: 'Spectroscopic window · mass window', rows: lanes.map(l => ({ id: l.sid, study: l.it.s.label,
      matrix: l.it.techs.map(t => short(D, 'method_step', t)).join(', '),
      value: `${l.it.partLo != null ? `${fmt(l.it.partLo)}–${l.it.partHi != null ? fmt(l.it.partHi) : '?'} µm` : '–'} · ${l.it.hasMass ? `> ${l.it.pore != null ? fmt(l.it.pore) : '?'} µm` : '–'}`,
      attribution: '' })), summary: `<b>${lanes.length} studies</b>` });

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    for (const [k, , valuesOf, labelOf, blank] of FIELDS) {
      sel(k).innerHTML = `<option value="">${esc(blank)}</option>` + facetOptions(items, F, k, valuesOf, q[k]).map(([v, n]) =>
        `<option value="${esc(v)}"${v === q[k] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
    }
    history.replaceState(null, '', `#occurrence?${new URLSearchParams({ ...q, open: [...open].join(',') })}`);

    // rows: organism × site
    const P = crossFilter(items, F);
    const rowsMap = new Map();
    for (const f of P) {
      const r = rowsMap.get(f.key) || rowsMap.set(f.key, { key: f.key, group: f.group, site: f.site, byStudy: new Map() }).get(f.key);
      (r.byStudy.get(f.g.study_id) || r.byStudy.set(f.g.study_id, []).get(f.g.study_id)).push(f);
    }
    const rows = [...rowsMap.values()].map(r => ({ ...r, lanes: [...r.byStudy.entries()].map(([sid, fs]) => laneOf(sid, fs))
      .sort((a, b) => (a.it.partLo ?? 1e9) - (b.it.partLo ?? 1e9)) }))
      .sort((a, b) => orgRank(a.group) - orgRank(b.group) || a.group.localeCompare(b.group) || b.lanes.length - a.lanes.length);
    if (rows.length === 1) open.add(rows[0].key);   // a single organ: show its studies straight away
    const allLanes = rows.flatMap(r => r.lanes);
    const units = kind => [...new Set(allLanes.flatMap(l => [...l[kind].keys()]))];
    const massUnits = units('mass'), countUnits = units('count');
    if (q.mass !== 'auto' && !massUnits.includes(q.mass)) q.mass = 'auto';
    if (q.count !== 'auto' && !countUnits.includes(q.count)) q.count = 'auto';
    const studies = new Set(allLanes.map(l => l.sid));
    out.replaceChildren(kpis([[rows.length, 'organ / matrix groups'], [studies.size, 'studies'],
      [new Set(allLanes.filter(l => l.mass.size).map(l => l.sid)).size, 'with mass values'],
      [new Set(allLanes.filter(l => l.count.size).map(l => l.sid)).size, 'with count values'],
      [new Set(allLanes.filter(l => l.ortho).map(l => l.sid)).size, '◆ orthogonal mass + count']]));
    const stack = h('<div class="stack"></div>');
    if (!rows.length) {
      stack.append(h('<p class="muted">No sample groups match these filters.</p>'));
      out.append(stack);
      return;
    }
    const unitSelect = (name, list, cur) => `<select name="${name}" class="mini" aria-label="${name === 'massUnit' ? 'Mass unit' : 'Count unit'}"><option value="auto"${cur === 'auto' ? ' selected' : ''}>most common</option>${list.map(u =>
      `<option${u === cur ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select>`;
    const panelMass = rowUnit(allLanes, 'mass', q.mass) || 'µg/g', panelCount = rowUnit(allLanes, 'count', q.count) || 'particles/g';
    const axis = `<div class="occ-row axis"><span></span><span class="track axis-track">${[0.01, 0.1, 1, 10, 100, 1000, 10000].map(t =>
      `<span style="left:${pos(t)}%">${t >= 1000 ? t / 1000 + 'k' : t}</span>`).join('')}<em class="nano-lab">nano</em></span><span></span><span></span></div>`;

    // 1. detection range and values by organ / matrix
    const card = h(`<div class="card"><h3>Detection range and values by organ or matrix</h3>
      <ul class="occ-legend small">
        <li><span class="key spec"></span> <b>Spectroscopic methods</b> (FTIR, LDIR, Raman; microscopy counts where no spectroscopy was
          used): smallest to largest particle counted; the black tick marks the median smallest size.</li>
        <li><span class="key mass"></span> <b>Mass methods</b> (Py-GC-MS, TED-GC-MS, LC-MS, ICP-MS): everything above the filter pore
          (open-ended arrow).</li>
        <li><span class="key nano"></span> Shaded: nanoplastics (&lt; 1 µm). Values: median of study
          values${q.analyte ? ` for ${esc(analyteLabel(q.analyte))}` : ' (totals)'}; ◆ = mass and count from independent methods.</li></ul>
      <div class="occ-table">
        <div class="occ-sticky"><div class="occ-row head"><span>Organ or site</span><span>Particle size (µm, log scale)</span>
          <span>Mass ${unitSelect('massUnit', massUnits.length ? massUnits : ['µg/g'], q.mass)}</span>
          <span>Count ${unitSelect('countUnit', countUnits.length ? countUnits : ['particles/g'], q.count)}</span></div>
        ${axis}</div>
        ${rows.map((r, i) => {
          const L = r.lanes;
          const orgHead = i === 0 || rows[i - 1].group !== r.group ? (() => {
            const same = rows.filter(x => x.group === r.group);
            return `<div class="occ-org" role="heading" aria-level="4">${esc(r.group)} <span class="muted small">· ${same.length}
              organ or matrix groups · ${new Set(same.flatMap(x => x.lanes.map(l => l.sid))).size} studies</span></div>`;
          })() : '';
          const part = L.filter(l => l.it.partLo != null);
          const mass = L.filter(l => l.it.hasMass);
          const pores = mass.map(l => l.it.pore).filter(v => v != null);
          const his = part.map(l => l.it.partHi).filter(v => v != null);
          const name = `${r.group} · ${siteLabel(r.site)}`;
          const shortName = siteLabel(r.site);
          const mu = rowUnit(L, 'mass', q.mass), cu = rowUnit(L, 'count', q.count);
          REFS.set(`m|${r.key}`, () => valuesSpec(`${name}: mass`, L, 'mass', mu));
          REFS.set(`c|${r.key}`, () => valuesSpec(`${name}: count`, L, 'count', cu));
          const ortho = new Set(L.filter(l => l.ortho).map(l => l.sid)).size;
          const isOpen = open.has(r.key);
          return `${orgHead}<div class="occ-group">
            <div class="occ-row main">
              <button type="button" class="linklike" data-toggle="${esc(r.key)}" aria-expanded="${isOpen}"><span class="caret">${isOpen ? '▾' : '▸'}</span>
                <b>${esc(shortName)}</b><br><span class="muted small">${L.length} studies${ortho ? ` · ◆ ${ortho}` : ''}</span></button>
              ${windowHtml(part.length ? Math.min(...part.map(l => l.it.partLo)) : null, his.length ? Math.max(...his) : null,
                pores.length ? Math.min(...pores) : null, mass.length > 0, L.some(l => l.it.hasPart), median(part.map(l => l.it.partLo)))}
              ${valueHtml('mass', L, q.mass, `m|${r.key}`)}${valueHtml('count', L, q.count, `c|${r.key}`)}
            </div>
            <div class="lanes" data-lanes="${esc(r.key)}"${isOpen ? '' : ' hidden'}>${L.map(l => `<div class="occ-row lane">
              <span><a href="#" data-study="${esc(l.sid)}">${esc(l.it.s.label)}</a> ${l.ortho ? '<span class="ortho" title="Mass and count from independent methods">◆</span>'
                : l.twoNotOrtho ? '<span class="ortho no" title="Mass and count reported, but not from a mass method plus FTIR, LDIR or Raman">◇</span>' : ''}
                <br><span class="muted small">${esc(l.it.techs.map(t => short(D, 'method_step', t)).join(', ') || '–')}</span></span>
              ${windowHtml(l.it.partLo, l.it.partHi, l.it.pore, l.it.hasMass, l.it.hasPart, null)}
              <span class="val">${laneValue(l, 'mass', mu)}</span><span class="val">${laneValue(l, 'count', cu)}</span>
            </div>`).join('')}</div>
          </div>`;
        }).join('')}
      </div>
      <p class="muted small">The mass window starts at the filter pore, not at an instrument limit; faded = edge not reported.</p></div>`);
    stack.append(card);

    // 2. size coverage: how many studies' particle windows reach each size band
    const covRows = rows.slice(0, 16);
    const cov = h(`<div class="card"><h3>Which sizes were looked at</h3>
      <p class="muted small">Number of studies whose spectroscopic-method window covers each size band (shade = share of the row's
        studies with such a window). The last column counts studies with a mass method, which covers all sizes above its filter.</p>
      <div class="tablewrap"><table class="matrix trend cov-grid"><thead><tr><th>Organism · organ or site</th>${BANDS.map(b =>
        `<th>${b[2]}</th>`).join('')}<th>Mass method</th></tr></thead><tbody>${covRows.map(r => {
        const part = r.lanes.filter(l => l.it.partLo != null);
        const cells = BANDS.map(([a, b, lab]) => {
          const ls = part.filter(l => l.it.partLo < b && (l.it.partHi == null || l.it.partHi > a));
          if (!ls.length) return '<td class="muted">0</td>';
          const ref = `cov|${r.key}|${lab}`;
          REFS.set(ref, () => studiesSpec(`${r.group} · ${siteLabel(r.site)}: ${lab}`, ls));
          return `<td class="heat" data-ref="${esc(ref)}" style="--a:${(ls.length / Math.max(1, part.length)).toFixed(2)}">${ls.length}</td>`;
        }).join('');
        const mass = r.lanes.filter(l => l.it.hasMass);
        const pores = mass.map(l => l.it.pore).filter(v => v != null);
        REFS.set(`covm|${r.key}`, () => studiesSpec(`${r.group} · ${siteLabel(r.site)}: mass methods`, mass));
        return `<tr><td>${esc(r.group)} · ${esc(siteLabel(r.site))} <span class="muted">(${r.lanes.length})</span></td>${cells}
          <td${mass.length ? ` data-ref="covm|${esc(r.key)}"` : ''}>${mass.length ? `${mass.length}${pores.length ? ` <span class="muted">· filter ≥ ${fmt(Math.min(...pores))} µm</span>` : ''}` : '–'}</td></tr>`;
      }).join('')}</tbody></table></div>
      ${rows.length > 16 ? `<p class="muted small">16 of ${rows.length} groups shown (most studies first); use the filters for others.</p>` : ''}</div>`);

    // 3. values side by side: one row per organ/matrix or polymer, mass and count in the same row
    const collect = (source, keyOf) => {
      const m = new Map();
      for (const l of source) {
        for (const v of l.all || []) {
          const unit = v.kind === 'mass' ? panelMass : panelCount;
          if (v.unit !== unit) continue;
          const k = keyOf(l, v);
          const e = m.get(k) || m.set(k, { mass: [], count: [] }).get(k);
          e[v.kind].push({ l, v });
        }
      }
      return m;
    };
    const domainOf = xs => {
      const vals = xs.map(x => x.v.value).filter(v => v > 0);
      if (!vals.length) return [0.01, 100];
      const lo = 10 ** Math.floor(Math.log10(Math.min(...vals))), hi = 10 ** Math.ceil(Math.log10(Math.max(...vals)));
      return [lo, hi === lo ? lo * 10 : hi];
    };
    const decades = ([lo, hi]) => { const t = []; for (let e = Math.log10(lo); e <= Math.log10(hi) + 1e-9; e++) t.push(10 ** e); return t; };
    const xOf = ([lo, hi]) => v => +(100 * (Math.log10(Math.min(Math.max(v, lo), hi)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))).toFixed(2);
    const tickLabel = t => (t >= 1000 ? `${t / 1000}k` : String(+t.toPrecision(3)));
    // one plot cell (full row height, continuous decade gridlines) + its n column
    const cell = (xs, kind, unit, dom, ref, title) => {
      const dec = Math.round(Math.log10(dom[1] / dom[0]));
      const plotOpen = `<span class="pr-plot" style="--dec:${dec}"`;
      if (!xs.length) return `${plotOpen} role="img" aria-label="not reported"></span><span class="n"></span>`;
      const qq = quantiles(xs.map(x => x.v.value).filter(v => v > 0));
      const nS = new Set(xs.map(x => x.l.sid)).size;
      REFS.set(ref, () => ({ title, col4: 'Qualifier', valueHead: 'Value',
        rows: xs.map(({ l, v }) => ({ id: l.sid, study: l.it.s.label, matrix: D.group[v.r.group_id].group_label,
          value: `${fmt(v.value)} ${unit} · reported: ${resultText(v.r)} ${label(D, 'result_unit', v.r.unit)}`, attribution: resultTags(v.r).join(', ') })),
        summary: qq ? `Median <b>${fmt(qq.median)} ${esc(unit)}</b> (IQR ${fmt(qq.q1)}–${fmt(qq.q3)}) · ${nS} studies, ${xs.length} values` : '' }));
      if (!qq) return `${plotOpen} data-ref="${esc(ref)}" title="${esc(title)}: values are zero"></span><span class="n">${nS}</span>`;
      const x = xOf(dom);
      return `${plotOpen} data-ref="${esc(ref)}" title="${esc(title)}: median ${fmt(qq.median)} ${esc(unit)}, IQR ${fmt(qq.q1)}–${fmt(qq.q3)}, range ${fmt(qq.min)}–${fmt(qq.max)}, ${nS} studies">
        <svg viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true">
          <line x1="${x(qq.min)}" x2="${x(qq.max)}" y1="11" y2="11" class="pr-whisk ${kind}"/>
          <rect x="${x(qq.q1)}" width="${Math.max(0.8, x(qq.q3) - x(qq.q1))}" y="5" height="12" rx="1" class="pr-box ${kind}"/>
          <line x1="${x(qq.median)}" x2="${x(qq.median)}" y1="3" y2="19" class="pr-med"/></svg></span><span class="n">${nS}</span>`;
    };
    const pairedChart = (entries, labelOf, headOf, idPrefix) => {
      const dm = domainOf(entries.flatMap(([, e]) => e.mass)), dc = domainOf(entries.flatMap(([, e]) => e.count));
      const decM = Math.round(Math.log10(dm[1] / dm[0])), decC = Math.round(Math.log10(dc[1] / dc[0]));
      const axis = dom => `<span class="pr-axis">${decades(dom).map(t => `<span style="left:${xOf(dom)(t)}%">${tickLabel(t)}</span>`).join('')}</span>`;
      const blank = `<span class="pr-plot" style="--dec:${decM}"></span><span class="n"></span><span class="pr-plot" style="--dec:${decC}"></span><span class="n"></span>`;
      let prevHead = null;
      const body = entries.map(([k, e]) => {
        const head = headOf ? headOf(k) : null;
        const headHtml = head && head !== prevHead
          ? `<div class="pr-row pr-orgrow"><span class="lab" role="heading" aria-level="4">${esc(head)}</span>${blank}</div>` : '';
        prevHead = head;
        const lab = labelOf(k);
        return `${headHtml}<div class="pr-row"><span class="lab">${esc(lab)}</span>
          ${cell(e.mass, 'mass', panelMass, dm, `${idPrefix}|m|${k}`, `${lab}: mass (${panelMass})`)}
          ${cell(e.count, 'count', panelCount, dc, `${idPrefix}|c|${k}`, `${lab}: count (${panelCount})`)}</div>`;
      }).join('');
      return h(`<div class="pr-chart">
        <div class="pr-sticky">
          <div class="pr-row pr-head"><span></span><span><span class="key mass"></span> Mass (${esc(panelMass)}, log scale)</span><span>n</span>
            <span><span class="key spec"></span> Count (${esc(panelCount)}, log scale)</span><span>n</span></div>
          <div class="pr-row pr-axisrow"><span></span>${axis(dm)}<span></span>${axis(dc)}<span></span></div>
        </div>
        ${body || '<p class="muted small">No values for this selection.</p>'}
        <p class="muted small">Box = interquartile range, black line = median, whisker = min–max of study values; n = studies.
          Blank = not reported in that unit.</p></div>`);
    };
    const flat = rows.flatMap(r => r.lanes.map(l => ({ ...l, rowKey: r.key,
      all: l.fs.flatMap(f => f.vals).filter(v => (q.analyte ? v.r.analyte === q.analyte : TOTALS[v.kind].has(v.r.analyte))) })));
    const flatPoly = rows.flatMap(r => r.lanes.map(l => ({ ...l, all: l.fs.flatMap(f => f.vals).filter(v => !D.vocab.analyte_group[v.r.analyte]) })));
    // organ/matrix: grouped by organism (same order as above), organs alphabetical within each organism
    const rowByKey = new Map(rows.map(r => [r.key, r]));
    const organEntries = [...collect(flat, l => l.rowKey).entries()].sort(([a], [b]) => {
      const ra = rowByKey.get(a), rb = rowByKey.get(b);
      return orgRank(ra.group) - orgRank(rb.group) || ra.group.localeCompare(rb.group) || siteLabel(ra.site).localeCompare(siteLabel(rb.site));
    });
    // polymers: alphabetical by code
    const med = xs => { const q2 = quantiles(xs.map(x => x.v.value)); return q2 ? q2.median : -1; };
    const polyEntries = [...collect(flatPoly, (l, v) => v.r.analyte).entries()].sort(([ka, a], [kb, b]) =>
      (b.mass.length > 0) - (a.mass.length > 0) || (a.mass.length ? med(b.mass) - med(a.mass) : med(b.count) - med(a.count)) || ka.localeCompare(kb));
    const valueCard = (title, note, el) => {
      const c = h(`<div class="card"><h3>${title}</h3><p class="muted small">${note}</p></div>`);
      c.append(el);
      stack.append(c);
    };
    valueCard('Reported values by organ or matrix', `Study values${q.analyte ? ` for ${esc(analyteLabel(q.analyte))}` : ' (totals)'}, mass and
      count side by side for each organ or matrix, grouped by organism. Units: the most common (or the unit chosen above); values in other
      units are not mixed in.`,
      pairedChart(organEntries, k => siteLabel(rowByKey.get(k).site), k => rowByKey.get(k).group, 'vo'));
    valueCard('Reported values by polymer', 'Polymer-specific values from the studies in this selection; mass and count of the same polymer in one row. '
      + 'Ordered by median mass concentration (highest first); polymers reported only as counts follow, by median count.',
      pairedChart(polyEntries, analyteLabel, null, 'vp'));

    stack.append(cov);   // order: detection range, values by organ, values by polymer, sizes looked at, rules
    stack.append(h(`<div class="card rules"><h3>How values are compared</h3><ul class="reading">
      <li>Values are compared only within one unit; ng/g and mg/g are converted to µg/g, particles/L to particles/mL. Wet- and dry-weight
        values are not converted.</li>
      <li>Each study contributes the median of its sample groups; groups and polymers are never summed. A study total is left out when the
        same study reports its subgroups. Without a polymer chosen, only totals are used; studies reporting per polymer only are counted
        on hover.</li>
      <li>Non-detects, pooled totals, single samples and ranges of means are not plotted and never count as zero.</li>
      <li>◆ orthogonal: the study reports both mass and count, and used a mass method together with FTIR, LDIR or Raman. ◇: both values,
        but not from that pair of methods (e.g. counts by microscopy only).</li>
      <li>Windows are per study: where a study used several spectroscopic or microscopy methods, its window is their combined range.</li></ul></div>`));
    out.append(stack);
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) q[e.target.name] = e.target.value;
    draw();
  });
  root.querySelector('#occClear').addEventListener('click', () => {
    Object.assign(q, { group: '', sample: '', site: '', analyte: '', method: '' });
    open.clear();
    draw();
  });
  draw();
}
