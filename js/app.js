// Entry point: load the public dataset, route between views, show study details.
import { indexData, split, label, short, stepLabel, fmt, resultText, resultTags } from '../script/summaries.js';
import { esc } from './ui.js';
import finder from './views/finder.js';
import overview from './views/overview.js';
import workflows from './views/workflows.js';
import validation from './views/validation.js';
import instruments from './views/instruments.js';
import data from './views/data.js';
import home, { issueLink } from './views/home.js';
import occurrence from './views/occurrence.js';
import qaqc from './views/qaqc.js';
import geography from './views/geography.js';
import orthogonal from './views/orthogonal.js';

const VIEWS = { home, overview, finder, workflows, instruments, orthogonal, validation, occurrence, qaqc, geography, data };
const main = document.getElementById('view');
let D;

// Tables are stored column-wise ({cols, rows}) to keep the file small; expand them to row objects.
function expand(db) {
  for (const [k, v] of Object.entries(db)) {
    if (v && Array.isArray(v.cols) && Array.isArray(v.rows)) {
      db[k] = v.rows.map(r => Object.fromEntries(v.cols.map((c, i) => [c, r[i] == null ? '' : String(r[i])])));
    }
  }
  return db;
}

async function load() {
  const res = await fetch('data/mnp_public.json');
  if (!res.ok) throw new Error(`Could not load data (${res.status})`);
  const raw = expand(await res.json());
  D = indexData(raw);
  D.raw = raw;   // unindexed tables, used by the Data page
  D.openStudy = openStudy;
  document.getElementById('meta').textContent =
    `${D.meta.n_studies} studies · ${D.occ.length.toLocaleString('en-US')} occurrence results · data version ${D.meta.dataset_version}`;
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const [name, query] = (location.hash.slice(1) || 'home').split('?');
  const view = VIEWS[name] ? name : 'home';
  document.querySelectorAll('#tabs a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${view}`));
  if (document.querySelector('#tabs a[aria-current]')) document.querySelector('#tabs a[aria-current]').setAttribute('aria-current', 'page');
  main.replaceChildren();
  VIEWS[view](main, D, new URLSearchParams(query || ''));
  main.focus({ preventScroll: true });
  if (name !== route.last) scrollTo(0, 0);   // new page: start at the top
  route.last = name;
  // footer: feedback link pre-filled with the current page
  const page = document.querySelector(`#tabs a[href="#${view}"]`)?.textContent || view;
  document.getElementById('pageFeedback').href = issueLink(`[${page}] `, `Page: ${page} (${location.href})\nSection:\nWhat looks wrong or could be better:\n`);
}

// ---------------------------------------------------------------- light / dark toggle
const themeBtn = document.getElementById('themeToggle');
const systemDark = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => document.documentElement.dataset.theme || (systemDark.matches ? 'dark' : 'light');
const paintThemeButton = () => {
  const dark = currentTheme() === 'dark';
  themeBtn.textContent = dark ? '☀ Light' : '☾ Dark';
  themeBtn.title = `Switch to ${dark ? 'light' : 'dark'} theme`;
};
themeBtn.addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('mnp-theme', next); } catch (e) { /* storage unavailable: choice lasts for this visit */ }
  paintThemeButton();
});
systemDark.addEventListener('change', paintThemeButton);
paintThemeButton();

// ---------------------------------------------------------------- study detail drawer
const drawer = document.getElementById('detail');
document.getElementById('detailClose').addEventListener('click', () => (drawer.hidden = true));
document.addEventListener('keydown', e => { if (e.key === 'Escape') drawer.hidden = true; });

function openStudy(id) {
  const s = D.study[id];
  if (!s) return;
  const codes = (v, voc) => split(v).map(c => `<span class="chip">${esc(label(D, voc, c))}</span>`).join(' ') || '<span class="muted">–</span>';
  const steps = (v, stage) => split(v).map(c => `<span class="chip">${esc(stepLabel(D, stage, c))}</span>`).join(' ') || '<span class="muted">–</span>';
  const pol = (D.findingsBy.get(id) || []).map(f =>
    `<tr><td>${esc(f.polymer_code)}</td><td>${esc(label(D, 'finding_role', f.role))}</td><td>${esc(label(D, 'evidence_status', f.id_status))}</td></tr>`).join('');
  const rec = (D.recoveryBy.get(id) || []).map(p =>
    `<tr><td>${esc(p.polymer_code || p.polymer_raw)}</td><td class="num">${fmt(+p.value_pct)}%</td><td>${esc(p.endpoint)}</td><td>${esc(p.scope)}</td></tr>`).join('');
  const params = D.params.filter(p => p.study_id === id).map(p =>
    `<tr><td>${esc(label(D, 'instrument_parameter', p.parameter))}</td><td>${p.value_code ? esc(label(D, 'spectral_library', p.value_code)) :
      esc(p.value_lo === p.value_hi ? fmt(+p.value_lo) : `${fmt(+p.value_lo)}–${fmt(+p.value_hi)}`) + ' ' + esc(p.unit)}</td></tr>`).join('');
  // sample groups with their results (occurrence studies only)
  const unitLabel = u => label(D, 'result_unit', u);
  const analyteLabel = a => (D.vocab.analyte_group[a] ? D.vocab.analyte_group[a].label_en : a);
  const groups = (D.groupsBy.get(id) || []).map(g => {
    const rs = (D.resultsBy.get(id) || []).filter(r => r.group_id === g.group_id);
    const n = [g.n_samples && `n = ${g.n_samples}${g.n_subjects && g.n_subjects !== g.n_samples ? ` (${g.n_subjects} subjects)` : ''}`,
      g.cohort_role && g.cohort_role !== 'all' ? g.cohort_role : ''].filter(Boolean).join(' · ');
    return `<details class="grp"${rs.length <= 12 ? ' open' : ''}><summary><b>${esc(g.group_label)}</b>
      <span class="muted small">${esc(label(D, 'matrix_organism', g.organism_code))} · ${esc(label(D, 'matrix_sample_type', g.sample_type_code))}${n ? ' · ' + esc(n) : ''} · ${rs.length} results</span></summary>
      ${rs.length ? `<div class="tablewrap"><table class="small"><tr><th>Analyte</th><th>Value</th><th>Unit</th></tr>${rs.map(r => `<tr>
        <td>${esc(analyteLabel(r.analyte))}${r.size_class_um ? ` <span class="muted">${esc(r.size_class_um)} µm</span>` : ''}${r.shape_code ? ` <span class="muted">${esc(r.shape_code)}</span>` : ''}</td>
        <td>${esc(resultText(r))} ${resultTags(r).map(t => `<span class="tag">${esc(t)}</span>`).join(' ')}</td>
        <td>${esc(unitLabel(r.unit))}${r.wet_dry ? ` <span class="muted">${esc(r.wet_dry)}</span>` : ''}</td></tr>`).join('')}</table></div>` : ''}
    </details>`;
  }).join('');
  const QA = ['blanks_procedural', 'blank_correction', 'recovery_tested', 'lod_reported', 'orthogonal_method', 'raw_data'];
  const qa = (D.qaqcBy.get(id) || []).filter(x => QA.includes(x.item)).map(x =>
    `<span class="chip qa-${esc(x.value)}">${esc(label(D, 'qaqc_item', x.item))}: ${esc(label(D, 'qaqc_value', x.value))}</span>`).join(' ');
  const refRows = D.refmatBy.get(id) || [];
  const refs = ['type', 'use'].map(f => refRows.filter(r => r.facet === f).map(r =>
    `<span class="chip">${esc(label(D, f === 'type' ? 'refmat_type' : 'refmat_use', r.code))}</span>`).join(' ')).filter(Boolean).join(' → ');
  const ortho = (D.orthoBy.get(id) || []).map(r => `<span class="chip">${esc(label(D, 'ortho_relation', r.code))}</span>`).join(' ');
  const temp = s.digestion_temp_c_lo === '' ? '–' : `${s.digestion_temp_c_lo}${s.digestion_temp_c_hi !== s.digestion_temp_c_lo ? '–' + s.digestion_temp_c_hi : ''} °C`;
  const time = s.digestion_time_h_lo === '' ? '–' : `${fmt(+s.digestion_time_h_lo)}${s.digestion_time_h_hi !== s.digestion_time_h_lo ? '–' + fmt(+s.digestion_time_h_hi) : ''} h`;
  document.getElementById('detailBody').innerHTML = `
    <h2>${esc(s.label)}</h2>
    ${s.evidence_scope === 'methods_only' ? '<p><span class="badge">Methods only</span> <span class="muted small">Spiked, exposed or method-only study: used for method evidence, not for occurrence.</span></p>' : ''}
    <p>${esc(s.title)}<br>${s.doi ? `<a href="https://doi.org/${esc(s.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))}" target="_blank" rel="noopener">${esc(s.doi)}</a>` : ''}</p>
    <dl>
      <dt>Design</dt><dd>${esc(label(D, 'study_design', s.study_design))}</dd>
      <dt>Country</dt><dd>${codes(s.countries, 'country')}</dd>
      <dt>Organisms</dt><dd>${codes(s.organisms, 'matrix_organism')}</dd>
      <dt>Sample types</dt><dd>${codes(s.sample_types, 'matrix_sample_type')}</dd>
      <dt>Matrix character</dt><dd>${codes(s.matrix_characters, 'matrix_character')}</dd>
      <dt>Physical</dt><dd>${steps(s.physical_steps, 'physical')}</dd>
      <dt>Matrix removal</dt><dd>${steps(s.removal_steps, 'removal')}</dd>
      <dt>Separation</dt><dd>${steps(s.separation_steps, 'separation')}</dd>
      <dt>Analysis</dt><dd>${split(s.techniques).map(c => `<span class="chip" title="${esc(label(D, 'method_step', c))}">${esc(short(D, 'method_step', c))}</span>`).join(' ') || '<span class="muted">–</span>'}</dd>
      <dt>Digestion</dt><dd>${esc(temp)}, ${esc(time)}</dd>
      <dt>Filter pore</dt><dd>${s.filter_pore_um_lo === '' ? '–' : esc(fmt(+s.filter_pore_um_lo)) + ' µm'}</dd>
      <dt>Reporting basis</dt><dd>${esc(s.metric_basis || '–')}</dd>
      <dt>Smallest size</dt><dd>${s.min_particle_size_um === '' ? '–' : esc(fmt(+s.min_particle_size_um)) + ' µm (' + esc(s.min_particle_size_basis.replace(/_/g, ' ')) + ')'}</dd>
      <dt>Polymer outcome</dt><dd>${esc(label(D, 'polymer_outcome', s.polymer_id_outcome))}</dd>
    </dl>
    ${groups ? `<h3>Sample groups and results</h3><p class="muted small">Values as reported; each group is a separate population, so values are not summed across groups.</p>${groups}` : ''}
    <h3>QA/QC</h3><p>${qa || '<span class="muted">–</span>'}</p>
    ${refs ? `<p class="small"><span class="muted">Reference materials:</span> ${refs}</p>` : ''}
    ${ortho ? `<p class="small"><span class="muted">Orthogonal methods:</span> ${ortho}</p>` : ''}
    <h3>Polymers</h3>
    ${pol ? `<div class="tablewrap"><table><tr><th>Polymer</th><th>Role</th><th>Status</th></tr>${pol}</table></div>` : '<p class="muted">None recorded.</p>'}
    <h3>Instrument parameters</h3>
    ${params ? `<div class="tablewrap"><table>${params}</table></div>` : '<p class="muted">None reported.</p>'}
    <h3>Recovery</h3>
    ${rec ? `<div class="tablewrap"><table><tr><th>Polymer</th><th class="num">Value</th><th>Endpoint</th><th>Scope</th></tr>${rec}</table></div>` : '<p class="muted">No recovery values.</p>'}`;
  drawer.hidden = false;
  drawer.scrollTop = 0;
}

// ---------------------------------------------------------------- keyboard access to chart elements
// Bars, cells and rows that open a reference list get focus and act on Enter / Space like buttons.
const makeFocusable = rootEl => rootEl.querySelectorAll('[data-ref]:not(a):not(button):not([tabindex])').forEach(el => {
  el.tabIndex = 0;
  el.setAttribute('role', 'button');
  if (!el.getAttribute('aria-label') && el.title) el.setAttribute('aria-label', el.title);
});
// tables that scroll sideways and hold no link or button get focus so keyboard users can scroll them (WCAG 2.1.1)
const makeScrollable = rootEl => rootEl.querySelectorAll('.tablewrap:not([tabindex])').forEach(w => {
  if (w.querySelector('a, button, [tabindex], select, input')) return;
  w.tabIndex = 0;
  w.setAttribute('role', 'region');
  const head = w.closest('.card, details, section')?.querySelector('h3, summary, h2');
  w.setAttribute('aria-label', head ? `${head.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)} (table)` : 'Table');
});
document.querySelector('.skip-link').addEventListener('click', e => { e.preventDefault(); main.focus(); });
// ---------------------------------------------------------------- foldable cards
// Every card with a heading can be folded; the state is kept per page and card title, so it survives
// filter changes (views redraw their cards) for the rest of the visit.
const folded = new Map();   // page|title -> folded? (only for cards the visitor toggled)
// Which cards start open, per page (card title -> open?); pages not listed start open. A view can still force a
// card open or closed with data-fold-default="open" / "closed".
const ALL_CLOSED = () => false;
const FOLD_OPEN = {
  home: ALL_CLOSED,
  overview: ALL_CLOSED,
  finder: ALL_CLOSED,                                            // pipeline cards: header shows tier and method flow
  instruments: t => t !== 'Polymer types per technique',
  orthogonal: t => t === 'Techniques used together',
  validation: ALL_CLOSED,
  occurrence: ALL_CLOSED,
  qaqc: t => t === 'Reference materials',
  geography: t => t === 'By region',
};
const pageOf = () => (location.hash.slice(1) || 'home').split('?')[0];
const makeFoldable = rootEl => rootEl.querySelectorAll('.card:not(details):not(.page-card), .pipe').forEach(card => {
  const h3 = card.querySelector(':scope > h3');
  if (!h3 || card.dataset.fold) return;
  card.dataset.fold = '1';
  const title = h3.textContent.trim();
  const key = `${pageOf()}|${title}`;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fold-btn';
  btn.innerHTML = `<span class="caret" aria-hidden="true"></span><span>${h3.innerHTML}</span>`;
  h3.replaceChildren(btn);
  const set = isFolded => {
    card.classList.toggle('folded', isFolded);
    btn.setAttribute('aria-expanded', String(!isFolded));
    btn.title = isFolded ? 'Show this section' : 'Fold this section';
  };
  const openRule = FOLD_OPEN[pageOf()];
  const fd = card.dataset.foldDefault;   // 'open' / 'closed' set by a view wins over the page rule
  set(folded.has(key) ? folded.get(key) : fd ? fd === 'closed' : (openRule ? !openRule(title) : false));
  btn.addEventListener('click', () => {
    folded.set(key, !card.classList.contains('folded'));
    set(folded.get(key));
  });
});

// "back to filters" button once the page is scrolled down
const toTop = document.createElement('button');
toTop.type = 'button';
toTop.className = 'to-top';
toTop.innerHTML = '<span aria-hidden="true">↑</span> Filters';
toTop.setAttribute('aria-label', 'Back to the top of the page and the filters');
document.body.append(toTop);
toTop.addEventListener('click', () => {
  scrollTo({ top: 0 });
  const first = main.querySelector('.toolbar select') || main.querySelector('.toolbar input, form select, form input');
  (first || main).focus({ preventScroll: true });
});
addEventListener('scroll', () => toTop.classList.toggle('show', scrollY > 600), { passive: true });

new MutationObserver(() => { makeFocusable(main); makeFoldable(main); makeScrollable(main); }).observe(main, { childList: true, subtree: true });
main.addEventListener('keydown', e => {
  const el = e.target.closest('[data-ref][role="button"]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
});

load().catch(err => {
  main.innerHTML = `<div class="note">${esc(err.message)}. If you opened the file directly, serve the folder instead
    (for example <code>python3 -m http.server</code>) and open the local address.</div>`;
});
