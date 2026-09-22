// /account — the client's enquiries and profile, in the same workspace frame as /admin.
import {
  ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, dataTable, flash, fmtDate, fmtDateTime, h, icon, keepFocus, kv, markSelected, mountShell,
  section, showPanel, signOut, signedInUser, sortRows, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Your enquiries', profile: 'Profile' };
const STATUS_NOTES = {
  new: 'Received. Someone from the cnpt team will read it shortly.',
  in_review: 'The cnpt team is reading it and will reply by email.',
  replied: 'The cnpt team has replied by email. Check your inbox, and your spam folder just in case.',
  closed: 'This enquiry is closed. You can send a new one any time.'
};
const state = { enquiries: [], sort: { key: 'created_at', dir: -1 }, open: null };
let shell;

const COLUMNS = [
  { key: 'created_at', label: 'Sent', cls: 'c-date', sort: (e) => Date.parse(e.created_at),
    cell: (e) => h('time', { datetime: e.created_at, title: fmtDateTime(e.created_at) }, fmtDate(e.created_at)) },
  { key: 'stage', label: 'Stage', cls: 'c-stage', sort: (e) => FUNDING_STAGES.indexOf(e.stage), cell: (e) => h('span', { class: 'chip' }, e.stage) },
  { key: 'message', label: 'Message', cls: 'c-msg', cell: (e) => h('span', { class: 'clip' }, e.message) },
  { key: 'status', label: 'Status', cls: 'c-status', sort: (e) => ENQUIRY_STATUSES.indexOf(e.status),
    cell: (e) => badge(e.status, LABELS.enquiryStatus[e.status]) }
];

function renderEnquiries() {
  keepFocus($('enquiry-table'), () => $('enquiry-table').replaceChildren(dataTable({
    label: 'Your enquiries', columns: COLUMNS, rows: sortRows(state.enquiries, COLUMNS, state.sort), sort: state.sort, selected: state.open,
    onSort: (key) => { toggleSort(state.sort, key, key === 'stage' ? 1 : -1); renderEnquiries(); },
    onOpen: (e, replace) => go(`enquiries/${e.id}`, replace),
    empty: ['You have not sent an enquiry yet. ', h('a', { href: '/#contact' }, 'Tell us about your company'), '.']
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
      section('Message', h('p', { class: 'msg' }, e.message)),
      section('Details', kv([
        ['Stage', h('span', { class: 'chip' }, e.stage)],
        ['Sent', fmtDateTime(e.created_at)],
        ['Reference', `#${e.id}`]
      ]))));
}

function renderProfile(user) {
  $('profile').replaceChildren(
    h('div', { class: 'profile-top' }, avatar(user, true),
      h('div', { class: 'who-text' }, h('strong', {}, user.name || user.email), h('span', { class: 'sub' }, user.email))),
    kv([
      ['Signed in with', h('span', { class: 'provider' }, icon('google'), 'Google')],
      ['Member since', fmtDate(user.created_at)],
      ['Last sign-in', fmtDateTime(user.last_login)],
      user.role === 'admin' && ['Access', 'Workspace admin · ', h('a', { href: '/admin' }, 'Open the workspace')]
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

/* ---------- start ---------- */

const user = await signedInUser('/account');
if (user) {
  shell = mountShell(user, 'account');
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
  renderProfile(user);
  route();
  try {
    const data = await api('/api/account');
    state.enquiries = data.enquiries;
    renderProfile(data.user);
    renderEnquiries();
    route();
  } catch {
    $('enquiry-table').replaceChildren(h('p', { class: 'loading' }, 'Your enquiries could not be loaded. Please refresh the page.'));
  }
}
