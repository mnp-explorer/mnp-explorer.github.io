# MNP Bio-Method Explorer

**Sample preparation, analysis, validation, and occurrence of micro- and nanoplastics in biological samples.**

An evidence map, method finder and occurrence browser built from a systematic review of 432 studies
(378 with untreated biological samples; 54 methods-only studies with spiked, exposed or model-particle samples).

- **Home:** what the platform is, the evidence at a glance, how to cite, team, acknowledgements and contact.
- **Overview:** what the evidence covers: matrices, polymers, techniques and designs.
- **Method finder:** describe your sample (matrix) and target (polymer, particle size,
  count or mass). Every field narrows the others to what the evidence covers. It returns ranked sample-prep and analysis pipelines. Each has an
  evidence tier, the supporting studies, recovery values and the settings those studies
  reported.
- **Workflows:** combinations of matrix removal, separation and analysis, with their studies.
- **Instruments:** reported instrument settings, and the polymers, particle sizes, shapes
  and mass concentrations each technique delivered.
- **Validation:** spike-recovery values by reagent, analysis, polymer and matrix.
- **Occurrence:** reported concentrations and detection frequencies by sample type, polymer, organism and region,
  compared only within one unit.
- **QA/QC:** blanks, contamination control, recovery and limits, identification checks and data availability,
  and how reporting has changed over time.
- **Geography:** studies by region and country, by matrix and by publication year.
- **Data:** tables, columns, code lists and downloads.

Values and parameters are **as reported** by the studies; they are not validated protocols or recommendations.

## Citation and licence

Son Y, Arienzo M, Li Y. MNP Bio-Method Explorer: sample preparation, analysis, validation, and occurrence of micro- and nanoplastics in biological samples. Version 2026-09-27-merged-v2. 2026. https://mnp-explorer.github.io/

Code: MIT Licence (see `LICENSE`). Any use of the data or summary results must include the citation above.

Team: Yeongkwon Son (School of Public Health, University of Nevada, Reno), Monica Arienzo (Desert Research Institute),
Yongcheng Li (School of Public Health, University of Nevada, Reno).

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
js/app.js             loads data, routes between views, study detail panel (groups and results)
js/ui.js              small DOM helpers (bars, range plots, selects)
js/views/*.js         one file per view
script/summaries.js   data indexing, statistics and result formatting shared by views and models
script/finder.js      method-finder model: feasibility, relevance weights, evidence tiers
script/facets.js      cross-filtering: each finder field counts only studies matching the other selections
script/models/        further models (see README there)
data/                 public dataset: CSV tables + mnp_public.json (see data/README.md)
```

There is no build step and no external library. `data/` is generated from the curated
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
