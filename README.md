# MNP Methods Explorer

**Sample preparation, analysis, and validation of micro- and nanoplastics in biological samples.**

An evidence map and method finder built from a systematic extraction of 258 studies.

- **Overview:** what the evidence covers: matrices, polymers, techniques and designs.
- **Method finder:** describe your sample (matrix) and target (polymer, particle size,
  count or mass). Every field narrows the others to what the evidence covers. It returns ranked sample-prep and analysis pipelines. Each has an
  evidence tier, the supporting studies, recovery values and the settings those studies
  reported.
- **Workflows:** combinations of matrix removal, separation and analysis, with their studies.
- **Instruments:** reported instrument settings, and the polymers, particle sizes, shapes
  and mass concentrations each technique delivered.
- **Validation:** spike-recovery values by reagent, analysis, polymer and matrix.

Parameters are **reported practice**, not optimised or validated settings.

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
js/app.js             loads data, routes between views, study detail panel
js/ui.js              small DOM helpers (bars, range plots, selects)
js/views/*.js         one file per view
script/summaries.js   data indexing and statistics shared by views and models
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
