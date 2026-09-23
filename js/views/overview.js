// Overview: what the evidence base covers. Click any bar to see the studies behind it.
import { countBy, split, label, short, stepLabel, fmt } from '../../script/summaries.js';
import { esc, h, bars, kpis } from '../ui.js';
import { showPopover, closePopover, smallScreen } from '../popover.js';

export default function overview(root, D) {
  const S = D.studies;
  const field = D.findings.filter(f => f.role === 'field_detection' || f.role === 'reported');
  const finderLink = (k, v) => `#finder?${k}=${encodeURIComponent(v)}`;
  root.append(h(`<section><h2>Overview</h2>
    <p class="muted">Coverage of the evidence base. <span class="ref-hint">Click any bar to see the studies behind it.</span></p>
    <p class="note phone-note">On small screens the charts show general trends. Open the site on a computer to see the studies.</p></section>`));

  // short descriptions used in the popover rows
  const list = (v, fn) => split(v).map(fn).join(', ') || '–';
  const techs = s => list(s.techniques, c => short(D, 'method_step', c));
  const samples = s => list(s.sample_types, c => label(D, 'matrix_sample_type', c));
  const matrixOf = s => [split(s.finder_groups).join(', '), list(s.matrix_characters, c => label(D, 'matrix_character', c))].join(' · ');
  const range = (lo, hi, unit) => (lo === '' ? '' : `${fmt(+lo)}${hi !== '' && hi !== lo ? '–' + fmt(+hi) : ''} ${unit}`);
  const digestion = s => [range(s.digestion_temp_c_lo, s.digestion_temp_c_hi, '°C'), range(s.digestion_time_h_lo, s.digestion_time_h_hi, 'h')]
    .filter(Boolean).join(', ') || 'not reported';

  // popover registry: bar key → spec builder
  const REFS = new Map();
  const GO = new Map();   // bars that also open the method finder (used on small screens)
  const spec = (title, ids, valueHead, valueOf, link) => {
    const rows = [...new Set(ids)].map(id => D.study[id])
      .sort((a, b) => (b.year || 0) - (a.year || 0) || a.label.localeCompare(b.label))
      .map(s => ({ id: s.study_id, study: s.label, matrix: matrixOf(s), value: valueOf(s), attribution: '' }));
    const years = rows.map(r => D.study[r.id].year).filter(Boolean);
    return { title, rows, valueHead,
      summary: `<b>${rows.length} studies</b>${years.length ? ` · ${[...new Set([Math.min(...years), Math.max(...years)])].join('–')}` : ''}`,
      note: link ? `<a href="${link}">Open the method finder with this selection →</a>` : '' };
  };
  // card: counts studies per key; `keysOf(item)` gives the keys of an item (a study, run or finding)
  const card = (id, title, items, keysOf, labelOf, valueHead, valueOf, { note = '', limit = 12, sort, finder } = {}) => {
    const groups = new Map();
    for (const it of items) for (const k of [].concat(keysOf(it)).filter(x => x != null && x !== '')) {
      (groups.get(k) || groups.set(k, new Set()).get(k)).add(it.study_id);
    }
    let rows = [...groups.entries()].map(([k, ids]) => [labelOf(k), ids.size, k]);
    rows = sort ? rows.sort(sort) : rows.sort((a, b) => b[1] - a[1]);
    const el = bars(rows, { limit, ref: k => {
      const key = `${id}|${k}`;
      const link = finder ? finderLink(finder, k) : '';
      REFS.set(key, () => spec(`${title}: ${labelOf(k)}`, groups.get(k), valueHead, valueOf, link));
      if (link) GO.set(key, link);
      return key;
    } });
    const c = h(`<div class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
    c.append(el);
    grid.append(c);
  };

  // summary tiles: each opens the studies behind the number
  const tally = (items, keyOf, labelOf, n = 8) => countBy(items, keyOf).slice(0, n).map(([k, c]) => `${esc(labelOf(k))} ${c}`).join(' · ');
  const tile = (key, title, ids, valueHead, valueOf, extra) => {
    REFS.set(`kpi|${key}`, () => {
      const sp = spec(title, ids, valueHead, valueOf);
      if (extra) sp.summary += `<br>${extra}`;
      return sp;
    });
    return `kpi|${key}`;
  };
  const studyTechs = [...new Set(D.runs.map(r => `${r.study_id}|${r.technique}`))].map(k => k.split('|')[1]);
  const fieldPolys = [...new Set(field.map(f => `${f.study_id}|${f.polymer_code}`))].map(k => k.split('|')[1]);
  const recN = D.recoveryBy;
  const nano = S.filter(s => s.nanoplastic_claimed === 'yes');
  const tiles = kpis([
    [S.length, 'studies', tile('all', 'All studies', S.map(s => s.study_id), 'Study design', s => s.study_design.replace(/_/g, ' '),
      `Design: ${tally(S, s => s.study_design, v => v.replace(/_/g, ' '))}`)],
    [new Set(D.runs.map(r => r.technique)).size, 'analysis techniques', tile('tec', 'Analysis techniques', D.runs.map(r => r.study_id), 'Analysis', techs,
      `Studies per technique: ${tally(studyTechs, t => t, t => short(D, 'method_step', t), 14)}`)],
    [new Set(field.map(f => f.polymer_code)).size, 'polymers detected', tile('pol', 'Polymers detected in samples', field.map(f => f.study_id), 'Polymers in samples',
      s => [...new Set((D.findingsBy.get(s.study_id) || []).filter(f => f.role === 'field_detection' || f.role === 'reported').map(f => f.polymer_code))].join(', '),
      `Studies per polymer: ${tally(fieldPolys, c => c, c => c, 12)}`)],
    [recN.size, 'studies with recovery values', tile('rec', 'Studies with recovery values', [...recN.keys()], 'Recovery values', s => {
      const v = recN.get(s.study_id).map(r => +r.value_pct).filter(isFinite).sort((a, b) => a - b);
      return v.length ? `${v.length} values · ${fmt(v[0])}${v.length > 1 ? '–' + fmt(v[v.length - 1]) : ''}%` : '–';
    }, '<a href="#validation">Open Validation</a> for recovery by digestion, analysis, polymer and matrix.')],
    [nano.length, 'studies claiming nanoplastics', tile('nano', 'Studies claiming nanoplastics', nano.map(s => s.study_id), 'Smallest size · analysis',
      s => `${s.min_particle_size_um === '' ? 'size not reported' : fmt(+s.min_particle_size_um) + ' µm'} · ${techs(s)}`)],
  ]);
  root.append(tiles);

  const grid = h('<div class="stack"></div>');   // one card per row: long labels stay readable
  card('grp', 'Matrix group', S, s => split(s.finder_groups), v => v, 'Sample types', samples, { finder: 'group' });
  card('chr', 'Matrix character', S, s => split(s.matrix_characters), v => label(D, 'matrix_character', v), 'Sample types', samples,
    { note: 'Used by the finder to carry evidence between similar matrices.', finder: 'character' });
  card('des', 'Study design', S, s => s.study_design, v => v.replace(/_/g, ' '), 'Analysis', techs);
  card('pol', 'Polymers detected in samples', field, f => f.polymer_code, c => `${c} – ${label(D, 'polymer', c)}`, 'Analysis', techs,
    { note: 'Field detections and extraction-level reports; excludes spikes, exposure materials and blanks.', limit: 14, finder: 'polymer' });
  card('tec', 'Analysis techniques', D.runs, r => r.technique, c => short(D, 'method_step', c), 'Matrix removal',
    s => list(s.removal_steps, c => stepLabel(D, 'removal', c)), { limit: 14 });
  card('rem', 'Matrix removal', S, s => split(s.removal_steps), c => stepLabel(D, 'removal', c), 'Digestion conditions', digestion);
  card('sep', 'Separation', S, s => split(s.separation_steps), c => stepLabel(D, 'separation', c), 'Filter pore',
    s => range(s.filter_pore_um_lo, s.filter_pore_um_hi, 'µm') || 'not reported');
  card('bas', 'Reporting basis', S, s => s.metric_basis || 'not reported', v => v, 'Analysis', techs);
  card('out', 'Polymer identification outcome', S, s => s.polymer_id_outcome, c => label(D, 'polymer_outcome', c), 'Polymers in samples',
    s => split(s.polymers_in_samples).join(', ') || '–');
  card('yr', 'Publication year', S, s => (s.year ? String(s.year) : ''), v => v, 'Study design', s => s.study_design.replace(/_/g, ' '),
    { limit: 20, sort: (a, b) => b[2] - a[2] });
  root.append(grid);

  const onClick = e => {
    const el = e.target.closest('[data-ref]');
    if (!el || !REFS.has(el.dataset.ref)) return;
    if (smallScreen()) {   // no popovers on phones: bars that map to a finder filter still open it
      if (GO.has(el.dataset.ref)) location.hash = GO.get(el.dataset.ref).slice(1);
      return;
    }
    e.stopPropagation();
    closePopover();
    showPopover(el, REFS.get(el.dataset.ref)(), D.openStudy);
  };
  tiles.addEventListener('click', onClick);
  grid.addEventListener('click', onClick);
}
