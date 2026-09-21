// Shared helpers for the signed-in pages (/signin, /account, /admin).

export const LABELS = {
  enquiryStatus: { new: 'New', in_review: 'In review', replied: 'Replied', closed: 'Closed' },
  projectStage: { frame: 'Frame', concept: 'Concept', system: 'System', entry: 'Entry' },
  projectStatus: { active: 'Active', paused: 'Paused', complete: 'Complete' }
};
export const FUNDING_STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];
export const PROJECT_STAGES = ['frame', 'concept', 'system', 'entry'];
export const STAGE_ICONS = { frame: 'i-frame', concept: 'i-concept', system: 'i-system', entry: 'i-entry' };

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

export function icon(id) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

export function avatar(user, large) {
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  if (user.picture) return h('img', { class: cls, src: user.picture, alt: '', referrerpolicy: 'no-referrer' });
  return h('span', { class: cls, 'aria-hidden': 'true' }, (user.name || user.email || '?').trim().charAt(0).toUpperCase());
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
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

// Fills the right side of the nav: page links, the person, and Sign out.
export function renderNav(user, current) {
  const link = (href, label, page) => h('a', { href, 'aria-current': current === page ? 'page' : null }, label);
  document.getElementById('nav-right').replaceChildren(
    link('/account', 'Account', 'account'),
    user.role === 'admin' ? link('/admin', 'Admin', 'admin') : null,
    h('span', { class: 'nav-me' }, avatar(user), h('span', {}, user.name || user.email)),
    h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: signOut }, 'Sign out')
  );
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
