// Small DOM helpers shared by the views.
import { fmt, tick } from '../script/summaries.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Horizontal bar list. rows: [[label, count, key?]]
export function bars(rows, { max, limit = 12, onClick, ref } = {}) {
  const top = rows.slice(0, limit);
  const m = max || Math.max(1, ...top.map(r => r[1]));
  // label column fits the longest label (same rule as the range plots)
  const longest = Math.max(8, ...top.map(([lab]) => String(lab).length));
  const el = h(`<div class="bars" style="--barlab:clamp(90px, ${Math.ceil(longest * 0.6) + 1}em, 45%)">${top.map(([lab, n, key], i) => `
    <div class="bar${onClick || ref ? ' clickable' : ''}" data-i="${i}"${ref ? ` data-ref="${esc(ref(key ?? lab))}"` : ''} title="${esc(lab)}: ${n}">
      <span class="lab">${esc(lab)}</span>
      <span class="track"><span class="fill" style="width:${(100 * n / m).toFixed(1)}%"></span></span>
      <span class="val">${n}</span>
    </div>`).join('') || '<p class="muted small">No data.</p>'}</div>`);
  if (onClick) el.querySelectorAll('.bar').forEach(b => b.addEventListener('click', () => {
    const r = top[+b.dataset.i];
    onClick(r[2] ?? r[0]);
  }));
  return el;
}


// Width of the label column in range plots: fits the longest label (plus its "n=…"),
// at least 120px and at most 45% of the plot, so bars keep room.
function labelWidth(rows) {
  const longest = Math.max(8, ...rows.map(r => `${r.label || ''} n=${(r.q && r.q.n) || r.n || ''}`.length));
  return `clamp(120px, ${Math.ceil(longest * 0.62) + 2}em, 45%)`;
}

// Log-scale range rows: rows [{label, q (quantiles), lo, hi}] drawn between `domain` (µm or any unit).
export function ranges(rows, { domain = [0.01, 10000], unit = 'µm', scale = 'log', step = 20 } = {}) {
  const log = scale === 'log';
  const f = v => (log ? Math.log10(Math.max(v, domain[0])) : Math.min(Math.max(v, domain[0]), domain[1]));
  const [d0, d1] = log ? domain.map(Math.log10) : domain;
  const x = v => +(100 * (f(v) - d0) / (d1 - d0)).toFixed(2);
  const ticks = [];
  if (log) for (let e = Math.ceil(d0); e <= d1; e++) ticks.push(10 ** e);
  else for (let t = domain[0]; t <= domain[1]; t += step) ticks.push(t);
  const axis = `<div class="range"><span></span><div class="ticks">${ticks.map(t =>
    `<span style="left:${x(t)}%">${tick(t)}</span>`).join('')}</div></div>`;
  const body = rows.map(r => {
    const q = r.q;
    if (!q) return `<div class="range"><span class="lab">${esc(r.label)}</span><span class="muted small">no data</span></div>`;
    return `<div class="range" title="${esc(r.label)}: median ${fmt(q.median)} ${unit}, IQR ${fmt(q.q1)}–${fmt(q.q3)}, range ${fmt(q.min)}–${fmt(q.max)}, n=${q.n}">
      <span class="lab">${esc(r.label)} <span class="muted">n=${q.n}</span></span>
      <svg viewBox="0 0 100 22" preserveAspectRatio="none">${ticks.map(t => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="0" y2="22"/>`).join('')}
        <line x1="${x(q.min)}" x2="${x(q.max)}" y1="11" y2="11" stroke="var(--bar2)" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <rect x="${x(q.q1)}" width="${Math.max(0.6, x(q.q3) - x(q.q1))}" y="5" height="12" rx="1" fill="var(--bar)" opacity=".85"/>
        <line x1="${x(q.median)}" x2="${x(q.median)}" y1="3" y2="19" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg></div>`;
  }).join('');
  return h(`<div style="--labw:${labelWidth(rows)}">${body}${axis}<p class="muted small">${log ? 'Log' : 'Linear'} scale (${unit}). Box = interquartile range, line = median, whisker = min–max.</p></div>`);
}

export function select(name, options, { value = '', blank = 'Any', multiple = false } = {}) {
  const opts = options.map(([v, t]) => `<option value="${esc(v)}"${[].concat(value).includes(v) ? ' selected' : ''}>${esc(t)}</option>`);
  return `<select name="${name}"${multiple ? ' multiple' : ''}>${multiple ? '' : `<option value="">${esc(blank)}</option>`}${opts.join('')}</select>`;
}

export function kpis(items) {
  return h(`<div class="kpis">${items.map(([v, t]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(t)}</span></div>`).join('')}</div>`);
}

// Measured-range rows on a log scale. rows: [{label, lo: quantiles of lower ends, hi: quantiles of upper ends, n}]
// Bar = median lower end → median upper end; whiskers = smallest lower end → largest upper end.
export function spanBars(rows, { domain = [0.01, 100000], unit = 'µm' } = {}) {
  const [d0, d1] = domain.map(Math.log10);
  const x = v => +(100 * (Math.log10(Math.min(Math.max(v, domain[0]), domain[1])) - d0) / (d1 - d0)).toFixed(2);
  const ticks = [];
  for (let e = Math.ceil(d0); e <= d1; e++) ticks.push(10 ** e);
  const body = rows.map(r => {
    if (!r.lo || !r.hi) return '';
    const a = Math.min(r.lo.median, r.hi.median), b = Math.max(r.lo.median, r.hi.median);
    return `<div class="range${r.ref ? ' clickable' : ''}"${r.ref ? ` data-ref="${esc(r.ref)}"` : ''} title="${esc(r.label)}: typical ${fmt(a)}–${fmt(b)} ${unit}; overall ${fmt(r.lo.min)}–${fmt(r.hi.max)} ${unit}; ${r.n} ranges">
      <span class="lab">${esc(r.label)} <span class="muted">n=${r.n}</span></span>
      <svg viewBox="0 0 100 22" preserveAspectRatio="none">${ticks.map(t => `<line class="grid" x1="${x(t)}" x2="${x(t)}" y1="0" y2="22"/>`).join('')}
        <line x1="${x(r.lo.min)}" x2="${x(r.hi.max)}" y1="11" y2="11" stroke="var(--bar2)" stroke-width="2" vector-effect="non-scaling-stroke"/>
        <rect x="${x(a)}" width="${Math.max(0.8, x(b) - x(a))}" y="5" height="12" rx="1.5" fill="var(--bar)" opacity=".9"/>
      </svg></div>`;
  }).join('');
  const axis = `<div class="range"><span></span><div class="ticks">${ticks.map(t =>
    `<span style="left:${x(t)}%">${tick(t)}</span>`).join('')}</div></div>`;
  return h(`<div style="--labw:${labelWidth(rows)}">${body || '<p class="muted small">No data for this selection.</p>'}${axis}
    <p class="muted small">Log scale (${unit}). Bar = typical range (median lower end to median upper end); line = smallest to largest reported.</p></div>`);
}
