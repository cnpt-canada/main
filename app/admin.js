// /admin — the workspace: enquiries, onboarding and members. The page only shows what the API allows;
// every change is checked again on the server (admin role, allowed values, owners locked).
import {
  ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, consultantList, dataTable, firstNames, flash, fmtCost, fmtDate, fmtDateTime, focalBar, h, icon, keepFocus, kv,
  markSelected, mountShell, section, showPanel, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Enquiries', onboarding: 'Onboarding', members: 'Members' };
const state = {
  enquiries: [], users: [], onboarding: [], me: null,
  filter: { status: '', stage: '', text: '' }, sort: { key: 'created_at', dir: -1 }, open: null,
  onbFilter: { status: '', text: '' }, onbSort: { key: 'updated_at', dir: -1 }, onbOpen: null,
  memberFilter: { role: '', text: '' }, memberSort: { key: 'created_at', dir: -1 }
};
let shell;

const ERRORS = {
  owner_locked: 'Owners are set in ADMIN_EMAILS and can’t be changed here.',
  cannot_demote_self: 'You can’t remove your own admin access.',
  admin_only: 'Your admin access was removed.',
  signin_required: 'Your session ended. Sign in again.',
  invalid_cost: 'Enter the estimate as a whole number of dollars, up to 1,000,000.'
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
  { key: 'estimated_cost', label: 'Estimate', cls: 'c-cost', sort: (e) => e.estimated_cost ?? -1,
    cell: (e) => (e.estimated_cost != null ? h('span', { class: 'cost' }, fmtCost(e.estimated_cost)) : h('span', { class: 'sub' }, '—')) },
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
      section('Estimated cost', costEditor(e)),
      section('Message', h('p', { class: 'msg' }, e.message)),
      e.tags.length && section('Fields', tagList(e.tags)),
      section('Focal', e.focus ? focalBar(e.focus) : h('p', { class: 'sub' }, 'Not set.')),
      e.consultants.length && section(e.consultants.length > 1 ? 'Consultants' : 'Consultant', consultantList(e.consultants)),
      section('Details', kv([
        ['Stage', h('span', { class: 'chip' }, e.stage)],
        ['Received', fmtDateTime(e.created_at)],
        ['Updated', fmtDateTime(e.updated_at)],
        ['Account', e.client ? e.client.name || e.client.email : 'None'],
        ['ID', String(e.id)]
      ]))));
}

/* ---------- estimates ---------- */

async function saveCost(e, cost) {
  try {
    const { enquiry } = await api('/api/admin/enquiries', { method: 'PATCH', body: { id: e.id, estimated_cost: cost } });
    Object.assign(e, enquiry);
    flash(cost == null ? 'Estimate cleared' : `Estimate saved: ${fmtCost(cost)}`);
    renderEnquiries();
    renderDetail();
    $('cost-input')?.focus();
  } catch (err) {
    flash(errorText(err), true);
  }
}

function costEditor(e) {
  const input = h('input', { class: 'input input-cost', id: 'cost-input', type: 'number', inputmode: 'numeric', min: '0', max: '1000000', step: '50',
    placeholder: 'e.g. 2500', 'aria-describedby': 'cost-hint' });
  if (e.estimated_cost != null) input.value = String(e.estimated_cost);
  const form = h('form', { class: 'cost-form', novalidate: true },
    h('label', { class: 'cost-field' }, h('span', { class: 'cost-prefix', 'aria-hidden': 'true' }, '$'),
      h('span', { class: 'sr-only' }, 'Estimated cost in Canadian dollars'), input, h('span', { class: 'cost-suffix', 'aria-hidden': 'true' }, 'CAD')),
    h('button', { class: 'btn btn-white btn-sm', type: 'submit' }, 'Save'),
    e.estimated_cost != null && h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => saveCost(e, null) }, 'Clear'));
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const n = Number(input.value);
    if (input.value.trim() === '' || !Number.isInteger(n) || n < 0 || n > 1_000_000) return flash(ERRORS.invalid_cost, true);
    saveCost(e, n);
  });
  return [form, h('p', { class: 'hint', id: 'cost-hint' }, e.user_id
    ? (e.estimated_cost != null ? 'The client sees this on their enquiry.' : 'Until you save a value, the client sees “To be confirmed”.')
    : 'For your records: this enquiry has no account, so nobody else sees it.')];
}

/* ---------- onboarding (admin view of the first run through the enquiry flow) ---------- */

const doneOf = (o) => Boolean(o.submitted_at);
const ONB_STEPS = 5; // company, field, focal, consultants, confirm
const progressBadge = (o) => (doneOf(o) ? badge('replied', 'Completed') : badge('closed', `Step ${o.step} of ${ONB_STEPS}`));
const nameOf = (o) => (o.client ? o.client.name || o.client.email : `Member #${o.user_id}`);
const enquiriesFor = (o) => state.enquiries.filter((e) => e.user_id === o.user_id);
const draftText = (o, value) => (!doneOf(o) && value ? value : null);

function showEnquiriesOf(o) {
  clearFilters();
  if (o.client) { state.filter.text = o.client.email; $('f-text').value = o.client.email; }
  renderEnquiries();
}

const ONB_COLUMNS = [
  { key: 'name', label: 'Member', cls: 'c-primary', sort: (o) => nameOf(o).toLowerCase(),
    cell: (o) => h('span', { class: 'who' }, avatar(o.client || { email: '?' }),
      h('span', { class: 'who-text' }, h('strong', {}, nameOf(o)), h('span', { class: 'sub' }, o.client ? o.client.email : ''))) },
  { key: 'progress', label: 'Onboarding', cls: 'c-status', sort: (o) => (doneOf(o) ? ONB_STEPS + 1 : o.step), cell: progressBadge },
  { key: 'draft', label: 'Draft in progress', cls: 'c-tags',
    cell: (o) => h('span', { class: 'clip' }, [draftText(o, o.stage), ...(o.tags || []).map((t) => `#${t}`), o.consultants.length ? firstNames(o.consultants) : null].filter(Boolean).join('  ·  ') || '—') },
  { key: 'enquiries', label: 'Enquiries', cls: 'c-num', sort: (o) => enquiriesFor(o).length,
    cell: (o) => { const n = enquiriesFor(o).length; return n ? h('a', { class: 'num-link', href: '#enquiries', onclick: () => showEnquiriesOf(o), 'aria-label': `${n} enquiries from ${nameOf(o)}` }, String(n)) : h('span', { class: 'sub' }, '0'); } },
  { key: 'submitted_at', label: 'Completed', cls: 'c-date', sort: (o) => (o.submitted_at ? Date.parse(o.submitted_at) : 0), cell: (o) => (o.submitted_at ? time(o.submitted_at) : h('span', { class: 'sub' }, '—')) },
  { key: 'updated_at', label: 'Updated', cls: 'c-date', sort: (o) => Date.parse(o.updated_at), cell: (o) => time(o.updated_at) }
];

function renderOnboarding() {
  const done = state.onboarding.filter(doneOf).length;
  segButtons($('f-onb'),
    [['', 'All', state.onboarding.length], ['done', 'Completed', done], ['progress', 'In progress', state.onboarding.length - done]],
    state.onbFilter.status, (value) => { state.onbFilter.status = value; renderOnboarding(); });
  const { status, text } = state.onbFilter;
  const needle = text.trim().toLowerCase();
  const rows = sortRows(state.onboarding
    .filter((o) => (!status || (status === 'done') === doneOf(o)) && matches(needle, nameOf(o), o.client?.email, ...o.tags))
    .map((o) => ({ ...o, id: o.user_id })), ONB_COLUMNS, state.onbSort);
  $('onboarding-meta').textContent = status || needle ? `${rows.length} of ${state.onboarding.length}` : `${rows.length} total`;
  keepFocus($('onboarding-table'), () => $('onboarding-table').replaceChildren(dataTable({
    label: 'Onboarding', columns: ONB_COLUMNS, rows, sort: state.onbSort, selected: state.onbOpen,
    onSort: (key) => { toggleSort(state.onbSort, key, ['name', 'progress'].includes(key) ? 1 : -1); renderOnboarding(); },
    onOpen: (o, replace) => go(`onboarding/${o.user_id}`, replace),
    empty: state.onboarding.length ? 'Nothing matches these filters.' : 'No one has started yet. New clients go through it right after they sign up.'
  })));
}

function renderOnbDetail() {
  const o = state.onboarding.find((x) => x.user_id === state.onbOpen);
  if (!o) return;
  const theirs = enquiriesFor(o);
  const draft = !doneOf(o) || o.stage || o.brief || o.tags.length || o.focus || o.consultants.length;
  $('onb-detail').replaceChildren(
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-id' }, `Onboarding · UID #${o.user_id}`),
      h('button', { class: 'icon-btn detail-close', type: 'button', 'aria-label': 'Close details', onclick: () => go('onboarding') }, icon('x'))),
    h('div', { class: 'detail-body' },
      h('div', {},
        h('h2', { class: 'detail-title' }, nameOf(o)),
        h('p', { class: 'sub' }, o.client ? o.client.email : ''),
        h('div', { class: 'detail-actions' },
          h('a', { class: 'btn btn-white btn-sm', href: `/account?as=${o.user_id}#enquiries` }, icon('eye'), 'View as user'),
          theirs.length > 0 && h('a', { class: 'btn btn-line btn-sm', href: '#enquiries', onclick: () => showEnquiriesOf(o) }, `Their enquiries (${theirs.length})`))),
      section('Onboarding', progressBadge(o), h('p', { class: 'hint' }, doneOf(o)
        ? `Completed ${fmtDateTime(o.submitted_at)}. Fields, focal, consultants and the estimate live on each enquiry.`
        : `Stopped at step ${o.step} of ${ONB_STEPS}. Their answers so far are below.`)),
      draft && section(doneOf(o) ? 'Next enquiry, in progress' : 'Answers so far',
        o.stage ? h('span', { class: 'chip' }, o.stage) : null,
        h('p', { class: 'msg' }, o.brief || '—'),
        o.tags.length ? tagList(o.tags) : null,
        o.focus ? focalBar(o.focus) : null,
        o.consultants.length ? consultantList(o.consultants) : null),
      section('Details', kv([
        ['Started', fmtDateTime(o.created_at)],
        ['Updated', fmtDateTime(o.updated_at)],
        ['Completed', o.submitted_at ? fmtDateTime(o.submitted_at) : '—']
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
  if (u.id === state.me) return h('span', { class: 'sub' }, 'You');
  const viewAs = h('a', { class: 'btn btn-line btn-xs', href: `/account?as=${u.id}#project`, 'aria-label': `View as ${u.name || u.email}` },
    icon('eye'), 'View as');
  const role = u.owner
    ? h('span', { class: 'sub' }, 'ADMIN_EMAILS')
    : h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: () => setRole(u, u.role === 'admin' ? 'user' : 'admin') },
      u.role === 'admin' ? 'Remove admin' : 'Make admin');
  return h('span', { class: 'row-actions' }, viewAs, role);
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

  const prevOnb = state.onbOpen;
  const wantedOnb = view === 'onboarding' ? Number(id) : null;
  state.onbOpen = state.onboarding.some((o) => o.user_id === wantedOnb) ? wantedOnb : null;
  markSelected($('onboarding-table'), state.onbOpen);
  if (state.onbOpen) renderOnbDetail();
  showPanel($('onb-detail'), Boolean(state.onbOpen), prevOnb && $('onboarding-table').querySelector(`tr[data-id="${prevOnb}"]`));
}

async function load() {
  const [e, u, o] = await Promise.all([api('/api/admin/enquiries'), api('/api/admin/users'), api('/api/admin/onboarding')]);
  Object.assign(state, { enquiries: e.enquiries, users: u.users, onboarding: o.onboarding, me: u.me });
  renderEnquiries();
  renderOnboarding();
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
    $('o-text').addEventListener('input', () => { state.onbFilter.text = $('o-text').value; renderOnboarding(); });
    const closePanel = () => go(state.onbOpen ? 'onboarding' : 'enquiries');
    $('detail-scrim').addEventListener('click', closePanel);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && (state.open || state.onbOpen) && !document.body.classList.contains('nav-open')) closePanel();
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
