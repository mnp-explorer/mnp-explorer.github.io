// Reference popover: opened by clicking a chart element. Shows a summary line and every
// study behind the element with its value. Disabled on small screens, where the charts
// alone show the general trends.
import { esc } from './ui.js';

export const smallScreen = () => matchMedia('(max-width: 760px)').matches;

let current = null;

export function closePopover() {
  if (current) current.remove();
  current = null;
}

// spec: { title, summary, note, valueHead?, col4?, rows: [{ id, study, matrix, value, attribution }] }
// col4 renames the last column (default 'Attribution'); its values are shown as tags.
export function showPopover(anchor, spec, onStudy) {
  closePopover();
  const hasAttr = spec.rows.some(r => r.attribution);
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', spec.title);
  pop.innerHTML = `
    <button class="pop-close" aria-label="Close">×</button>
    <h4>${esc(spec.title)}</h4>
    ${spec.summary ? `<p class="pop-sum">${spec.summary}</p>` : ''}
    <div class="pop-body"><table>
      <thead><tr><th>Study</th><th>Matrix</th><th>${esc(spec.valueHead || 'Value')}</th>${hasAttr ? `<th>${esc(spec.col4 || 'Attribution')}</th>` : ''}</tr></thead>
      <tbody>${spec.rows.map(r => `<tr>
        <td><a href="#" data-study="${esc(r.id)}">${esc(r.study)}</a></td>
        <td>${esc(r.matrix)}</td><td>${esc(r.value)}</td>
        ${hasAttr ? `<td><span class="attr ${esc(r.attribution)}">${esc(r.attribution)}</span></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
    ${spec.note ? `<p class="pop-note">${spec.note}</p>` : ''}`;
  document.body.append(pop);
  current = pop;

  // place next to the anchor, inside the viewport
  const a = anchor.getBoundingClientRect(), p = pop.getBoundingClientRect();
  const gap = 8, vw = innerWidth, vh = innerHeight;
  let top = a.bottom + gap;
  if (top + p.height > vh - gap && a.top - gap - p.height > gap) top = a.top - gap - p.height;
  top = Math.max(gap, Math.min(top, vh - p.height - gap));
  const left = Math.max(gap, Math.min(a.left, vw - p.width - gap));
  Object.assign(pop.style, { top: `${top}px`, left: `${left}px` });

  pop.querySelector('.pop-close').addEventListener('click', closePopover);
  pop.querySelectorAll('[data-study]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    closePopover();
    onStudy(el.dataset.study);
  }));
  pop.addEventListener('click', e => e.stopPropagation());
  pop.querySelector('.pop-close').focus({ preventScroll: true });
}

document.addEventListener('click', closePopover);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePopover(); });
addEventListener('resize', closePopover);
addEventListener('scroll', closePopover, { passive: true });
addEventListener('hashchange', closePopover);
