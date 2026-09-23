# MNP Methods Explorer: public data

Processed results from a systematic extraction of 258 studies on micro- and nanoplastic
analysis in biological matrices. These files hold coded, parsed results only. The
extraction sheets and curator notes are not published.

Built by `scripts/04_build_public.py` from the private curated dataset. Version is in
`mnp_public.json → meta.dataset_version`.

## Tables (all join on `study_id`; instrument tables also on `run_id`)

| File | One row per | Key columns |
|---|---|---|
| `studies.csv` | study | label, year, DOI, title; `study_design`; matrix codes (`organisms`, `sample_types`, `matrix_characters`); pipeline codes (`physical_steps`, `removal_steps`, `separation_steps`, `techniques`); digestion temperature / time and filter pore (lo–hi); `metric_basis`; `min_particle_size_um` + basis; polymer summary |
| `instrument_runs.csv` | study × analysis technique | `run_id`, `technique`, `family`, what the technique can report |
| `instrument_parameters.csv` | study × technique family × parameter | `parameter` (see `vocab.instrument_parameter`), `value_lo`–`value_hi` + `unit` for numbers, `value_code` for categories, `n_values` when several settings were reported |
| `instrument_results.csv` | run × result | `result_type` = `polymer` / `size_span` / `shape` / `mass_span` / `min_size`; `code` or `lo`–`hi` + `unit`; `kind`; polymer `role` and `status`; **`attribution`** |
| `polymer_findings.csv` | study × polymer × role | `role` (why the polymer is in the study) and `id_status` (how well it is supported) |
| `matrix.csv` | study × facet × code | organism, sample type (+ matrix character), environmental comparator |
| `recovery_points.csv` | recovery value | value %, endpoint (mass / count), polymer, size, scope, pipeline steps |
| `spans.csv` | reported range | size / mass / mass-recovery ranges with `kind` (observed / operational / reference / summary …) |
| `instrument_summary.json` | technique | parameter distributions (n, min, quartiles, max), polymers, observed size ranges, reported minimum sizes, shapes, mass concentrations by unit and matrix character |
| `mnp_public.json` | — | all of the above plus the vocabularies, for the web app |

## How instruments are linked to results

Many studies used several instruments but report polymers, sizes or concentrations once.
Every link therefore has an `attribution`:

- `direct`: the only instrument in the study that could have produced the result, or the
  result is labelled with that instrument.
- `shared`: several instruments in the study could have produced it. Count it for each,
  but don't treat it as specific to one.
- `derived`: a mass value linked to a particle instrument because the mass was estimated from
  particle counts or sizes.

Only instruments able to produce the result type are linked: polymer identity →
spectroscopic or thermal methods; size and shape → particle methods; mass → mass methods.

## Reading the values

- Polymer `role` values: `field_detection` counts as occurrence in study samples. Exposure
  materials, spikes, method materials and blanks do not.
- `min_size` `kind`: `reported` (particles detected in samples), `model_particle` (nominal
  size of added particles) or `not_demonstrated` (size tested but detection not achieved).
- Size `kind`: `observed` (particles found), `operational` (method limits and cut-offs) or
  `reference` (standards / model material).
- Parameters are **reported practice**, not optimised settings. Several values in one
  study (e.g. two instruments) become a lo–hi range.
- FTIR parameters are reported per study for the FTIR family. In studies that used both
  ATR and µ-FTIR, they apply to both.
