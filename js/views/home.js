// Home: what the platform is, what each page answers, the evidence base at a glance, and the
// citation / team / acknowledgement / contact information. Text in [brackets] is a placeholder.
import { split } from '../../script/summaries.js';
import { esc, h } from '../ui.js';

const PAGES = [   // same order and grouping as the main menu
  ['overview', 'Overview', 'What does the evidence base cover?', 'Matrices, polymers, techniques, pipeline steps and publication years, with the studies behind every bar.'],
  ['geography', 'Geography', 'Where does the evidence come from?', 'Studies by country and region, by matrix and over time.'],
  ['finder', 'Method finder', 'Which method suits my sample and target?', 'Ranked sample-preparation and analysis pipelines for a matrix, polymer, size range and reporting basis, with evidence tiers and reported settings.'],
  ['workflows', 'Workflows', 'How do studies combine the steps?', 'Matrix removal → separation → analysis combinations, and the studies that used them.'],
  ['instruments', 'Instruments', 'What does each technique deliver?', 'Reported settings, polymers identified, particle size ranges and mass ranges per analysis technique.'],
  ['orthogonal', 'Orthogonal methods', 'How are techniques combined and cross-checked?', 'Which techniques are used together — e.g. mass spectrometry with spectroscopy to report mass and particle count — and whether they agreed.'],
  ['validation', 'Validation', 'How much of a spike survives the method?', 'Spike-recovery values by digestion, analysis, polymer and matrix.'],
  ['qaqc', 'QA/QC', 'How do studies control and report quality?', 'Reference materials, blanks, contamination control, recovery testing, detection limits and data availability — and how reporting has changed over time.'],
  ['occurrence', 'Occurrence', 'What has been measured in which organ, over which sizes?', 'For each organ or sample matrix (e.g. human blood, fish gill): the particle sizes covered by mass and spectroscopic methods, reported mass and count values, and the studies behind them.'],
  ['data', 'Data', 'What exactly is in the dataset?', 'Tables, columns, code lists and downloads.'],
];

const SITE = 'https://mnp-explorer.github.io/';
export const REPO = 'https://github.com/mnp-explorer/mnp-explorer.github.io';
// Feedback goes to public GitHub Issues through pre-filled forms (a GitHub account is needed; no e-mail address is published)
export const issueLink = (title, body) => `${REPO}/issues/new?${new URLSearchParams({ title, body })}`;
const FEEDBACK = [
  ['Report a data error', '[Data] ', 'Study (DOI or label):\nPage and section:\nWhat looks wrong:\nWhat the paper reports (page or table):\n'],
  ['Suggest a missing study', '[Study] ', 'DOI:\nWhy it fits the scope (biological samples, MNP analysis):\n'],
  ['Accessibility problem', '[Accessibility] ', 'Page and section:\nWhat you tried to do:\nBrowser, device and assistive technology (if any):\n'],
  ['General feedback or question', '[Feedback] ', ''],
];
const TEAM = [
  ['Yeongkwon Son', 'School of Public Health, University of Nevada, Reno'],
  ['Monica Arienzo', 'Desert Research Institute'],
  ['Yongcheng Li', 'School of Public Health, University of Nevada, Reno'],
];
const CITATION = D => `Son Y, Arienzo M, Li Y. MNP Bio-Method Explorer: sample preparation, analysis, validation, and occurrence of `
  + `micro- and nanoplastics in biological samples. Version ${D.meta.dataset_version}. ${String(D.meta.built).slice(0, 4)}. ${SITE}`;

export default function home(root, D, params) {
  const S = D.studies;
  const occ = S.filter(s => s.evidence_scope !== 'methods_only').length;
  const years = S.map(s => s.year).filter(Boolean);
  const countries = new Set(S.flatMap(s => split(s.countries)).filter(c => c !== 'INTL'));
  const stat = (v, t) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(t)}</span></div>`;

  root.append(h(`<section class="home">
    <h2 class="sr-only">Home</h2>
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

      <div class="card"><h3>Feedback and contact</h3>
        <p>Questions, corrections and suggestions are welcome. Each button opens a short, pre-filled form on
          <a href="${REPO}/issues" target="_blank" rel="noopener">GitHub Issues</a> (free GitHub account needed); messages are public, so
          please do not include personal or unpublished data. If a study is missing or a value looks wrong, please include the DOI.</p>
        <p class="feedback">${FEEDBACK.map(([t, pre, body]) =>
          `<a class="btn" href="${esc(issueLink(pre, body))}" target="_blank" rel="noopener">${esc(t)}<span class="sr-only"> (opens GitHub in a new tab)</span></a>`).join(' ')}</p>
        <p class="muted small">[Private contact option, if added: form link.]</p></div>

      <div class="card" id="accessibility"${params && params.get('show') === 'accessibility' ? ' data-fold-default="open"' : ''}><h3>Accessibility statement</h3>
        <p>We want everyone to be able to use this site, including people who use a keyboard, screen reader, magnification or
          high-contrast settings. The site aims to meet the <a href="https://www.w3.org/TR/WCAG22/" target="_blank" rel="noopener">Web
          Content Accessibility Guidelines (WCAG) 2.2</a> at level AA.</p>
        <h4 class="sub-h">What we do</h4>
        <ul class="reading">
          <li>Text and interface colours meet AA contrast in the light and dark themes; chart colours come from a colour-blind-safe
            palette (Okabe–Ito), and colour is never the only cue — values, counts and labels are also given as text.</li>
          <li>Every page, menu, filter, fold button and chart element that opens a study list works with a keyboard (Tab, Enter,
            Space, Esc), with a visible focus outline and a "Skip to content" link.</li>
          <li>Pages use headings, landmarks and labelled controls; the menu groups are named for screen readers.</li>
          <li>Layouts reflow to narrow screens and to 400% zoom without losing content; wide tables scroll inside their own box.</li>
          <li>Click and touch targets are at least 24 × 24 pixels, or have an equivalent larger control (for example, the legend
            entries under stacked bars).</li>
        </ul>
        <h4 class="sub-h">Known limitations</h4>
        <ul class="reading">
          <li>Charts are visual summaries. The numbers behind them are available as text in each chart element's study list and in
            the downloadable tables on the Data page.</li>
          <li>Hover titles on bars give extra detail for mouse users; the same information is in the study list opened by click or
            Enter.</li>
          <li>On phones, some charts show general trends only; the full detail needs a larger screen.</li>
          <li>Study titles and codes come from the original publications and may contain abbreviations.</li>
        </ul>
        <h4 class="sub-h">How we checked</h4>
        <p>Automated testing with axe-core 4.10 (WCAG 2.0–2.2 A and AA rules) on every page in both themes,
          and manual checks of keyboard use, focus order, zoom and reflow, text spacing and colour contrast. Last reviewed
          29 September 2026.</p>
        <p>If something does not work for you, please tell us through the <a href="${esc(issueLink('[Accessibility] ', FEEDBACK[2][2]))}"
          target="_blank" rel="noopener">accessibility feedback form</a>, and describe the page and what you tried to do.</p></div>

      <div class="card"><h3>Licence</h3>
        <p>The code is released under the <a href="LICENSE" target="_blank" rel="noopener">MIT Licence</a>.
          Any use of the data or summary results from this site must include the citation above.</p></div>

      <div class="card"><h3>Version history</h3>
        <ul class="versions">
          <li><b>v2.1</b> (2026-09-29) — new Orthogonal methods page (techniques used together, how they related, study by study);
            QA/QC with five reference-material classes, recovery validation coverage and a reference material log; Occurrence rebuilt
            by organism and organ or matrix, with detection size windows, mass and count values side by side and expandable study
            lists; foldable cards; menu grouped by topic; accessibility review (WCAG 2.2 AA) and statement; feedback through GitHub Issues.</li>
          <li><b>v2.0</b> (2026-09-27) — merged dataset of ${S.length} studies; sample groups and occurrence results;
            Home, Occurrence, QA/QC and Geography pages; methods-only studies marked.</li>
          <li><b>v1</b> (2026-09-22) — 258 studies; method finder, workflows, instruments and validation.</li>
        </ul></div>
    </div>
  </section>`));
  if (params && params.get('show') === 'accessibility') requestAnimationFrame(() => root.querySelector('#accessibility')?.scrollIntoView());
}
