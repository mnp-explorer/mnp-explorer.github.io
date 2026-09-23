// Instruments: compare techniques, or drill into one.
//   All instruments  → measured particle-size range, mass range and polymer types per technique.
//   One instrument   → settings, then polymers detected, then size + shape (particle methods)
//                      or mass (mass methods). Shape and mass are never shown together.
// Filters (technique, matrix group, matrix character) narrow each other.
// Clicking any chart element opens a reference popover: summary + every study with its value
// (js/popover.js). On small screens the popover is disabled and the charts show the trends.
import { countBy, split, label, short, quantiles, fmt, fmtRange, num } from '../../script/summaries.js';
import { studyFacts, facetOptions, crossFilter } from '../../script/facets.js';
import { esc, h, bars, spanBars } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

let FACTS = null;
const FIELD_ROLES = new Set(['field_detection', 'reported']);
const MASS_KINDS = new Set(['observed', 'summary']);
// FTIR modality is reported per study; each value belongs to one technique
const MODALITY_TECH = { 'ATR-FTIR': 'ATR_FTIR', 'µ-FTIR transmission': 'UFTIR', 'µ-FTIR reflectance': 'UFTIR', 'FTIR imaging': 'UFTIR' };
const ATTR_NOTE = 'Direct: only this instrument in the study could have produced the value. '
  + 'Shared: the study used several instruments able to produce it.';

export default function instruments(root, D, params) {
  FACTS = FACTS || studyFacts(D);
  const techOf = Object.fromEntries(D.runs.map(r => [r.run_id, r.technique]));
  const tp = D.vocab.technique_property;
  const q = { tech: params.get('tech') || '', group: params.get('group') || '', character: params.get('character') || '',
    direct: params.get('direct') === '1', noexp: params.get('noexp') !== '0' };

  root.append(h(`<section><h2>Instruments</h2>
    <p class="muted">What each analysis technique delivered, and the settings studies reported. Choose a technique for its details.
      <span class="ref-hint">Click any bar, row or cell to see the studies and values behind it.</span>
      Many studies used several instruments but reported results once: a result is <b>direct</b> when only one instrument in the
      study could have produced it, and <b>shared</b> otherwise.</p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the studies behind each value.</p>
    <div class="toolbar">
      <label>Technique <select name="tech"></select></label>
      <label>Matrix group <select name="group"></select></label>
      <label>Matrix character <select name="character"></select></label>
      <div class="checks">
        <label><input type="checkbox" name="direct"> Direct attribution only</label>
        <label><input type="checkbox" name="noexp"> Exclude exposure / model-particle studies</label>
      </div>
      <button type="button" class="ghost" id="insClear">Clear</button>
    </div><div id="ins"></div></section>`));
  const out = root.querySelector('#ins');
  const sel = n => root.querySelector(`[name=${n}]`);

  // ---------------------------------------------------------------- references
  const REFS = new Map();
  const ref = (key, build) => (REFS.set(key, build), key);
  out.addEventListener('click', e => {
    const el = e.target.closest('[data-ref]');
    if (!el || smallScreen()) return;
    const build = REFS.get(el.dataset.ref);
    if (!build) return;
    e.stopPropagation();
    showPopover(el, build(), D.openStudy);
  });

  const matrixOf = id => {
    const s = D.study[id];
    const chars = split(s.matrix_characters).slice(0, 2).map(c => label(D, 'matrix_character', c));
    return [split(s.finder_groups).join(', '), ...chars].filter(Boolean).join(' · ');
  };
  const range = (lo, hi, unit) => (hi == null || lo === hi ? `${fmt(lo)} ${unit}` : `${fmt(lo)}–${fmt(hi)} ${unit}`);
  // one popover row per study: values joined, 'direct' wins over 'shared'
  const perStudy = (rs, valueOf, sortOf = () => 0) => {
    const m = new Map();
    for (const r of rs) {
      const e = m.get(r.study_id) || m.set(r.study_id, { vals: [], att: new Set(), sort: Infinity }).get(r.study_id);
      e.vals.push(valueOf(r));
      if (r.attribution) e.att.add(r.attribution);
      e.sort = Math.min(e.sort, sortOf(r));
    }
    return [...m.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || D.study[a[0]].label.localeCompare(D.study[b[0]].label))
      .map(([id, e]) => ({ id, study: D.study[id].label, matrix: matrixOf(id), value: [...new Set(e.vals)].join('; '),
        attribution: e.att.has('direct') ? 'direct' : [...e.att][0] || '' }));
  };
  const spanSpec = (title, rs, unit) => {
    const lo = quantiles(rs.map(r => num(r.lo))), hi = quantiles(rs.map(r => num(r.hi)));
    const rows = perStudy(rs, r => range(num(r.lo), num(r.hi), unit), r => num(r.lo));
    const direct = rows.filter(r => r.attribution === 'direct').length;
    return { title, rows, note: ATTR_NOTE,
      summary: lo ? `Typical <b>${fmt(Math.min(lo.median, hi.median))}–${fmt(Math.max(lo.median, hi.median))} ${esc(unit)}</b>
        (median lower to upper end) · overall ${fmt(lo.min)}–${fmt(hi.max)} ${esc(unit)} ·
        ${rs.length} ranges from ${rows.length} studies (${direct} direct)` : '' };
  };
  const polySpec = (tech, code, rs) => {
    const rows = perStudy(rs, r => `${r.code} · ${label(D, 'evidence_status', r.status).toLowerCase()}`);
    const direct = rows.filter(r => r.attribution === 'direct').length;
    return { title: `${code} (${label(D, 'polymer', code)}) identified by ${short(D, 'method_step', tech)}`, rows, note: ATTR_NOTE,
      summary: `Identified in samples in <b>${rows.length} studies</b> (${direct} direct). Status: confirmed = checked against the paper; extraction only = from the extraction sheets.` };
  };
  // value = every shape the study reported, so the list shows what else co-occurred
  const shapeSpec = (tech, code, rs, allShapes) => {
    const rows = perStudy(rs, r => allShapes.get(r.study_id).map(c => label(D, 'shape', c)).join(', '));
    return { title: `${label(D, 'shape', code)} particles · ${short(D, 'method_step', tech)}`, rows, note: ATTR_NOTE,
      summary: `Reported by <b>${rows.length} studies</b> using this technique. Value = all shapes the study reported.` };
  };

  // ---------------------------------------------------------------- filters
  const isExposure = f => f.s.model_particles === 'yes' || (f.s.polymers_exposure && !f.s.polymers_in_samples);
  const filters = () => ({
    tech: q.tech ? f => f.techs.has(q.tech) : null,
    group: q.group ? f => f.groups.has(q.group) : null,
    character: q.character ? f => f.chars.has(q.character) : null,
    exposure: q.noexp ? f => !isExposure(f) : null,
  });
  const fill = (name, rows, labelOf, blank) => {
    sel(name).innerHTML = `<option value="">${esc(blank)}</option>` + rows.map(([v, n]) =>
      `<option value="${esc(v)}"${v === q[name] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
  };

  const draw = () => {
    closePopover();
    REFS.clear();
    const F = filters();
    fill('tech', facetOptions(FACTS, F, 'tech', f => f.techs, q.tech), v => short(D, 'method_step', v), 'All instruments');
    fill('group', facetOptions(FACTS, F, 'group', f => f.groups, q.group), v => v, 'Any matrix group');
    fill('character', facetOptions(FACTS, F, 'character', f => f.chars, q.character), v => label(D, 'matrix_character', v), 'Any matrix character');
    sel('direct').checked = q.direct;
    sel('noexp').checked = q.noexp;
    history.replaceState(null, '', `#instruments?${new URLSearchParams({ ...q, direct: q.direct ? '1' : '0', noexp: q.noexp ? '1' : '0' })}`);

    // studies in scope (matrix + exposure filters; the technique filter is applied per view below)
    const keep = new Set(crossFilter(FACTS, F, 'tech').map(f => f.id));
    const R = D.results.filter(r => keep.has(r.study_id) && (!q.direct || r.attribution === 'direct'));
    out.replaceChildren(q.tech ? detail(q.tech, R, keep) : compare(R));
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    const t = e.target;
    if (t.type === 'checkbox') q[t.name] = t.checked;
    else if (t.name in q) q[t.name] = t.value;
    draw();
  });
  root.querySelector('#insClear').addEventListener('click', () => {
    Object.assign(q, { tech: '', group: '', character: '', direct: false, noexp: true });
    draw();
  });
  draw();

  // ---------------------------------------------------------------- all instruments
  function compare(R) {
    const wrap = h('<div class="grid"></div>');
    const card = (title, note, el) => {
      const c = h(`<div class="card wide"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
      c.append(el);
      wrap.append(c);
    };
    const byTech = (type, test) => {
      const m = new Map();
      for (const r of R) if (r.result_type === type && test(r)) {
        const t = techOf[r.run_id];
        (m.get(t) || m.set(t, []).get(t)).push(r);
      }
      return m;
    };
    const spanRows = (m, what, unit) => [...m.entries()].map(([t, rs]) => ({
      label: short(D, 'method_step', t), n: rs.length,
      lo: quantiles(rs.map(r => num(r.lo))), hi: quantiles(rs.map(r => num(r.hi))),
      ref: ref(`${what}|${t}`, () => spanSpec(`${short(D, 'method_step', t)} · ${what}`, rs, unit)),
    })).filter(r => r.lo).sort((a, b) => a.lo.median - b.lo.median);

    const size = byTech('size_span', r => r.kind === 'observed' && tp[techOf[r.run_id]].reports_size_shape === 'yes');
    card('Measured particle size range', 'Size ranges of particles found in samples, by the technique that measured them.',
      spanBars(spanRows(size, 'measured particle sizes', 'µm'), { domain: [0.01, 100000], unit: 'µm' }));

    const mass = byTech('mass_span', r => MASS_KINDS.has(r.kind) && r.unit === 'µg/g' && tp[techOf[r.run_id]].reports_mass === 'yes');
    const otherUnits = countBy(R.filter(r => r.result_type === 'mass_span' && MASS_KINDS.has(r.kind) && r.unit !== 'µg/g'), r => r.unit);
    card('Mass concentration range (µg/g)', `Reported concentration ranges from mass-based techniques.${otherUnits.length
      ? ` Also reported in other units: ${otherUnits.map(([u, n]) => `${esc(u)} (${n})`).join(', ')}.` : ''}`,
      spanBars(spanRows(mass, 'mass concentrations', 'µg/g'), { domain: [0.001, 100000], unit: 'µg/g' }));

    // technique × polymer table (polymer-identifying techniques only)
    const polys = R.filter(r => r.result_type === 'polymer' && FIELD_ROLES.has(r.role) && tp[techOf[r.run_id]].identifies_polymer === 'yes');
    const cols = countBy(polys, r => r.code).slice(0, 10).map(([c]) => c);
    const rows = countBy(polys, r => techOf[r.run_id]).map(([t]) => t);
    const cell = new Map();
    for (const r of polys) {
      const k = `${techOf[r.run_id]}|${r.code}`;
      (cell.get(k) || cell.set(k, []).get(k)).push(r);
    }
    const nStudies = rs => new Set((rs || []).map(r => r.study_id)).size;
    const max = Math.max(1, ...[...cell.values()].map(nStudies));
    const table = h(`<div class="tablewrap"><table class="matrix"><thead><tr><th>Technique</th>
      ${cols.map(c => `<th class="num" title="${esc(label(D, 'polymer', c))}">${esc(c)}</th>`).join('')}<th class="num">Studies</th></tr></thead>
      <tbody>${rows.map(t => `<tr><td>${esc(short(D, 'method_step', t))}</td>${cols.map(c => {
        const rs = cell.get(`${t}|${c}`);
        const n = nStudies(rs);
        const key = n ? ref(`poly|${t}|${c}`, () => polySpec(t, c, rs)) : '';
        return `<td class="num heat" style="--a:${(n / max).toFixed(2)}"${key ? ` data-ref="${esc(key)}"` : ''}>${n || ''}</td>`;
      }).join('')}<td class="num">${nStudies(polys.filter(r => techOf[r.run_id] === t))}</td></tr>`).join('')}</tbody></table></div>`);
    card('Polymer types per technique', 'Number of studies in which the technique identified each polymer in samples (10 most common polymers).', table);
    return wrap;
  }

  // ---------------------------------------------------------------- one instrument
  function detail(t, R, keep) {
    const prop = tp[t];
    const name = short(D, 'method_step', t);
    const runs = new Set(D.runs.filter(r => r.technique === t && keep.has(r.study_id)).map(r => r.run_id));
    const studyIds = new Set(D.runs.filter(r => runs.has(r.run_id)).map(r => r.study_id));
    const Rt = R.filter(r => runs.has(r.run_id));
    const wrap = h(`<div><p class="small muted">${esc(label(D, 'method_step', t))} · ${studyIds.size} studies in this selection.</p><div class="stack"></div></div>`);
    const grid = wrap.querySelector('.stack');   // one card per row
    const card = (title, note, el) => {
      const c = h(`<div class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
      c.append(el);
      grid.append(c);
    };

    // 1. settings; spectral-library settings (match threshold, library) belong to FTIR and Raman only
    const spectral = prop.family === 'FTIR' || prop.family === 'RAMAN';
    const P = D.params.filter(p => studyIds.has(p.study_id) && (p.family === prop.family || (spectral && p.family === 'SPECTRAL'))
      && (p.parameter !== 'ftir_modality' || MODALITY_TECH[p.value_code] === t));
    const famNote = prop.family === 'FTIR' ? ' FTIR modality is shown under the matching technique; other FTIR settings are reported per study and, in studies that used both ATR- and µ-FTIR, apply to both.' : '';
    const paramSpec = (code, rows) => {
      const lab = label(D, 'instrument_parameter', code);
      const valueOf = r => (r.value_code ? label(D, 'spectral_library', r.value_code) : range(num(r.value_lo), num(r.value_hi), r.unit));
      const list = perStudy(rows, valueOf, r => num(r.value_lo) ?? 0);
      let summary;
      if (rows[0].value_code) {
        summary = countBy(rows, r => r.value_code).slice(0, 6).map(([k, n]) => `${esc(label(D, 'spectral_library', k))} ${n}`).join(' · ');
      } else {
        const lo = quantiles(rows.map(r => num(r.value_lo)));
        summary = `Median <b>${fmt(lo.median)} ${esc(rows[0].unit)}</b> (IQR ${fmt(lo.q1)}–${fmt(lo.q3)}) · range ${fmt(lo.min)}–${fmt(Math.max(...rows.map(r => num(r.value_hi))))} ${esc(rows[0].unit)}`;
      }
      return { title: `${lab} · ${name}`, rows: list, summary: `${summary} · ${list.length} studies`,
        note: `Values as reported; several values in one study (e.g. two instruments) are shown as a range.${famNote}` };
    };
    const pRows = [...new Set(P.map(p => p.parameter))].map(code => {
      const rows = P.filter(p => p.parameter === code);
      const lab = label(D, 'instrument_parameter', code);
      const key = ref(`param|${code}`, () => paramSpec(code, rows));
      const nStudy = new Set(rows.map(r => r.study_id)).size;
      if (rows[0].value_code) {
        const top = countBy(rows, r => r.value_code).slice(0, 5).map(([k, n]) => `${esc(label(D, 'spectral_library', k))} (${n})`).join(', ');
        return `<tr data-ref="${esc(key)}"><td>${esc(lab)}</td><td class="num">${nStudy}</td><td colspan="3">${top}</td></tr>`;
      }
      const lo = quantiles(rows.map(r => num(r.value_lo))), hi = quantiles(rows.map(r => num(r.value_hi)));
      const isRange = /range/.test(code);
      return `<tr data-ref="${esc(key)}"><td>${esc(lab)}${isRange ? ' <span class="muted small">(low / high end)</span>' : ''}</td><td class="num">${nStudy}</td>
        <td class="num">${isRange ? `${fmt(lo.median)} / ${fmt(hi.median)}` : fmt(lo.median)}</td>
        <td class="num">${isRange ? '' : `${fmt(lo.q1)}–${fmt(lo.q3)}`}</td>
        <td class="num">${fmt(lo.min)}–${fmt(hi.max)} ${esc(rows[0].unit)}</td></tr>`;
    }).join('');
    card('Settings', `Reported practice, not optimised values.${famNote}`,
      h(pRows ? `<div class="tablewrap"><table><thead><tr><th>Parameter</th><th class="num">Studies</th><th class="num">Median</th>
        <th class="num">IQR</th><th class="num">Range</th></tr></thead><tbody>${pRows}</tbody></table></div>`
        : '<p class="muted">No settings reported for this selection.</p>'));

    // 2. polymers
    if (prop.identifies_polymer === 'yes') {
      const polys = Rt.filter(r => r.result_type === 'polymer' && FIELD_ROLES.has(r.role));
      const byCode = new Map();
      for (const r of polys) (byCode.get(r.code) || byCode.set(r.code, []).get(r.code)).push(r);
      const rows = [...byCode.entries()].map(([c, rs]) => [`${c} – ${label(D, 'polymer', c)}`, new Set(rs.map(r => r.study_id)).size, c])
        .sort((a, b) => b[1] - a[1]);
      const direct = polys.filter(r => r.attribution === 'direct').length;
      card('Polymers detected', `Studies in which ${esc(name)} identified each polymer in samples (${direct} of ${polys.length} links are direct).`,
        bars(rows, { limit: 15, ref: c => ref(`dpoly|${c}`, () => polySpec(t, c, byCode.get(c))) }), false);
    } else {
      card('Polymers detected', '', h(`<p class="muted">${esc(name)} does not identify polymer types.</p>`), false);
    }

    // 3a. particle size and shape (particle methods)
    if (prop.reports_size_shape === 'yes') {
      const sizes = Rt.filter(r => r.result_type === 'size_span' && r.kind === 'observed');
      const minS = Rt.filter(r => r.result_type === 'min_size' && r.kind === 'reported');
      const el = spanBars([{ label: 'Particles found', n: sizes.length, lo: quantiles(sizes.map(r => num(r.lo))),
        hi: quantiles(sizes.map(r => num(r.hi))), ref: ref('dsize', () => spanSpec(`${name} · particle sizes found`, sizes, 'µm')) }],
      { domain: [0.01, 100000], unit: 'µm' });
      const minKey = ref('dmin', () => {
        const rows = perStudy(minS, r => `${fmt(num(r.lo))} µm`, r => num(r.lo));
        return { title: `${name} · smallest particle reported`, rows, note: ATTR_NOTE,
          summary: (() => { const q = quantiles(minS.map(r => num(r.lo)));
            return `Median <b>${fmt(q.median)} µm</b> (IQR ${fmt(q.q1)}–${fmt(q.q3)}) · smallest ${fmt(q.min)} µm · ${rows.length} studies`; })() };
      });
      el.prepend(h(`<p class="small${minS.length ? '' : ' muted'}"${minS.length ? ` data-ref="${minKey}"` : ''}>Smallest particle reported:
        <b>${fmtRange(quantiles(minS.map(r => num(r.lo))))} µm</b> <span class="muted">(median (IQR), ${minS.length} studies)</span></p>`));
      card('Particle size range', 'Size ranges of particles found in samples.', el, false);
      if (prop.reports_mass !== 'yes') {
        const shapes = Rt.filter(r => r.result_type === 'shape');
        const byShape = new Map();
        for (const r of shapes) (byShape.get(r.code) || byShape.set(r.code, []).get(r.code)).push(r);
        const rows = [...byShape.entries()].map(([c, rs]) => [label(D, 'shape', c), new Set(rs.map(r => r.study_id)).size, c])
          .sort((a, b) => b[1] - a[1]);
        const allShapes = new Map();
        for (const r of shapes) allShapes.set(r.study_id, [...new Set([...(allShapes.get(r.study_id) || []), r.code])]);
        card('Particle shapes', 'Shapes reported by studies using this technique.',
          bars(rows, { ref: c => ref(`shape|${c}`, () => shapeSpec(t, c, byShape.get(c), allShapes)) }), false);
      }
    }

    // 3b. mass (mass methods)
    if (prop.reports_mass === 'yes') {
      const mass = Rt.filter(r => r.result_type === 'mass_span' && MASS_KINDS.has(r.kind));
      const byUnit = h('<div></div>');
      const units = countBy(mass, r => r.unit);
      if (!units.length) byUnit.append(h('<p class="muted">No mass concentrations reported for this selection.</p>'));
      for (const [u] of units) {
        const rs = mass.filter(r => r.unit === u);
        byUnit.append(spanBars([{ label: `In ${u}`, n: rs.length, lo: quantiles(rs.map(r => num(r.lo))), hi: quantiles(rs.map(r => num(r.hi))),
          ref: ref(`dmass|${u}`, () => spanSpec(`${name} · mass concentrations (${u})`, rs, u)) }], { domain: [0.001, 100000], unit: u }));
      }
      card('Mass concentration range', 'Reported concentration ranges, by unit.', byUnit, false);
    }
    return wrap;
  }
}
