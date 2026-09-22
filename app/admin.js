// /admin — the workspace: enquiries and members. The page only shows what the API allows;
// every change is checked again on the server (admin role, allowed values, owners locked).
import {
  ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, dataTable, flash, fmtDate, fmtDateTime, h, icon, keepFocus, kv, markSelected, mountShell,
  section, showPanel, signedInUser, sortRows, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Enquiries', members: 'Members' };
const state = {
  enquiries: [], users: [], me: null,
  filter: { status: '', stage: '', text: '' }, sort: { key: 'created_at', dir: -1 }, open: null,
  memberFilter: { role: '', text: '' }, memberSort: { key: 'created_at', dir: -1 }
};
let shell;

const ERRORS = {
  owner_locked: 'Owners are set in ADMIN_EMAILS and can’t be changed here.',
  cannot_demote_self: 'You can’t remove your own admin access.',
  admin_only: 'Your admin access was removed.',
  signin_required: 'Your session ended. Sign in again.'
};
const errorText = (err) => ERRORS[err.message] || 'That didn’t save. Please try again.';

const time = (iso) => h('time', { datetime: iso, title: fmtDateTime(iso) }, fmtDate(iso));
const matches = (needle, ...values) => !needle || values.some((v) => v && String(v).toLowerCase().includes(needle));

function segButtons(container, options, current, onPick) {
  keepFocus(container, () => container.replaceChildren(...options.map(([value, label, n]) => h('button', {
    class: 'seg-btn', type: 'button', 'aria-pressed': String(current === value), onclick: () => onPick(value)
  }, label, n != null && h('span', { class: 'n' }, n)))));
}

/* ---------- enquiries ---------- */

const ENQUIRY_COLUMNS = [
  { key: 'id', label: 'ID', cls: 'c-id', sort: (e) => e.id, cell: (e) => `#${e.id}` },
  { key: 'created_at', label: 'Received', cls: 'c-date', sort: (e) => Date.parse(e.created_at), cell: (e) => time(e.created_at) },
  { key: 'email', label: 'From', cls: 'c-primary', sort: (e) => e.email,
    cell: (e) => [h('strong', {}, e.email), h('span', { class: 'sub' }, e.client ? e.client.name || 'Member' : 'Guest')] },
  { key: 'stage', label: 'Stage', cls: 'c-stage', sort: (e) => FUNDING_STAGES.indexOf(e.stage), cell: (e) => h('span', { class: 'chip' }, e.stage) },
  { key: 'message', label: 'Message', cls: 'c-msg', cell: (e) => h('span', { class: 'clip' }, e.message) },
  { key: 'status', label: 'Status', cls: 'c-status', sort: (e) => ENQUIRY_STATUSES.indexOf(e.status),
    cell: (e) => badge(e.status, LABELS.enquiryStatus[e.status]) }
];

function visibleEnquiries() {
  const { status, stage, text } = state.filter;
  const needle = text.trim().toLowerCase();
  const rows = state.enquiries.filter((e) => (!status || e.status === status) && (!stage || e.stage === stage) &&
    matches(needle, e.email, e.message, e.client?.name, `#${e.id}`));
  return sortRows(rows, ENQUIRY_COLUMNS, state.sort);
}

function clearFilters() {
  Object.assign(state.filter, { status: '', stage: '', text: '' });
  $('f-stage').value = '';
  $('f-text').value = '';
  renderEnquiries();
}

function renderEnquiries() {
  const count = (s) => state.enquiries.filter((e) => e.status === s).length;
  segButtons($('f-status'),
    [['', 'All', state.enquiries.length], ...ENQUIRY_STATUSES.map((s) => [s, LABELS.enquiryStatus[s], count(s)])],
    state.filter.status, (value) => { state.filter.status = value; renderEnquiries(); });

  const rows = visibleEnquiries();
  const { status, stage, text } = state.filter;
  $('enquiries-meta').textContent = status || stage || text.trim() ? `${rows.length} of ${state.enquiries.length}` : `${rows.length} total`;
  keepFocus($('enquiry-table'), () => $('enquiry-table').replaceChildren(dataTable({
    label: 'Enquiries', columns: ENQUIRY_COLUMNS, rows, sort: state.sort, selected: state.open,
    onSort: (key) => { toggleSort(state.sort, key, key === 'email' || key === 'stage' ? 1 : -1); renderEnquiries(); },
    onOpen: (e, replace) => go(`enquiries/${e.id}`, replace),
    empty: state.enquiries.length
      ? ['No enquiries match these filters. ', h('button', { class: 'link', type: 'button', onclick: clearFilters }, 'Clear filters')]
      : 'No enquiries yet. They show up here as soon as someone sends the contact form.'
  })));
  shell.setCount('enquiries', count('new'));
}

function replyHref(e) {
  const quoted = e.message.split('\n').map((line) => `> ${line}`).join('\n');
  const body = `\n\n—\nOn ${fmtDateTime(e.created_at)}, you wrote:\n${quoted}`;
  return `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent('Re: your enquiry to cnpt')}&body=${encodeURIComponent(body)}`;
}

async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email);
    flash('Email copied');
  } catch {
    flash('Couldn’t copy. Select the address instead.', true);
  }
}

let saving = false;
async function setStatus(e, status) {
  if (saving || e.status === status) return;
  saving = true;
  for (const b of $('detail').querySelectorAll('.seg-btn')) b.disabled = true;
  try {
    const { enquiry } = await api('/api/admin/enquiries', { method: 'PATCH', body: { id: e.id, status } });
    Object.assign(e, enquiry);
    flash(`Marked as ${LABELS.enquiryStatus[e.status].toLowerCase()}`);
  } catch (err) {
    flash(errorText(err), true);
  } finally {
    saving = false;
    renderEnquiries();
    renderDetail();
    $('detail').querySelector(`[data-status="${e.status}"]`)?.focus();
  }
}

function renderDetail() {
  const e = state.enquiries.find((x) => x.id === state.open);
  if (!e) return;
  $('detail').replaceChildren(
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-id' }, `Enquiry #${e.id}`),
      h('button', { class: 'icon-btn detail-close', type: 'button', 'aria-label': 'Close details', onclick: () => go('enquiries') }, icon('x'))),
    h('div', { class: 'detail-body' },
      h('div', {},
        h('h2', { class: 'detail-title' }, e.email),
        h('p', { class: 'sub' }, e.client ? `Member · ${e.client.name || e.client.email}` : 'Guest · sent without an account'),
        h('div', { class: 'detail-actions' },
          h('a', { class: 'btn btn-white btn-sm', href: replyHref(e) }, icon('reply'), 'Reply by email'),
          h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => copyEmail(e.email) }, icon('copy'), 'Copy email'))),
      section('Status',
        h('div', { class: 'seg seg-full', role: 'group', 'aria-label': 'Status' }, ENQUIRY_STATUSES.map((s) => h('button', {
          class: 'seg-btn', type: 'button', 'data-status': s, 'aria-pressed': String(e.status === s), onclick: () => setStatus(e, s)
        }, LABELS.enquiryStatus[s]))),
        h('p', { class: 'hint' }, 'Senders with an account see this status on their account page.')),
      section('Message', h('p', { class: 'msg' }, e.message)),
      section('Details', kv([
        ['Stage', h('span', { class: 'chip' }, e.stage)],
        ['Received', fmtDateTime(e.created_at)],
        ['Updated', fmtDateTime(e.updated_at)],
        ['Account', e.client ? e.client.name || e.client.email : 'None'],
        ['ID', String(e.id)]
      ]))));
}

/* ---------- members ---------- */

const roleOf = (u) => (u.owner ? ['owner', 'Owner'] : u.role === 'admin' ? ['admin', 'Admin'] : ['user', 'Member']);
const ROLE_RANK = { owner: 0, admin: 1, user: 2 };
const enquiriesOf = (u) => state.enquiries.filter((e) => e.user_id === u.id).length;

async function setRole(u, role) {
  const who = u.name || u.email;
  const question = role === 'admin'
    ? `Give ${who} admin access? They will see every enquiry and member.`
    : `Remove admin access from ${who}?`;
  if (!confirm(question)) return;
  try {
    const { user } = await api('/api/admin/users', { method: 'PATCH', body: { id: u.id, role } });
    Object.assign(u, user);
    renderMembers();
    flash(role === 'admin' ? `${who} is now an admin` : `${who} is no longer an admin`);
  } catch (err) {
    flash(errorText(err), true);
  }
}

function memberAction(u) {
  if (u.owner) return h('span', { class: 'sub' }, 'ADMIN_EMAILS');
  if (u.id === state.me) return h('span', { class: 'sub' }, 'You');
  return h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: () => setRole(u, u.role === 'admin' ? 'user' : 'admin') },
    u.role === 'admin' ? 'Remove admin' : 'Make admin');
}

function enquiryCount(u) {
  const n = enquiriesOf(u);
  if (!n) return h('span', { class: 'sub' }, '0');
  // shows this member's enquiries in the Enquiries view
  return h('a', {
    class: 'num-link', href: '#enquiries', 'aria-label': `${n} ${n === 1 ? 'enquiry' : 'enquiries'} from ${u.email}`,
    onclick: () => { clearFilters(); state.filter.text = u.email; $('f-text').value = u.email; renderEnquiries(); }
  }, String(n));
}

const MEMBER_COLUMNS = [
  { key: 'name', label: 'Member', cls: 'c-primary', sort: (u) => (u.name || u.email).toLowerCase(),
    cell: (u) => h('span', { class: 'who' }, avatar(u),
      h('span', { class: 'who-text' }, h('strong', {}, u.name || u.email), h('span', { class: 'sub' }, u.email))) },
  { key: 'provider', label: 'Provider', cls: 'c-provider', cell: () => h('span', { class: 'provider' }, icon('google'), 'Google') },
  { key: 'role', label: 'Role', cls: 'c-role', sort: (u) => ROLE_RANK[roleOf(u)[0]], cell: (u) => badge(...roleOf(u)) },
  { key: 'enquiries', label: 'Enquiries', cls: 'c-num', sort: enquiriesOf, cell: enquiryCount },
  { key: 'created_at', label: 'Joined', cls: 'c-date', sort: (u) => Date.parse(u.created_at), cell: (u) => time(u.created_at) },
  { key: 'last_login', label: 'Last sign-in', cls: 'c-date', sort: (u) => Date.parse(u.last_login), cell: (u) => time(u.last_login) },
  { key: 'id', label: 'UID', cls: 'c-id', sort: (u) => u.id, cell: (u) => `#${u.id}` },
  { key: 'action', srLabel: 'Actions', cls: 'c-action', cell: memberAction }
];

function renderMembers() {
  const admins = state.users.filter((u) => u.role === 'admin').length;
  const { role, text } = state.memberFilter;
  segButtons($('f-role'),
    [['', 'All', state.users.length], ['admin', 'Admins', admins], ['user', 'Members', state.users.length - admins]],
    role, (value) => { state.memberFilter.role = value; renderMembers(); });

  const needle = text.trim().toLowerCase();
  const rows = sortRows(state.users.filter((u) => (!role || u.role === role) && matches(needle, u.name, u.email)),
    MEMBER_COLUMNS, state.memberSort);
  $('members-meta').textContent = role || needle ? `${rows.length} of ${state.users.length}` : `${rows.length} total`;
  keepFocus($('member-table'), () => $('member-table').replaceChildren(dataTable({
    label: 'Members', columns: MEMBER_COLUMNS, rows, sort: state.memberSort,
    onSort: (key) => { toggleSort(state.memberSort, key, key === 'name' || key === 'role' ? 1 : -1); renderMembers(); },
    empty: 'No members match this search.'
  })));
}

/* ---------- views ---------- */

// Changes the view through the address bar, so the back button and shared links work.
// `replace` is for moving between rows with the arrow keys, which shouldn't fill the history.
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

async function load() {
  const [e, u] = await Promise.all([api('/api/admin/enquiries'), api('/api/admin/users')]);
  Object.assign(state, { enquiries: e.enquiries, users: u.users, me: u.me });
  renderEnquiries();
  renderMembers();
  route();
}

function denied() {
  $('main').replaceChildren(h('section', { class: 'view' }, h('div', { class: 'view-head' }, h('div', {},
    h('h1', {}, 'Admins only'),
    h('p', { class: 'view-sub' }, 'This part of the workspace is for the cnpt team. ', h('a', { href: '/account' }, 'Go to your account'), '.')))));
  shell.setView('', 'Admins only');
}

/* ---------- start ---------- */

const me = await signedInUser('/admin');
if (me) {
  shell = mountShell(me, 'admin');
  if (me.role !== 'admin') {
    denied();
  } else {
    FUNDING_STAGES.forEach((s) => $('f-stage').append(h('option', { value: s }, s)));
    $('f-stage').addEventListener('change', () => { state.filter.stage = $('f-stage').value; renderEnquiries(); });
    $('f-text').addEventListener('input', () => { state.filter.text = $('f-text').value; renderEnquiries(); });
    $('m-text').addEventListener('input', () => { state.memberFilter.text = $('m-text').value; renderMembers(); });
    $('detail-scrim').addEventListener('click', () => go('enquiries'));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && state.open && !document.body.classList.contains('nav-open')) go('enquiries');
    });
    $('refresh').addEventListener('click', async () => {
      try {
        await load();
        flash('Up to date');
      } catch (err) {
        flash(errorText(err), true);
      }
    });
    window.addEventListener('hashchange', route);
    route();
    try {
      await load();
    } catch (err) {
      if (err.status === 403) denied();
      else $('enquiry-table').replaceChildren(h('p', { class: 'loading' }, 'The workspace data could not be loaded. Please refresh the page.'));
    }
  }
}
