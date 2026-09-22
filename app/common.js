// Shared helpers for the signed-in pages (/signin, /account, /admin).

export const LABELS = {
  enquiryStatus: { new: 'New', in_review: 'In review', replied: 'Replied', closed: 'Closed' }
};
export const ENQUIRY_STATUSES = Object.keys(LABELS.enquiryStatus);
export const FUNDING_STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];

// Consultants a client can pick during onboarding. Keys match CONSULTANTS in api/_lib/rules.js.
export const CONSULTANTS = {
  michael: { name: 'Michael (Joongmin) Park', role: 'Consultant', photo: '/cnptmichaelpark-web.jpg' },
  brandon: { name: 'Brandon Siow', role: 'Consultant', photo: '/cnptbrandonsiow-web.jpg' },
  kenny: { name: 'Kenny', role: 'Consultant', photo: null }
};

// Suggested field tags for onboarding; clients can add their own (5 at most in total).
export const FIELD_TAGS = ['AI', 'Physical device', 'Tech', 'Medical', 'Finance', 'Health', 'Climate', 'Energy', 'Mobility',
  'Robotics', 'Education', 'Commerce', 'Consumer', 'Enterprise SaaS', 'Logistics', 'Food', 'Real estate', 'Media', 'Gaming', 'Security'];
export const MAX_TAGS = 5;
export const MAX_TAG = 24;

// Calls one of our API routes and returns its JSON; throws with `status` and `message` (the error code) on failure.
export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // empty or non-JSON body
  }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Builds DOM elements. Children given as strings become text nodes, never HTML,
// so names, emails and messages people typed can't inject markup.
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value)); // attributes, so form.reset() returns to them
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// An icon from /app/icons.svg.
export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'ic');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/app/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

export function avatar(user, large) {
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  if (user.picture) return h('img', { class: cls, src: user.picture, alt: '', referrerpolicy: 'no-referrer' });
  return h('span', { class: cls, 'aria-hidden': 'true' }, (user.name || user.email || '?').trim().charAt(0).toUpperCase());
}

// A consultant's photo, or their initial when there's no photo yet.
export function consultantAvatar(key, large) {
  const c = CONSULTANTS[key];
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  if (!c) return h('span', { class: cls, 'aria-hidden': 'true' }, '?');
  if (c.photo) return h('img', { class: `${cls} avatar-photo`, src: c.photo, alt: '' });
  return h('span', { class: cls, 'aria-hidden': 'true' }, c.name.charAt(0));
}

// Estimates are whole Canadian dollars: "$25,000 CAD".
export function fmtCost(n) {
  return `$${new Intl.NumberFormat('en-CA', { maximumFractionDigits: 0 }).format(n)} CAD`;
}

// "Michael", "Michael and Kenny", "Michael, Brandon and Kenny"
export function firstNames(keys) {
  const names = keys.filter((k) => CONSULTANTS[k]).map((k) => CONSULTANTS[k].name.split(' ')[0]);
  return new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(names);
}

// The estimate: the amount once an admin has set it; until then it loads for a moment and then says
// it will be confirmed later.
export function estimateBlock(cost, consultants) {
  const who = consultants?.length ? firstNames(consultants) : 'your consultant';
  if (cost != null) {
    return h('div', { class: 'estimate' }, h('p', { class: 'estimate-value' }, fmtCost(cost)),
      h('p', { class: 'sub' }, `Confirmed by ${who}. We’ll walk you through it on your first call.`));
  }
  const el = h('div', { class: 'estimate', role: 'status' },
    h('span', { class: 'shimmer', 'aria-label': 'Loading the estimate' }), h('p', { class: 'sub' }, 'Estimating…'));
  setTimeout(() => el.replaceChildren(
    h('p', { class: 'estimate-tbc' }, 'To be confirmed'),
    h('p', { class: 'sub' }, `We’ll confirm your estimate once ${who} ${consultants?.length > 1 ? 'have' : 'has'} read your brief.`)), 1600);
  return el;
}

// Field hashtags, read-only.
export function tagList(tags) {
  return h('div', { class: 'tag-list' }, tags.map((t) => h('span', { class: 'tag-chip tag-static' }, h('span', { class: 'tag-hash' }, '#'), t)));
}

// Consultants picked for an enquiry: photo, name, role.
export function consultantList(keys, large) {
  return h('div', { class: 'who-list' }, keys.filter((k) => CONSULTANTS[k]).map((k) => h('div', { class: large ? 'who who-lg' : 'who' },
    consultantAvatar(k, large), h('span', { class: 'who-text' }, h('strong', {}, CONSULTANTS[k].name), h('span', { class: 'sub' }, CONSULTANTS[k].role)))));
}

// Focal: how a client splits the work across four areas, in tens that add up to 100.
// Order and keys match FOCUS_AREAS in api/_lib/rules.js; the enquiry stores the four numbers in this order.
export const FOCAL = [
  { key: 'research', label: 'Research', note: 'Users, market and competitors' },
  { key: 'branding', label: 'Branding', note: 'Identity, voice and how you look' },
  { key: 'product', label: 'Product Developing', note: 'The product itself, from concept to build' },
  { key: 'advertising', label: 'Advertising', note: 'Launch, campaigns and reaching people' }
];
export const FOCAL_STEP = 10;
export const DEFAULT_FOCUS = [30, 20, 30, 20];

// The focal bar: four blocks whose widths are the split, with a legend. Given `onChange`, the three edges
// between the blocks can be dragged, or moved with the arrow keys, in steps of 10; onChange(values, done) runs
// at every step, with done = true once a drag or key press is finished (the moment to save).
// `detailed` adds a line under each area in the legend.
export function focalBar(values, { onChange, detailed = false } = {}) {
  let v = [...values];
  const editable = typeof onChange === 'function';
  const segs = FOCAL.map((a, i) => h('div', { class: `focal-seg focal-${i}` }, h('span', { class: 'focal-pct' })));
  const track = h('div', { class: 'focal-track', 'aria-hidden': 'true' }, segs);
  const bar = h('div', { class: 'focal-bar' }, track);
  const items = FOCAL.map((a, i) => h('li', {},
    h('span', { class: `focal-dot focal-${i}`, 'aria-hidden': 'true' }),
    h('span', { class: 'focal-name' }, a.label),
    h('strong', { class: 'focal-val' }),
    detailed ? h('span', { class: 'focal-note' }, a.note) : null));
  const root = h('div', { class: editable ? 'focal focal-edit' : 'focal' }, bar,
    h('ul', { class: detailed ? 'focal-legend focal-legend-detailed' : 'focal-legend', 'aria-label': 'Focal' }, items));

  const edges = () => [v[0], v[0] + v[1], v[0] + v[1] + v[2]];
  const range = (i, b = edges()) => [i ? b[i - 1] : 0, i < 2 ? b[i + 1] : 100];
  const handles = editable ? [0, 1, 2].map((i) => {
    const el = h('span', { class: 'focal-handle', role: 'slider', tabindex: '0',
      'aria-label': `Edge between ${FOCAL[i].label} and ${FOCAL[i + 1].label}` });
    el.addEventListener('keydown', (ev) => {
      const b = edges()[i];
      const step = { ArrowLeft: -1, ArrowDown: -1, PageDown: -1, ArrowRight: 1, ArrowUp: 1, PageUp: 1 }[ev.key];
      const to = step ? b + step * FOCAL_STEP : ev.key === 'Home' ? 0 : ev.key === 'End' ? 100 : null;
      if (to == null) return;
      ev.preventDefault();
      if (moveEdge(i, to)) onChange([...v], true);
    });
    el.addEventListener('pointerdown', (ev) => drag(ev, i));
    bar.append(el);
    return el;
  }) : [];

  // Moves edge i to `to` (snapped to 10, kept between its neighbours). Returns whether anything changed.
  function moveEdge(i, to) {
    const b = edges();
    const [lo, hi] = range(i, b);
    const next = Math.min(hi, Math.max(lo, Math.round(to / FOCAL_STEP) * FOCAL_STEP));
    if (next === b[i]) return false;
    b[i] = next;
    v = [b[0], b[1] - b[0], b[2] - b[1], 100 - b[2]];
    render();
    onChange([...v], false);
    return true;
  }

  function drag(ev, i) {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const el = handles[i];
    el.setPointerCapture(ev.pointerId);
    root.classList.add('is-dragging');
    const rect = bar.getBoundingClientRect();
    // edges on the same spot (an area at 0%): the direction of the drag decides which one moves
    const start = edges()[i];
    const stacked = [0, 1, 2].filter((j) => edges()[j] === start);
    let edge = stacked.length === 1 ? i : null;
    let moved = false;
    const move = (e) => {
      const at = ((e.clientX - rect.left) / rect.width) * 100;
      if (edge == null) {
        if (Math.abs(at - start) < FOCAL_STEP / 2) return;
        edge = at < start ? Math.min(...stacked) : Math.max(...stacked);
      }
      if (moveEdge(edge, at)) moved = true;
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      root.classList.remove('is-dragging');
      handles[edge ?? i].focus({ preventScroll: true });
      if (moved) onChange([...v], true);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function render() {
    const b = edges();
    segs.forEach((s, i) => {
      s.style.flexBasis = `${v[i]}%`;
      s.hidden = v[i] === 0;
      s.firstChild.textContent = `${v[i]}%`;
    });
    items.forEach((li, i) => {
      li.querySelector('.focal-val').textContent = `${v[i]}%`;
      li.classList.toggle('is-zero', v[i] === 0);
    });
    handles.forEach((el, i) => {
      const [lo, hi] = range(i, b);
      el.style.left = `${b[i]}%`;
      el.setAttribute('aria-valuemin', String(lo));
      el.setAttribute('aria-valuemax', String(hi));
      el.setAttribute('aria-valuenow', String(b[i]));
      el.setAttribute('aria-valuetext', `${FOCAL[i].label} ${v[i]}%, ${FOCAL[i + 1].label} ${v[i + 1]}%`);
    });
  }
  render();
  return root;
}

export function badge(kind, label) {
  return h('span', { class: `badge badge-${kind}` }, label);
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

export function fmtDateTime(iso) {
  return iso ? new Date(iso).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

// Same rule as the server: a path on this site, never another site.
export function safeNext(value, fallback) {
  return typeof value === 'string' && /^\/(?![/\\])[^\s]*$/.test(value) ? value : fallback;
}

// Returns the signed-in user, or sends the browser to /signin (coming back to `next` afterwards).
export async function signedInUser(next) {
  let user = null;
  try {
    ({ user } = await api('/api/auth/me'));
  } catch {
    // treated as signed out
  }
  if (!user) location.replace(`/signin?next=${encodeURIComponent(next)}`);
  return user;
}

export async function signOut() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    location.href = '/';
  }
}

/* ---------- console shell ---------- */

// Fills the frame both signed-in pages share: the left navigation, the person at the bottom,
// and the menu button that opens the navigation on smaller screens.
// Views are addressed by hash (/admin#members, /account#profile), so links and the back button just work.
// `query` keeps "view as user" (?as=<id>) on the account links while an admin is looking at someone's account.
export function mountShell(user, page, { query = '' } = {}) {
  const item = (href, key, label, iconName) => h('a', { class: 'nav-item', href, 'data-key': key },
    icon(iconName), h('span', { class: 'nav-label' }, label), h('span', { class: 'nav-count', 'data-count': key }));
  const group = (label, ...items) => h('div', { class: 'nav-group' }, h('p', { class: 'nav-group-label' }, label), items);

  document.getElementById('side-nav').replaceChildren(...[
    user.role === 'admin' && group('Workspace',
      item('/admin#enquiries', 'admin:enquiries', 'Enquiries', 'inbox'),
      item('/admin#onboarding', 'admin:onboarding', 'Onboarding', 'list-checks'),
      item('/admin#members', 'admin:members', 'Members', 'users')),
    group('Account',
      item(`/account${query}#enquiries`, 'account:enquiries', 'Your enquiries', 'message'),
      item(`/account${query}#profile`, 'account:profile', 'Profile', 'user')),
    h('div', { class: 'nav-group' },
      h('a', { class: 'nav-item', href: '/onboarding' }, icon('plus'), h('span', { class: 'nav-label' }, 'New enquiry')),
      h('a', { class: 'nav-item', href: '/' }, icon('external'), h('span', { class: 'nav-label' }, 'cnpt.ca')))
  ].filter(Boolean));

  document.getElementById('side-foot').replaceChildren(
    h('div', { class: 'me' }, avatar(user),
      h('div', { class: 'me-text' }, h('strong', {}, user.name || user.email), h('span', {}, user.email))),
    h('button', { class: 'icon-btn', type: 'button', title: 'Sign out', 'aria-label': 'Sign out', onclick: signOut }, icon('logout')));

  // navigation drawer on smaller screens
  const menu = document.getElementById('menu');
  const setOpen = (open) => {
    document.body.classList.toggle('nav-open', open);
    menu.setAttribute('aria-expanded', String(open));
    if (open) document.querySelector('.side .nav-item')?.focus();
  };
  menu.addEventListener('click', () => setOpen(true));
  document.getElementById('side-close').addEventListener('click', () => { setOpen(false); menu.focus(); });
  document.getElementById('nav-scrim').addEventListener('click', () => setOpen(false));
  document.getElementById('side').addEventListener('click', (ev) => { if (ev.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && document.body.classList.contains('nav-open')) { setOpen(false); menu.focus(); }
  });

  return {
    // marks the current view in the navigation and the breadcrumb
    setView(view, title) {
      for (const a of document.querySelectorAll('.side .nav-item[data-key]')) {
        if (a.dataset.key === `${page}:${view}`) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      }
      document.getElementById('crumb-view').textContent = title;
      document.title = `${title} — cnpt`;
    },
    // the small number next to a navigation item (empty hides it)
    setCount(view, n) {
      const el = document.querySelector(`[data-count="${page}:${view}"]`);
      if (el) el.textContent = n ? String(n) : '';
    }
  };
}

/* ---------- data tables ---------- */

// Sorts a copy of `rows` by the column named in `sort` ({ key, dir: 1 | -1 }).
export function sortRows(rows, columns, sort) {
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.sort) return rows;
  return [...rows].sort((a, b) => {
    const x = col.sort(a);
    const y = col.sort(b);
    const d = typeof x === 'string' && typeof y === 'string' ? x.localeCompare(y) : (x > y) - (x < y);
    return d * sort.dir || b.id - a.id;
  });
}

// Clicking a sorted column flips it; clicking another sorts by it, newest/largest first for dates and counts.
export function toggleSort(sort, key, firstDir = -1) {
  if (sort.key === key) sort.dir = -sort.dir;
  else Object.assign(sort, { key, dir: firstDir });
}

// A table with sortable headers. columns: [{ key, label, cls, sort?: row → value, cell: row → content }].
// With `onOpen`, rows open on click or Enter, and ↑/↓ move between them (opening the next one while the
// details panel is showing).
export function dataTable({ label, columns, rows, sort, onSort, onOpen, selected, empty }) {
  const head = h('tr', {}, columns.map((c) => {
    const text = c.label || h('span', { class: 'sr-only' }, c.srLabel || c.key);
    if (!c.sort) return h('th', { scope: 'col', class: c.cls }, text);
    const on = sort.key === c.key;
    return h('th', { scope: 'col', class: c.cls, 'aria-sort': on ? (sort.dir === 1 ? 'ascending' : 'descending') : null },
      h('button', { class: 'th-sort', type: 'button', onclick: () => onSort(c.key) }, text, icon(on && sort.dir === 1 ? 'arrow-up' : 'arrow-down')));
  }));

  const body = rows.length
    ? rows.map((row) => {
      const tr = h('tr', { 'data-id': row.id, 'aria-current': row.id === selected ? 'true' : null },
        columns.map((c) => h('td', { class: c.cls }, c.cell(row))));
      if (onOpen) {
        tr.tabIndex = 0;
        tr.classList.add('clickable');
        tr.addEventListener('click', (ev) => { if (!ev.target.closest('a, button, select, input')) onOpen(row); });
        tr.addEventListener('keydown', (ev) => {
          if (ev.target !== tr) return;
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onOpen(row); }
          const next = ev.key === 'ArrowDown' ? tr.nextElementSibling : ev.key === 'ArrowUp' ? tr.previousElementSibling : null;
          if (next) {
            ev.preventDefault();
            next.focus();
            if (tr.parentElement.querySelector('tr[aria-current]')) onOpen(rows.find((r) => String(r.id) === next.dataset.id), true);
          }
        });
      }
      return tr;
    })
    : [h('tr', {}, h('td', { class: 'empty-cell', colspan: columns.length }, empty))];

  return h('table', { class: 'grid', 'aria-label': label }, h('thead', {}, head), h('tbody', {}, body));
}

// Re-renders part of the page without losing keyboard focus: it goes back to the same row
// (or the button in it), or to the filter or column that was just picked.
export function keepFocus(container, render) {
  const active = container.contains(document.activeElement) ? document.activeElement : null;
  const rowId = active?.closest('tr[data-id]')?.dataset.id;
  render();
  if (!active) return;
  const row = rowId && container.querySelector(`tr[data-id="${rowId}"]`);
  const target = row ? (row.tabIndex >= 0 ? row : row.querySelector('button, a'))
    : container.querySelector('[aria-pressed="true"], th[aria-sort] .th-sort');
  target?.focus();
}

// Highlights the open row without rebuilding the table (so keyboard focus stays put).
export function markSelected(container, id) {
  for (const tr of container.querySelectorAll('tbody tr[data-id]')) {
    if (tr.dataset.id === String(id)) tr.setAttribute('aria-current', 'true');
    else tr.removeAttribute('aria-current');
  }
}

// A details panel section: small heading, then content.
export function section(title, ...content) {
  return h('section', { class: 'detail-section' }, h('h3', {}, title), content);
}

// Label/value pairs for a details panel or a card.
export function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, ...v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v))));
}

// Shows or hides a details panel. On narrower screens it slides over the table with a scrim,
// so focus moves into it, and back to `returnTo` (the row) when it closes.
export function showPanel(panel, open, returnTo) {
  const scrim = document.getElementById('detail-scrim');
  const overlay = matchMedia('(max-width: 1279px)').matches;
  const wasOpen = !panel.hidden;
  if (!open && wasOpen && panel.contains(document.activeElement)) returnTo?.focus();
  panel.hidden = !open;
  panel.closest('.split').classList.toggle('has-detail', open);
  // the scrim is shared by every panel on the page, so only the panel that opens or closes touches it
  if (open || wasOpen) {
    scrim.hidden = !open;
    document.body.classList.toggle('detail-open', open);
  }
  if (overlay && open && !wasOpen) panel.querySelector('.detail-close')?.focus();
}

let flashTimer;
export function flash(text, isError) {
  let el = document.querySelector('.flash');
  if (!el) {
    el = h('div', { class: 'flash', role: 'status' });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.toggle('error', Boolean(isError));
  el.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.classList.remove('show'), 2600);
}
