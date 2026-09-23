// Overview: what the evidence base covers.
import { countBy, split, label, short, stepLabel } from '../../script/summaries.js';
import { h, bars, kpis } from '../ui.js';

export default function overview(root, D) {
  const S = D.studies;
  const field = D.findings.filter(f => f.role === 'field_detection' || f.role === 'reported');
  const go = (k, v) => (location.hash = `finder?${k}=${encodeURIComponent(v)}`);
  root.append(h(`<section><h2>Overview</h2>
    <p class="muted">Coverage of the evidence base. Click a matrix group, character or polymer to open the method finder with it.</p></section>`));
  root.append(kpis([
    [S.length, 'studies'],
    [new Set(D.runs.map(r => r.technique)).size, 'analysis techniques'],
    [new Set(field.map(f => f.polymer_code)).size, 'polymers detected'],
    [new Set(D.recovery.map(r => r.study_id)).size, 'studies with recovery values'],
    [S.filter(s => s.nanoplastic_claimed === 'yes').length, 'studies claiming nanoplastics'],
  ]));
  const grid = h('<div class="stack"></div>');   // one card per row: long labels stay readable
  const card = (title, el, note = '') => {
    const c = h(`<div class="card"><h3>${title}</h3>${note ? `<p class="muted small">${note}</p>` : ''}</div>`);
    c.append(el);
    grid.append(c);
  };
  card('Matrix group', bars(countBy(S, s => split(s.finder_groups)), { onClick: v => go('group', v) }));
  card('Matrix character', bars(countBy(S, s => split(s.matrix_characters)).map(([c, n]) => [label(D, 'matrix_character', c), n, c]),
    { onClick: v => go('character', v) }), 'Used by the finder to carry evidence between similar matrices.');
  card('Study design', bars(countBy(S, s => s.study_design.replace(/_/g, ' '))));
  card('Polymers detected in samples', bars(countBy(field, f => f.polymer_code).map(([c, n]) => [`${c} – ${label(D, 'polymer', c)}`, n, c]),
    { limit: 14, onClick: v => go('polymer', v) }), 'Field detections and extraction-level reports; excludes spikes, exposure materials and blanks.');
  card('Analysis techniques', bars(countBy(D.runs, r => short(D, 'method_step', r.technique)), { limit: 14 }));
  card('Matrix removal', bars(countBy(S, s => split(s.removal_steps)).map(([c, n]) => [stepLabel(D, 'removal', c), n])));
  card('Separation', bars(countBy(S, s => split(s.separation_steps)).map(([c, n]) => [stepLabel(D, 'separation', c), n])));
  card('Reporting basis', bars(countBy(S, s => s.metric_basis || 'not reported')));
  card('Polymer identification outcome', bars(countBy(S, s => label(D, 'polymer_outcome', s.polymer_id_outcome))));
  card('Publication year', bars(countBy(S, s => s.year).sort((a, b) => b[0] - a[0]).map(([y, n]) => [String(y), n]), { limit: 20 }));
  root.append(grid);
}
