// Home: what the platform is, what each page answers, the evidence base at a glance, and the
// citation / team / acknowledgement / contact information. Text in [brackets] is a placeholder.
import { split } from '../../script/summaries.js';
import { esc, h } from '../ui.js';

const PAGES = [
  ['overview', 'Overview', 'What does the evidence base cover?', 'Matrices, polymers, techniques, pipeline steps and publication years, with the studies behind every bar.'],
  ['finder', 'Method finder', 'Which method suits my sample and target?', 'Ranked sample-preparation and analysis pipelines for a matrix, polymer, size range and reporting basis, with evidence tiers and reported settings.'],
  ['workflows', 'Workflows', 'How do studies combine the steps?', 'Matrix removal → separation → analysis combinations, and the studies that used them.'],
  ['instruments', 'Instruments', 'What does each technique deliver?', 'Reported settings, polymers identified, particle size ranges and mass ranges per analysis technique.'],
  ['validation', 'Validation', 'How much of a spike survives the method?', 'Spike-recovery values by digestion, analysis, polymer and matrix.'],
  ['occurrence', 'Occurrence', 'What has been measured in biological samples?', 'Reported concentrations and detection frequencies by sample type and polymer, compared only within the same unit.'],
  ['qaqc', 'QA/QC', 'How do studies control and report quality?', 'Blanks, contamination control, recovery testing, detection limits, orthogonal methods and data availability — and how reporting has changed over time.'],
  ['geography', 'Geography', 'Where does the evidence come from?', 'Studies by country and region, by matrix and over time.'],
  ['data', 'Data', 'What exactly is in the dataset?', 'Tables, columns, code lists and downloads.'],
];

const SITE = 'https://mnp-explorer.github.io/';
const TEAM = [
  ['Yeongkwon Son', 'School of Public Health, University of Nevada, Reno'],
  ['Monica Arienzo', 'Desert Research Institute'],
  ['Yongcheng Li', 'School of Public Health, University of Nevada, Reno'],
];
const CITATION = D => `Son Y, Arienzo M, Li Y. MNP Bio-Method Explorer: sample preparation, analysis, validation, and occurrence of `
  + `micro- and nanoplastics in biological samples. Version ${D.meta.dataset_version}. ${String(D.meta.built).slice(0, 4)}. ${SITE}`;

export default function home(root, D) {
  const S = D.studies;
  const occ = S.filter(s => s.evidence_scope !== 'methods_only').length;
  const years = S.map(s => s.year).filter(Boolean);
  const countries = new Set(S.flatMap(s => split(s.countries)).filter(c => c !== 'INTL'));
  const stat = (v, t) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(t)}</span></div>`;

  root.append(h(`<section class="home">
    <div class="hero card">
      <p class="lead">The <b>MNP Bio-Method Explorer</b> maps how micro- and nanoplastics (MNPs) are prepared, analysed, validated
        and measured in biological samples — human tissues and fluids, animals, plants and food. It is built from a systematic
        review of the published literature and helps researchers choose methods for their own sample and target, and compare
        what has been found.</p>
      <p class="disclaimer"><b>Disclaimer.</b> The information here summarises methods and results as reported in the published
        studies. It is provided for research guidance only; it is not a validated protocol, a regulatory reference or a
        health-risk assessment, and it should be read together with the original publications.</p>
    </div>

    <h3>Evidence at a glance</h3>
    <div class="kpis">
      ${stat(S.length, 'studies')}
      ${stat(occ, 'with occurrence data')}
      ${stat(D.groups.length.toLocaleString('en-US'), 'sample groups')}
      ${stat(D.occ.length.toLocaleString('en-US'), 'occurrence results')}
      ${stat(D.recovery.length, 'recovery values')}
      ${stat(new Set(D.runs.map(r => r.technique)).size, 'analysis techniques')}
      ${stat(countries.size, 'countries')}
      ${stat(years.length ? `${Math.min(...years)}–${Math.max(...years)}` : '–', 'publication years')}
    </div>

    <h3>What you can explore</h3>
    <div class="pages">${PAGES.map(([k, name, q, what]) => `
      <a class="card page-card" href="#${k}"><b>${esc(name)}</b><span class="q">${esc(q)}</span><span class="muted small">${esc(what)}</span></a>`).join('')}
    </div>

    <div class="stack about">
      <div class="card"><h3>Scope</h3>
        <p>Primary studies that analysed micro- and nanoplastics in biological samples. Studies with untreated biological samples
          contribute both method and occurrence evidence. Studies that analysed only spiked, dosed or exposed samples, or model
          particles, contribute method evidence only and are marked <span class="badge">Methods only</span>. In studies that mixed
          exposure arms with untreated samples, only the untreated groups are used for occurrence.</p>
        <p class="muted small">Literature search, screening and extraction procedures: [link to protocol / review paper].</p></div>

      <div class="card"><h3>How to cite</h3>
        <p class="cite">${esc(CITATION(D))}</p>
        <p class="muted small">Please also cite the associated review: [citation, when available].</p></div>

      <div class="card"><h3>Team</h3>
        <ul class="team">${TEAM.map(([n, a]) => `<li><b>${esc(n)}</b> <span class="muted">${esc(a)}</span></li>`).join('')}</ul></div>

      <div class="card"><h3>Acknowledgements and funding</h3>
        <p>[Funding: agency, programme and grant number.]</p>
        <p>[Acknowledgements: people and groups who contributed to screening, extraction, curation or review.]</p></div>

      <div class="card"><h3>Contact and feedback</h3>
        <p>Questions, corrections and suggestions are welcome: [contact e-mail] or [GitHub Issues link].
          If a study is missing or a value looks wrong, please include the DOI.</p></div>

      <div class="card"><h3>Licence</h3>
        <p>The code is released under the <a href="LICENSE" target="_blank" rel="noopener">MIT Licence</a>.
          Any use of the data or summary results from this site must include the citation above.</p></div>

      <div class="card"><h3>Version history</h3>
        <ul class="versions">
          <li><b>v2</b> (${esc(D.meta.built)}, draft) — merged dataset of ${S.length} studies; sample groups and occurrence results;
            Occurrence, QA/QC and Geography pages; methods-only studies marked.</li>
          <li><b>v1</b> (2026-09-22) — 258 studies; method finder, workflows, instruments and validation.</li>
        </ul></div>
    </div>
  </section>`));
}
