// /account — the client's enquiries (with fields, consultants and the estimate) and profile, in the same
// workspace frame as /admin.
// Admins can open /account?as=<id> to see a member's account exactly as they do ("view as user", read-only).
import {
  ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, consultantList, dataTable, estimateBlock, flash, fmtCost, fmtDate, fmtDateTime, h, icon, keepFocus, kv,
  markSelected, mountShell, section, showPanel, signOut, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Your enquiries', profile: 'Profile' };
const STATUS_NOTES = {
  new: 'Received. Someone from the cnpt team will read it shortly.',
  in_review: 'The cnpt team is reading it and will reply by email.',
  replied: 'The cnpt team has replied by email. Check your inbox, and your spam folder just in case.',
  closed: 'This enquiry is closed. You can send a new one any time.'
};
const state = { enquiries: [], sort: { key: 'created_at', dir: -1 }, open: null, viewingAs: null };
let shell;

const COLUMNS = [
  { key: 'created_at', label: 'Sent', cls: 'c-date', sort: (e) => Date.parse(e.created_at),
    cell: (e) => h('time', { datetime: e.created_at, title: fmtDateTime(e.created_at) }, fmtDate(e.created_at)) },
  { key: 'stage', label: 'Stage', cls: 'c-stage', sort: (e) => FUNDING_STAGES.indexOf(e.stage), cell: (e) => h('span', { class: 'chip' }, e.stage) },
  { key: 'message', label: 'Message', cls: 'c-msg', cell: (e) => h('span', { class: 'clip' }, e.message) },
  { key: 'estimated_cost', label: 'Estimate', cls: 'c-cost', sort: (e) => e.estimated_cost ?? -1,
    cell: (e) => (e.estimated_cost != null ? h('span', { class: 'cost' }, fmtCost(e.estimated_cost)) : h('span', { class: 'sub' }, 'To be confirmed')) },
  { key: 'status', label: 'Status', cls: 'c-status', sort: (e) => ENQUIRY_STATUSES.indexOf(e.status),
    cell: (e) => badge(e.status, LABELS.enquiryStatus[e.status]) }
];

/* ---------- enquiries ---------- */

function renderEnquiries() {
  keepFocus($('enquiry-table'), () => $('enquiry-table').replaceChildren(dataTable({
    label: 'Your enquiries', columns: COLUMNS, rows: sortRows(state.enquiries, COLUMNS, state.sort), sort: state.sort, selected: state.open,
    onSort: (key) => { toggleSort(state.sort, key, key === 'stage' ? 1 : -1); renderEnquiries(); },
    onOpen: (e, replace) => go(`enquiries/${e.id}`, replace),
    empty: state.viewingAs ? 'No enquiries.' : ['You have not sent an enquiry yet. ', h('a', { href: '/onboarding' }, 'Tell us about your company'), '.']
  })));
}

function renderDetail() {
  const e = state.enquiries.find((x) => x.id === state.open);
  if (!e) return;
  const at = ENQUIRY_STATUSES.indexOf(e.status);
  $('detail').replaceChildren(
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-id' }, `Enquiry #${e.id}`),
      h('button', { class: 'icon-btn detail-close', type: 'button', 'aria-label': 'Close details', onclick: () => go('enquiries') }, icon('x'))),
    h('div', { class: 'detail-body' },
      h('div', {},
        h('h2', { class: 'detail-title' }, `${e.stage} enquiry`),
        h('p', { class: 'sub' }, `Sent ${fmtDateTime(e.created_at)}`)),
      section('Status',
        h('ol', { class: 'steps' }, ENQUIRY_STATUSES.map((s, i) => h('li', {
          class: i < at ? 'done' : i === at ? 'now' : null, 'aria-current': i === at ? 'step' : null
        }, LABELS.enquiryStatus[s]))),
        h('p', { class: 'hint' }, STATUS_NOTES[e.status])),
      section('Estimated cost', estimateBlock(e.estimated_cost, e.consultants)),
      section('Message', h('p', { class: 'msg' }, e.message)),
      e.tags.length && section('Fields', tagList(e.tags)),
      e.consultants.length && section(e.consultants.length > 1 ? 'Consultants' : 'Consultant', consultantList(e.consultants)),
      section('Details', kv([
        ['Stage', h('span', { class: 'chip' }, e.stage)],
        ['Sent', fmtDateTime(e.created_at)],
        ['Reference', `#${e.id}`]
      ]))));
}

/* ---------- profile ---------- */

function renderProfile(user) {
  $('profile').replaceChildren(
    h('div', { class: 'profile-top' }, avatar(user, true),
      h('div', { class: 'who-text' }, h('strong', {}, user.name || user.email), h('span', { class: 'sub' }, user.email))),
    kv([
      ['Signed in with', h('span', { class: 'provider' }, icon('google'), 'Google')],
      ['Member since', fmtDate(user.created_at)],
      ['Last sign-in', fmtDateTime(user.last_login)],
      user.role === 'admin' && !state.viewingAs && ['Access', 'Workspace admin · ', h('a', { href: '/admin' }, 'Open the workspace')]
    ]));
}

/* ---------- views ---------- */

// Same address-bar routing as /admin: #enquiries, #enquiries/<id>, #profile.
function go(hash, replace) {
  if (replace) {
    history.replaceState(null, '', `#${hash}`);
    route();
  } else {
    location.hash = hash;
  }
}

function route() {
  const [name, id] = location.hash.slice(1).split('/');
  const view = Object.hasOwn(VIEWS, name) ? name : 'enquiries';
  for (const v of Object.keys(VIEWS)) $(`view-${v}`).hidden = v !== view;
  shell.setView(view, VIEWS[view]);

  const previous = state.open;
  const wanted = view === 'enquiries' ? Number(id) : null;
  state.open = state.enquiries.some((e) => e.id === wanted) ? wanted : null;
  markSelected($('enquiry-table'), state.open);
  if (state.open) renderDetail();
  showPanel($('detail'), Boolean(state.open), previous && $('enquiry-table').querySelector(`tr[data-id="${previous}"]`));
}

// "View as user": a banner says whose account this is, and everything that would change it is hidden.
function viewAs(member) {
  const banner = $('as-banner');
  banner.replaceChildren(icon('eye'),
    h('p', {}, 'Viewing as ', h('strong', {}, member.name || member.email), ` (${member.email}). Read-only.`),
    h('a', { class: 'btn btn-line btn-xs', href: '/admin#members' }, 'Exit'));
  banner.hidden = false;
  for (const id of ['new-enquiry', 'signout-card', 'delete-card']) $(id).hidden = true;
  document.title = `${member.name || member.email} — viewing as — cnpt`;
}

/* ---------- start ---------- */

const me = await signedInUser(`/account${location.search}`);
if (me) {
  const asId = me.role === 'admin' ? new URLSearchParams(location.search).get('as') : null;
  if (!asId && location.search) history.replaceState(null, '', location.pathname + location.hash);
  state.viewingAs = asId;
  shell = mountShell(me, 'account', { query: asId ? `?as=${encodeURIComponent(asId)}` : '' });
  $('signout').addEventListener('click', signOut);
  $('delete').addEventListener('click', async () => {
    const ok = confirm('Delete your cnpt account? You will be signed out. Your enquiries stay with the cnpt team.');
    if (!ok) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      location.href = '/';
    } catch {
      flash('Your account could not be deleted. Please try again.', true);
    }
  });
  $('detail-scrim').addEventListener('click', () => go('enquiries'));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && state.open && !document.body.classList.contains('nav-open')) go('enquiries');
  });
  window.addEventListener('hashchange', route);
  if (!asId) renderProfile(me);
  route();
  try {
    const data = await api(asId ? `/api/account?as=${encodeURIComponent(asId)}` : '/api/account');
    // a new client finishes onboarding first
    if (!data.viewing_as && me.role !== 'admin' && !data.onboarding?.submitted_at) {
      location.replace('/onboarding');
    } else {
      if (data.viewing_as) viewAs(data.user);
      state.enquiries = data.enquiries;
      renderProfile(data.user);
      renderEnquiries();
      route();
    }
  } catch (err) {
    const text = err.status === 404 ? 'That member doesn’t exist.' : 'This account could not be loaded. Please refresh the page.';
    $('enquiry-table').replaceChildren(h('p', { class: 'loading' }, text));
  }
}
