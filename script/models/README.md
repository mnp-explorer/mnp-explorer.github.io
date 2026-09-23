# Models

Model code that runs in the page belongs here, one module per model, each exporting
plain functions that take the indexed dataset (`indexData()` in `../summaries.js`).

Planned, in order:

1. **Reported-practice ranges** (`practice.js`): parameter distributions conditioned
   on technique, matrix character, polymer and size class. For example, µ-FTIR aperture
   and step size used for particles under 50 µm in protein-rich tissue. The data is
   `data/instrument_parameters.csv` joined to `instrument_results.csv`.
2. **Instrument-limit rules** (`rules.js`): which settings can reach a target size
   (e.g. step size relative to particle size, practical lateral resolution of µ-FTIR vs
   Raman). Every rule must carry a citation. The `min_size_um_typical` column of
   `technique_property` stays empty until it is sourced.
3. **Recovery model** (`recovery.js`): coefficients of a mixed-effects model (fitted
   offline on `data/recovery_points.csv`, with a random effect per study). The page only
   evaluates the fitted model and shows prediction intervals.
4. **Published response surfaces** (`surfaces.js`): fitted surfaces from studies that
   optimised a method with a designed experiment, each with the conditions (matrix,
   polymer, size) it applies to. They are shown only when the user's case falls within
   those conditions.

A cross-study response surface for instrument settings is not planned. Studies report one
setting each, rarely with an outcome tied to it, so such a surface would mostly reflect
which lab used which instrument.
