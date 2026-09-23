// Entry point: load the public dataset, route between views, show study details.
import { indexData, split, label, short, stepLabel, fmt } from '../script/summaries.js';
import { esc } from './ui.js';
import finder from './views/finder.js';
import overview from './views/overview.js';
import workflows from './views/workflows.js';
import validation from './views/validation.js';
import instruments from './views/instruments.js';
import data from './views/data.js';

const VIEWS = { overview, finder, workflows, instruments, validation, data };
const main = document.getElementById('view');
let D;

async function load() {
  const res = await fetch('data/mnp_public.json');
  if (!res.ok) throw new Error(`Could not load data (${res.status})`);
  const raw = await res.json();
  D = indexData(raw);
  D.raw = raw;   // unindexed tables, used by the Data page
  D.openStudy = openStudy;
  document.getElementById('meta').textContent =
    `${D.meta.n_studies} studies · ${D.runs.length} instrument uses · data version ${D.meta.dataset_version}`;
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const [name, query] = (location.hash.slice(1) || 'overview').split('?');
  const view = VIEWS[name] ? name : 'overview';
  document.querySelectorAll('#tabs a').forEach(a => a.toggleAttribute('aria-current', a.getAttribute('href') === `#${view}`));
  if (document.querySelector('#tabs a[aria-current]')) document.querySelector('#tabs a[aria-current]').setAttribute('aria-current', 'page');
  main.replaceChildren();
  VIEWS[view](main, D, new URLSearchParams(query || ''));
  main.focus({ preventScroll: true });
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
  const temp = s.digestion_temp_c_lo === '' ? '–' : `${s.digestion_temp_c_lo}${s.digestion_temp_c_hi !== s.digestion_temp_c_lo ? '–' + s.digestion_temp_c_hi : ''} °C`;
  const time = s.digestion_time_h_lo === '' ? '–' : `${fmt(+s.digestion_time_h_lo)}${s.digestion_time_h_hi !== s.digestion_time_h_lo ? '–' + fmt(+s.digestion_time_h_hi) : ''} h`;
  document.getElementById('detailBody').innerHTML = `
    <h2>${esc(s.label)}</h2>
    <p>${esc(s.title)}<br>${s.doi ? `<a href="https://doi.org/${esc(s.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, ''))}" target="_blank" rel="noopener">${esc(s.doi)}</a>` : ''}</p>
    <dl>
      <dt>Design</dt><dd>${esc(s.study_design.replace(/_/g, ' '))}</dd>
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
    <h3>Polymers</h3>
    ${pol ? `<div class="tablewrap"><table><tr><th>Polymer</th><th>Role</th><th>Status</th></tr>${pol}</table></div>` : '<p class="muted">None recorded.</p>'}
    <h3>Instrument parameters</h3>
    ${params ? `<div class="tablewrap"><table>${params}</table></div>` : '<p class="muted">None reported.</p>'}
    <h3>Recovery</h3>
    ${rec ? `<div class="tablewrap"><table><tr><th>Polymer</th><th class="num">Value</th><th>Endpoint</th><th>Scope</th></tr>${rec}</table></div>` : '<p class="muted">No recovery values.</p>'}`;
  drawer.hidden = false;
  drawer.scrollTop = 0;
}

load().catch(err => {
  main.innerHTML = `<div class="note">${esc(err.message)}. If you opened the file directly, serve the folder instead
    (for example <code>python3 -m http.server</code>) and open the local address.</div>`;
});
