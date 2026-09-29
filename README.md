# MNP Bio-Method Explorer

**Sample preparation, analysis, validation, and occurrence of micro- and nanoplastics in biological samples.**

An evidence map, method finder and occurrence browser built from a systematic review of 432 studies
(378 with untreated biological samples; 54 methods-only studies with spiked, exposed or model-particle samples).

The menu groups the pages by topic:

- **Home:** what the platform is, the evidence at a glance, how to cite, team, feedback, accessibility statement,
  licence and version history.
- **Studies**
  - **Overview:** what the evidence covers: matrices, polymers, techniques, designs and publication years.
  - **Geography:** studies by region and country, by matrix and by publication year.
- **Methods**
  - **Method finder:** describe your sample (matrix) and target (polymer, particle size, count or mass). Every field
    narrows the others to what the evidence covers. It returns ranked sample-preparation and analysis pipelines, each
    with an evidence tier, the supporting studies, recovery values and the settings those studies reported.
  - **Workflows:** combinations of matrix removal, separation and analysis, with their studies.
  - **Instruments:** reported instrument settings, and the polymers, particle sizes, shapes and mass concentrations
    each technique delivered.
  - **Orthogonal methods:** which techniques were used together (for example mass spectrometry with spectroscopy to
    report mass and particle count), how their results related, and the studies behind each pairing.
- **Quality**
  - **Validation:** spike-recovery values by digestion, analysis, polymer and matrix.
  - **QA/QC:** reference materials (five classes), blanks, contamination control, recovery and limits, recovery
    validation coverage of the polymers reported, identification checks, data availability and reporting over time.
- **Findings**
  - **Occurrence:** for each organism and organ or matrix (e.g. human blood, fish gill): the particle sizes covered by
    spectroscopic and mass methods, reported mass and count values side by side, and the individual studies.
    Values are compared only within one unit.
- **Data:** tables, columns, code lists and downloads.

Values and parameters are **as reported** by the studies; they are not validated protocols or recommendations.

## Citation and licence

Son Y, Arienzo M, Li Y. MNP Bio-Method Explorer: sample preparation, analysis, validation, and occurrence of micro- and nanoplastics in biological samples. Version 2026-09-27-merged-v2. 2026. https://mnp-explorer.github.io/

Code: MIT Licence (see `LICENSE`). Any use of the data or summary results must include the citation above.

Team: Yeongkwon Son (School of Public Health, University of Nevada, Reno), Monica Arienzo (Desert Research Institute),
Yongcheng Li (School of Public Health, University of Nevada, Reno).

## Feedback

Questions, corrections and missing studies: please open an issue in
[GitHub Issues](https://github.com/mnp-explorer/mnp-explorer.github.io/issues). The Home page and the footer of every page
link to pre-filled forms (data error, missing study, accessibility problem, general feedback). Issues are public; please do
not include personal or unpublished data.

## Accessibility

The site aims to meet [WCAG 2.2](https://www.w3.org/TR/WCAG22/) level AA: AA text contrast in light and dark themes,
colour-blind-safe chart colours (Okabe–Ito) with values also given as text, full keyboard use with visible focus and a skip
link, labelled controls and named menu groups, reflow to 320 px / 400% zoom, and 24 px click targets or equivalent controls.
Last reviewed 2026-09-29 with axe-core 4.10 (WCAG 2.0–2.2 A/AA rules, all pages, both themes; no violations) and manual
checks. Known limitations and the full statement are on the Home page.

## Version history

- **v2.1** (2026-09-29): Orthogonal methods page; QA/QC reference-material classes, recovery validation coverage and
  reference material log; Occurrence rebuilt by organism × organ/matrix with detection size windows and paired mass/count
  values; foldable cards; menu grouped by topic; accessibility review and statement; feedback through GitHub Issues.
- **v2.0** (2026-09-27): merged dataset of 432 studies (378 occurrence, 54 methods-only); sample groups and occurrence
  results; Home, Occurrence, QA/QC and Geography pages.
- **v1** (2026-09-22): 258 studies; method finder, workflows, instruments and validation.

## Run locally

The page loads its data with `fetch`, so open it through a local web server:

```bash
python3 -m http.server
```

Then open http://localhost:8000.

## Structure

```
index.html            page shell
css/style.css         styles (light / dark)
js/app.js             loads data, routes between views, study detail panel, foldable cards (FOLD_OPEN sets
                      which cards start open on each page), keyboard access
js/popover.js         study lists opened from chart elements
js/ui.js              small DOM helpers (bars, range plots, selects)
js/views/*.js         one file per view
script/summaries.js   data indexing, statistics and result formatting shared by views and models
script/finder.js      method-finder model: feasibility, relevance weights, evidence tiers
script/facets.js      cross-filtering: each finder field counts only studies matching the other selections
script/models/        further models (see README there)
data/                 public dataset: CSV tables + mnp_public.json (see data/README.md)
```

There is no build step and no external library. Hidden folders (`.git`) are not part of the site; upload only the
files listed above. `data/` is generated from the curated
dataset; don't edit it by hand.

## Evidence tiers (method finder)

| Tier | Rule |
|---|---|
| A: validated | ≥3 studies on the same matrix group or character, and a full-workflow recovery within 70–130% |
| B: supported | ≥3 studies on similar matrices, with no matching recovery validation |
| C: limited | 1–2 studies on similar matrices |
| D: extrapolated | Only studies on other matrices |

Within a tier, pipelines are ordered by summed study weights. Weights reflect matrix
similarity, polymer and size match, and study design. The thresholds and weights are in
`script/finder.js` (`SETTINGS`).
