// Data: dictionary of the public dataset — tables, columns, how to read the values,
// code lists and downloads. Column lists are read from the loaded data, so this page
// always matches the published files; the descriptions below explain them.
import { esc, h } from '../ui.js';

const TABLES = [
  ['studies', 'studies.csv', 'One row per study', 'Bibliography, country, matrix codes, pipeline codes, digestion conditions, reporting basis, polymer summary and evidence scope.'],
  ['groups', 'groups.csv', 'One row per sample group', 'Populations or sample sets within a study (organism, sample type, cohort role, number of samples). Occurrence studies only.'],
  ['results', 'results.csv', 'Group × analyte × measure', 'Reported concentrations, detection frequencies and particle statistics for each sample group.'],
  ['instrument_runs', 'instrument_runs.csv', 'Study × analysis technique', 'Which techniques each study used, and what each technique can report.'],
  ['instrument_parameters', 'instrument_parameters.csv', 'Study × technique family × parameter', 'Reported instrument settings, parsed into numbers (low–high) or codes.'],
  ['instrument_results', 'instrument_results.csv', 'Instrument use × result', 'Polymers, particle sizes, shapes, mass concentrations and smallest sizes linked to the instrument that produced them.'],
  ['polymer_findings', 'polymer_findings.csv', 'Study × polymer × role', 'Every polymer mention with why it is in the study (role) and how well it is supported (status).'],
  ['matrix', 'matrix.csv', 'Study × facet × code', 'Organism groups, sample types (with matrix character) and environmental comparator samples.'],
  ['recovery_points', 'recovery_points.csv', 'One row per recovery value', 'Spike-recovery values with polymer, size, spike matrix, scope and pipeline steps.'],
  ['spans', 'spans.csv', 'One row per reported range', 'Size, mass and mass-recovery ranges as reported by each study.'],
  ['qaqc', 'qaqc.csv', 'Study × QA/QC item', 'Blanks, contamination control, recovery and limits, identification checks and data availability, coded per study.'],
  ['performance', 'performance.csv', 'Study × method-performance metric', 'Which method-performance measures a study reports (spike recovery, precision, digestion efficiency …).'],
];

const COLUMNS = {
  study_id: 'Stable study ID (SID + number). Joins all tables. Numbers are never reused.',
  label: 'Short citation (first author, year).', year: 'Publication year.', doi: 'DOI.', title: 'Article title.',
  study_design: 'Study design code (see "Study design").',
  countries: 'Countries where samples were collected (see "Countries"), semicolon-separated.',
  evidence_scope: 'occurrence (untreated biological samples; method and occurrence evidence) or methods_only (spiked, exposed or model-particle samples; method evidence only).',
  source_batch: 'original (first review round) or additional (update round).',
  n_groups: 'Number of sample groups in groups.csv.', n_results: 'Number of rows in results.csv.',
  group_id: 'Sample group ID. Joins groups and results.', group_label: 'Short description of the group.',
  organism_code: 'Organism code of the group (see "Organisms").', sample_type_code: 'Sample type code of the group (see "Sample types").',
  cohort_role: 'all, stratum, case, control or other.', n_samples: 'Number of samples in the group.', n_subjects: 'Number of individuals, when different from samples.',
  technique_codes: 'Techniques that produced the group results.',
  group_scope: 'group, or study_aggregate (a study total that overlaps its subgroups).',
  result_id: 'Result ID.', analyte: 'Polymer code, or TOTAL_COUNT / TOTAL_MASS / ANTHROPOGENIC (see "Totals").',
  metric_basis: 'count, mass, detection or qualitative.', wet_dry: 'wet or dry weight basis, when stated.',
  size_class_um: 'Size class the value refers to (µm), when reported per size class.', shape_code: 'Shape the value refers to, when reported per shape.',
  n_analysed: 'Samples analysed.', n_positive: 'Samples with detections.', pct_positive: 'Share of samples with detections (%).',
  mean: 'Mean.', median: 'Median.', q1: 'First quartile.', q3: 'Third quartile.', min: 'Minimum.', max: 'Maximum.',
  reported_value: 'A single value the study reports without stating the statistic (not a mean).', se: 'Standard error (not an SD).',
  geometric_mean: 'Geometric mean.', identification_threshold: 'Spectral match threshold (0–1) applied to the value.',
  n_negative: 'Samples without detections.', particle_count: 'Number of particles counted.',
  blank_corrected: 'yes or no, when stated.', evidence_status: 'Result status (see "Evidence status"); non-detects are coded, never zero.',
  source_type: 'Where the value comes from (see "Value sources").', summary_level: 'Kind of statistic (see "Summary levels"); blank = ordinary group statistic.',
  item: 'QA/QC item (see "QA/QC items").', value: 'Coded answer (see "QA/QC answers").', metric: 'Method-performance measure reported by the study.',
  organisms: 'Organism group codes (see code list "Organisms"), semicolon-separated.',
  finder_groups: 'Matrix groups used by the method finder.',
  sample_types: 'Sample type codes (see "Sample types").',
  matrix_characters: 'Matrix character codes derived from the sample types (see "Matrix character").',
  environment_samples: 'Environmental comparator samples analysed alongside (seawater, sediment …); never counted as a matrix.',
  model_particles: '"yes" when only model particles were analysed, without a biological matrix.',
  physical_steps: 'Physical pre-treatment codes.', removal_steps: 'Matrix-removal (digestion) codes.',
  separation_steps: 'Separation codes.', techniques: 'Analysis technique codes.',
  digestion_temp_c_lo: 'Digestion temperature, low end (°C); "RT" = room temperature.', digestion_temp_c_hi: 'Digestion temperature, high end (°C).',
  digestion_time_h_lo: 'Digestion time, low end (hours).', digestion_time_h_hi: 'Digestion time, high end (hours).',
  filter_pore_um_lo: 'Filter pore size, low end (µm).', filter_pore_um_hi: 'Filter pore size, high end (µm).',
  filter_material: 'Filter material codes.', metric_basis: 'Reporting basis: count, mass or count+mass.',
  min_particle_size_um: 'Smallest particle size stated by the study (µm).',
  min_particle_size_basis: 'reported (found in samples), model_particle (nominal size of added particles) or not_demonstrated (tested but not achieved).',
  nanoplastic_claimed: 'Whether the study claims nanoplastic (< 1 µm) detection.',
  polymers_in_samples: 'Polymers detected in study samples without a caveat.',
  polymers_in_samples_qualified: 'Detections with a caveat, as code(status) — tentative, contamination-qualified, interference or unresolved identity.',
  polymers_exposure: 'Polymers deliberately introduced in exposure experiments.',
  polymer_id_outcome: 'Study-level polymer identification outcome (see "Polymer outcome").',
  flags: 'MULTI_METHOD (results reported per analysis branch), MULTI_REAGENT (several reagents), NONDETECT_OR_UNCONFIRMED.',
  n_recovery_points: 'Number of rows in recovery_points for the study.', dataset_version: 'Build version of the dataset.',
  run_id: 'Instrument use ID (study_id + technique).', technique: 'Analysis technique code.', family: 'Technique family (FTIR, RAMAN, THERMAL …; SPECTRAL = spectral-library settings).',
  identifies_polymer: 'Whether the technique identifies polymer type.', reports_mass: 'Whether it reports mass.',
  reports_size_shape: 'Whether it reports particle size / shape.',
  parameter: 'Parameter code (see "Instrument parameters").', unit: 'Unit of the value (results: see "Units").',
  value_lo: 'Lowest reported value.', value_hi: 'Highest reported value (differs from low when several settings were reported).',
  value_code: 'Code for categorical settings (modality, detector, spectral library, dye).', n_values: 'Number of values found in the study.',
  result_type: 'polymer, size_span, shape, mass_span or min_size.', code: 'Polymer or shape code (polymer / shape rows).',
  lo: 'Low end of the range.', hi: 'High end of the range.',
  kind: 'For sizes: observed (particles found), operational (method limit), reference (standard / model material), summary. For min_size: reported / model_particle / not_demonstrated.',
  basis: 'Mass basis: wet, dry, predicted dry or unspecified.', role: 'Role of the polymer (see "Finding roles").', status: 'Evidence status (see "Evidence status").',
  attribution: 'direct: only this instrument in the study could have produced the result; shared: several could; derived: mass estimated from particle counts or sizes.',
  finding_id: 'Finding ID.', polymer_code: 'Polymer code (see "Polymers").', polymer_parent: 'Parent code in the polymer hierarchy (e.g. PA66 → PA).',
  polymer_family: 'Polymer family.', is_plastic: 'yes, semi (semi-synthetic cellulose) or no (natural).',
  id_status: 'Evidence status (see "Evidence status").',
  facet: 'organism, sample_type or environment_sample.', character: 'Matrix character of the sample type.', finder_group: 'Finder group of the organism.',
  review_status: 'Curation status of the matrix assignment: reviewed or draft.',
  point_id: 'Recovery value ID.', value_pct: 'Recovery (%).', endpoint: 'mass or count.',
  matrix: 'Material the spike was added to (controls such as water or reagent are named).',
  size_lo_um: 'Spike particle size, low end (µm).', size_hi_um: 'Spike particle size, high end (µm).', shape: 'Spike particle shape.',
  spike_mass: 'Spiked mass.', spike_count: 'Spiked particle number.', sd: 'Standard deviation (recovery: variability of the recovery).', n: 'Replicates.',
  variability_metric: 'SD, SE or SEM.', scope: 'digestion_to_end, physical_to_end (full workflow), partial or stability.',
  physical: 'Physical step of the validated workflow.', removal: 'Digestion reagent of the validated workflow.',
  separation: 'Separation step of the validated workflow.', analysis: 'Analysis of the validated workflow.',
  assignment_known: 'Whether the recovery value can be assigned to a specific workflow.',
  span_id: 'Range ID.', span_type: 'size, mass or mass_recovery_reported.', open_end: 'Set when the range is open (e.g. "> 1 µm").',
};

// code lists shown (vocabulary, title, columns to show)
const CODE_LISTS = [
  ['polymer', 'Polymers', ['code', 'label_en', 'parent', 'family', 'is_plastic', 'sdn_h05_id']],
  ['matrix_organism', 'Organisms', ['code', 'label_en', 'finder_group', 'ncbi_taxid']],
  ['matrix_sample_type', 'Sample types', ['code', 'label_en', 'default_character']],
  ['matrix_character', 'Matrix character', ['code', 'label_en', 'definition']],
  ['environment_sample', 'Environmental samples', ['code', 'label_en']],
  ['method_step', 'Pipeline steps', ['stage', 'code', 'label_en', 'short_label']],
  ['technique_property', 'Technique capabilities', ['code', 'family', 'identifies_polymer', 'reports_count', 'reports_mass', 'reports_size_shape']],
  ['instrument_parameter', 'Instrument parameters', ['code', 'family', 'label_en', 'unit']],
  ['spectral_library', 'Spectral libraries', ['code', 'label_en']],
  ['shape', 'Shapes', ['code', 'label_en', 'sdn_h01_id']],
  ['filter_material', 'Filter materials', ['code', 'label_en']],
  ['finding_role', 'Finding roles', ['code', 'label_en', 'counts_as_occurrence', 'definition']],
  ['evidence_status', 'Evidence status', ['code', 'label_en', 'definition']],
  ['polymer_outcome', 'Polymer outcome', ['code', 'label_en', 'definition']],
  ['study_design', 'Study design', ['code', 'label_en']],
  ['country', 'Countries', ['code', 'label_en', 'region']],
  ['result_unit', 'Units', ['code', 'label_en', 'metric_basis']],
  ['analyte_group', 'Totals', ['code', 'label_en', 'definition']],
  ['summary_level', 'Summary levels', ['code', 'label_en', 'comparable']],
  ['source_type', 'Value sources', ['code', 'label_en']],
  ['qaqc_item', 'QA/QC items', ['code', 'group', 'label_en', 'values', 'definition']],
  ['qaqc_value', 'QA/QC answers', ['code', 'label_en']],
];
const HEAD = { code: 'Code', label_en: 'Label', parent: 'Parent', family: 'Family', is_plastic: 'Plastic', sdn_h05_id: 'SeaDataNet H05',
  finder_group: 'Finder group', ncbi_taxid: 'NCBI taxon', default_character: 'Matrix character', definition: 'Definition', stage: 'Stage',
  short_label: 'Short label', identifies_polymer: 'Identifies polymer', reports_count: 'Count', reports_mass: 'Mass',
  reports_size_shape: 'Size / shape', unit: 'Unit', sdn_h01_id: 'SeaDataNet H01', counts_as_occurrence: 'Counts as occurrence',
  region: 'Region', metric_basis: 'Basis', comparable: 'Plotted', group: 'Group', values: 'Answers' };

export default function data(root, D) {
  const raw = D.raw;
  const columnsOf = key => [...new Set(raw[key].flatMap(r => Object.keys(r)))];
  const idLink = (col, v) => {
    if (!v) return '';
    if (col === 'ncbi_taxid') return `<a href="https://www.ncbi.nlm.nih.gov/Taxonomy/Browser/wwwtax.cgi?id=${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`;
    if (col === 'sdn_h05_id' || col === 'sdn_h01_id') {
      const [, coll, id] = v.match(/SDN:(H0\d)::(\w+)/) || [];
      return coll ? `<a href="https://vocab.nerc.ac.uk/collection/${coll}/current/${id}/" target="_blank" rel="noopener">${esc(id)}</a>` : esc(v);
    }
    return esc(v);
  };

  root.append(h(`<section class="dataview"><h2>Data</h2>
    <p class="muted">The public dataset behind this site: processed results from a systematic extraction of ${D.meta.n_studies} studies on
      micro- and nanoplastics in biological samples. Extraction text and curator notes are not included.
      Data version <b>${esc(D.meta.dataset_version)}</b>, built ${esc(D.meta.built)}.</p>
    <nav class="toc card"><b>On this page</b>
      <a href="#data" data-jump="tables">Tables and columns</a> · <a href="#data" data-jump="reading">Reading the values</a> ·
      <a href="#data" data-jump="codes">Code lists</a> · <a href="#data" data-jump="download">Downloads</a></nav>

    <h3 id="d-tables">Tables and columns</h3>
    <p class="muted small">All tables join on <code>study_id</code>; results join groups on <code>group_id</code>; the instrument tables also join on <code>run_id</code>.</p>
    <div class="stack">${TABLES.map(([key, file, grain, what]) => `
      <details class="card"><summary><b>${esc(file)}</b> <span class="muted">· ${esc(grain)} · ${raw[key].length.toLocaleString('en-US')} rows</span></summary>
        <p>${esc(what)} <a href="data/${esc(file)}" download>Download CSV</a></p>
        <div class="tablewrap"><table class="dict"><thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>${columnsOf(key).map(c => `<tr><td><code>${esc(c)}</code></td><td>${esc(COLUMNS[c] || '–')}</td></tr>`).join('')}</tbody></table></div>
      </details>`).join('')}</div>

    <h3 id="d-reading">Reading the values</h3>
    <div class="card"><ul class="reading">
      <li><b>Role and status.</b> Each polymer entry has a <i>role</i> (why it is in the study) and a <i>status</i> (how well it is supported).
        Only <code>field_detection</code> counts as occurrence in study samples; exposure materials, spikes, method materials and blanks do not.
        Qualifiers reported by the paper (tentative, contamination-qualified, not detected, below LOD/LOQ) are kept in the status.</li>
      <li><b>Occurrence results.</b> Compare values only with the same <code>metric_basis</code> and <code>unit</code>. Never sum or average
        across <code>summary_level</code> or across a <code>study_aggregate</code> group and its subgroups. A blank is missing, not zero;
        non-detects are coded in <code>evidence_status</code>. <code>reported_value</code> is not a mean and <code>se</code> is not an SD.
        Values read from figures (<code>paper_figure</code>) are approximate.</li>
      <li><b>Methods-only studies</b> (<code>evidence_scope = methods_only</code>) analysed spiked, exposed or model-particle samples.
        They count for method evidence but have no sample groups or occurrence results.</li>
      <li><b>Instrument attribution.</b> Many studies used several instruments but reported results once. <code>direct</code> = only this
        instrument in the study could have produced the result; <code>shared</code> = several could; <code>derived</code> = a mass value
        estimated from particle counts or sizes.</li>
      <li><b>Sizes.</b> <code>observed</code> = particles found; <code>operational</code> = method limits and cut-offs;
        <code>reference</code> = standards or model materials. Smallest sizes are <code>reported</code>, <code>model_particle</code>
        (nominal size of added particles) or <code>not_demonstrated</code> (tested but detection not achieved).</li>
      <li><b>Settings are reported practice</b>, not optimised values. Several values in one study (e.g. two instruments) become a low–high range.
        FTIR settings are reported per study and apply to all FTIR modes used in it.</li>
      <li><b>Recovery.</b> Full-workflow values (<code>digestion_to_end</code>, <code>physical_to_end</code>) cover the whole method;
        <code>partial</code> and <code>stability</code> tests do not. The spike matrix may be a control (water, reagent, pure polymer).</li>
    </ul></div>

    <h3 id="d-codes">Code lists</h3>
    <p class="muted small">Polymers link to the SeaDataNet H05 vocabulary, shapes to H01, organisms to NCBI Taxonomy where a matching entry exists.</p>
    <div class="stack">${CODE_LISTS.map(([key, title, cols]) => {
      const rows = D.vocab[key] ? Object.values(D.vocab[key]) : [];
      const list = key === 'method_step' ? raw.vocab.method_step : rows;
      return `<details class="card"><summary><b>${esc(title)}</b> <span class="muted">· ${list.length} codes</span></summary>
        <div class="tablewrap"><table class="dict"><thead><tr>${cols.map(c => `<th>${esc(HEAD[c] || c)}</th>`).join('')}</tr></thead>
        <tbody>${list.map(r => `<tr>${cols.map(c => `<td>${c === 'code' ? `<code>${esc(r[c])}</code>` : idLink(c, r[c])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      </details>`;
    }).join('')}</div>

    <h3 id="d-download">Downloads</h3>
    <div class="card"><p>Everything in one file for software: <a href="data/mnp_public.json" download>mnp_public.json</a>
      (all tables, code lists and per-instrument summaries). Per-instrument summaries alone:
      <a href="data/instrument_summary.json" download>instrument_summary.json</a>.</p>
      <p>${TABLES.map(([, file]) => `<a href="data/${esc(file)}" download>${esc(file)}</a>`).join(' · ')}</p></div>
  </section>`));

  root.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    root.querySelector(`#d-${a.dataset.jump}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}
