// Workflows: pipeline families (matrix removal → separation → analysis) and the studies behind them.
// The filters are cross-filtered: each dropdown counts only studies matching the other selections.
import { countBy, split, label, short, stepLabel } from '../../script/summaries.js';
import { studyFacts, facetOptions, crossFilter } from '../../script/facets.js';
import { removalKey, separationKey } from '../../script/finder.js';
import { esc, h } from '../ui.js';

let FACTS = null;

export default function workflows(root, D, params) {
  FACTS = FACTS || studyFacts(D);
  const q = { group: params.get('group') || '', character: params.get('character') || '', tech: params.get('tech') || '' };
  root.append(h(`<section><h2>Workflows</h2>
    <p class="muted">How studies combined matrix removal, separation and analysis. Each filter narrows the others.
      One study can appear in several rows when it used several techniques. Click a row to list its studies.</p>
    <div class="toolbar">
      <label>Matrix group <select name="group"></select></label>
      <label>Matrix character <select name="character"></select></label>
      <label>Analysis method <select name="tech"></select></label>
      <button type="button" class="ghost" id="wfClear">Clear</button>
    </div>
    <div class="card"><div class="tablewrap" id="wf"></div></div></section>`));
  const out = root.querySelector('#wf');
  const sel = n => root.querySelector(`[name=${n}]`);

  const filters = () => ({
    group: q.group ? f => f.groups.has(q.group) : null,
    character: q.character ? f => f.chars.has(q.character) : null,
    tech: q.tech ? f => f.techs.has(q.tech) : null,
  });
  const fill = (name, rows, labelOf, blank) => {
    sel(name).innerHTML = `<option value="">${esc(blank)}</option>` + rows.map(([v, n]) =>
      `<option value="${esc(v)}"${v === q[name] ? ' selected' : ''}>${esc(labelOf(v))} (${n})</option>`).join('');
  };

  const draw = () => {
    const F = filters();
    fill('group', facetOptions(FACTS, F, 'group', f => f.groups, q.group), v => v, 'Any matrix group');
    fill('character', facetOptions(FACTS, F, 'character', f => f.chars, q.character), v => label(D, 'matrix_character', v), 'Any matrix character');
    fill('tech', facetOptions(FACTS, F, 'tech', f => f.techs, q.tech), v => short(D, 'method_step', v), 'Any analysis method');
    history.replaceState(null, '', `#workflows?${new URLSearchParams(q)}`);

    const S = crossFilter(FACTS, F).map(f => f.s);
    const fam = new Map();
    for (const s of S) {
      const rem = removalKey(s), sep = separationKey(s);
      for (const r of D.runsBy.get(s.study_id) || []) {
        if (q.tech && r.technique !== q.tech) continue;   // show only the chosen analysis
        const key = `${rem}|${sep}|${r.technique}`;
        (fam.get(key) || fam.set(key, { rem, sep, tech: r.technique, ids: [] }).get(key)).ids.push(s.study_id);
      }
    }
    const rows = [...fam.values()].sort((a, b) => b.ids.length - a.ids.length);
    const lab = (v, stage) => v.split('+').map(x => stepLabel(D, stage, x)).join(' + ');
    const removal = countBy(rows.flatMap(r => r.ids.map(id => [r.rem, id])), ([rem]) => rem);
    out.innerHTML = `<p class="small muted">${S.length} studies · ${rows.length} workflow combinations
      ${removal.length ? ` · most common matrix removal: ${esc(lab(removal[0][0], 'removal'))}` : ''}</p>
      ${rows.length ? `<table><thead><tr><th>Matrix removal</th><th>Separation</th><th>Analysis</th><th class="num">Studies</th><th class="num">With recovery</th></tr></thead>
      <tbody>${rows.map((r, i) => `<tr class="clickable" data-i="${i}"><td>${esc(lab(r.rem, 'removal'))}</td><td>${esc(lab(r.sep, 'separation'))}</td>
        <td title="${esc(label(D, 'method_step', r.tech))}">${esc(short(D, 'method_step', r.tech))}</td><td class="num">${r.ids.length}</td>
        <td class="num">${r.ids.filter(id => (D.recoveryBy.get(id) || []).length).length}</td></tr>
        <tr hidden data-list="${i}"><td colspan="5">${r.ids.map(id => `<a href="#" data-study="${esc(id)}">${esc(D.study[id].label)}</a>`).join(', ')}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No workflows match these filters.</p>'}`;
    // one reference list open at a time: opening a row closes the others; clicking an open row closes it
    out.querySelectorAll('tr.clickable').forEach(tr => tr.addEventListener('click', () => {
      const l = out.querySelector(`[data-list="${tr.dataset.i}"]`);
      const opening = l.hidden;
      out.querySelectorAll('tr[data-list]').forEach(x => { x.hidden = true; });
      out.querySelectorAll('tr.clickable.open').forEach(x => x.classList.remove('open'));
      l.hidden = !opening;
      tr.classList.toggle('open', opening);
    }));
    out.querySelectorAll('[data-study]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); D.openStudy(a.dataset.study); }));
  };

  root.querySelector('.toolbar').addEventListener('change', e => {
    if (e.target.name in q) {
      q[e.target.name] = e.target.value;
      draw();
    }
  });
  root.querySelector('#wfClear').addEventListener('click', () => {
    Object.assign(q, { group: '', character: '', tech: '' });
    draw();
  });
  draw();
}
