// /admin — the workspace: enquiries, onboarding and members. The page only shows what the API allows;
// every change is checked again on the server (admin role, allowed values, owners locked).
import { commentThread, processThumbnail, readImage, slotText, STAGES, stageIndex } from '/app/project.js';
import {
  ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, consultantList, dataTable, firstNames, flash, fmtCost, fmtDate, fmtDateTime, focalBar, h, icon, keepFocus, kv,
  markSelected, mountShell, section, showPanel, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Enquiries', onboarding: 'Onboarding', process: 'Process', meetings: 'Meetings', members: 'Members' };
const state = {
  enquiries: [], users: [], onboarding: [], process: [], meetings: [], comments: [], me: null,
  processFilter: { stage: '', text: '' }, processSort: { key: 'updated_at', dir: -1 }, processOpen: null, meetFilter: { status: '' },
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
  invalid_cost: 'Enter the estimate as a whole number of dollars, up to 1,000,000.',
  image_too_big: 'That picture is too large. Pick one under 3MB.',
  invalid_type: 'Pictures only: JPEG, PNG or WebP.',
  slot_taken: 'That time is already taken.'
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

// "View as" used to sit here too, on every row. It lives with the admin's own profile now
// (/account#profile), which leaves this column for the one thing that changes a member.
function memberAction(u) {
  if (u.id === state.me) return h('span', { class: 'sub' }, 'You');
  const role = u.owner
    ? h('span', { class: 'sub' }, 'ADMIN_EMAILS')
    : h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: () => setRole(u, u.role === 'admin' ? 'user' : 'admin') },
      u.role === 'admin' ? 'Remove admin' : 'Make admin');
  return h('span', { class: 'row-actions' }, role);
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

/* ---------- process: where each client's work is ---------- */

const clientName = (row) => (row.client ? row.client.name || row.client.email : `Member #${row.user_id}`);

const PROCESS_COLUMNS = [
  { key: 'name', label: 'Client', cls: 'c-primary', sort: (p) => clientName(p).toLowerCase(),
    cell: (p) => h('span', { class: 'who' }, avatar(p.client || { email: '?' }),
      h('span', { class: 'who-text' }, h('strong', {}, clientName(p)), h('span', { class: 'sub' }, p.client?.email || ''))) },
  { key: 'stage', label: 'Stage', cls: 'c-stage', sort: (p) => stageIndex(p.stage),
    cell: (p) => h('span', { class: 'chip' }, STAGES[stageIndex(p.stage)].label) },
  { key: 'headline', label: 'What is happening', cls: 'c-msg',
    cell: (p) => h('span', { class: 'clip' }, p.headline || '—') },
  { key: 'picture', label: 'Picture', cls: 'c-num', cell: (p) => (p.image_url ? icon('check') : h('span', { class: 'sub' }, '—')) },
  { key: 'updated_at', label: 'Updated', cls: 'c-date', sort: (p) => Date.parse(p.updated_at), cell: (p) => time(p.updated_at) }
];

function renderProcess() {
  const rows = state.process.filter((p) => (!state.processFilter.stage || p.stage === state.processFilter.stage)
    && matches(state.processFilter.text.trim().toLowerCase(), clientName(p), p.client?.email, p.headline));
  segButtons($('f-stage-p'), [['', 'All', state.process.length],
    ...STAGES.map((s) => [s.key, s.label, state.process.filter((p) => p.stage === s.key).length])],
  state.processFilter.stage, (value) => { state.processFilter.stage = value; renderProcess(); });
  $('process-meta').textContent = `${rows.length} of ${state.process.length}`;
  keepFocus($('process-table'), () => $('process-table').replaceChildren(dataTable({
    label: 'Process', columns: PROCESS_COLUMNS, rows: sortRows(rows, PROCESS_COLUMNS, state.processSort).map((p) => ({ ...p, id: p.user_id })),
    sort: state.processSort, selected: state.processOpen,
    onSort: (key) => { toggleSort(state.processSort, key, ['name', 'stage'].includes(key) ? 1 : -1); renderProcess(); },
    onOpen: (p, replace) => go(`process/${p.user_id}`, replace),
    empty: state.process.length ? 'Nothing matches this search.' : 'No client has been started yet. Open one from a client below.'
  })));
}

async function saveProcess(p, body, { quiet } = {}) {
  try {
    const saved = await api('/api/admin/process', { method: body.data !== undefined ? 'PUT' : 'PATCH', body: { user_id: p.user_id, ...body } });
    Object.assign(p, saved.process, { image_url: saved.image_url, client: p.client });
    renderProcess();
    renderProcessDetail();
    if (!quiet) flash('Saved');
  } catch (err) {
    flash(errorText(err), true);
  }
}

function renderProcessDetail() {
  const p = state.process.find((x) => x.user_id === state.processOpen);
  if (!p) return;
  const headline = h('input', { class: 'input', id: 'headline-input', type: 'text', maxlength: '120', value: p.headline || '',
    placeholder: 'e.g. Two directions for the dispatcher dashboard' });
  const picture = h('input', { class: 'sr-only', id: 'picture-input', type: 'file', accept: 'image/jpeg,image/png,image/webp' });
  picture.addEventListener('change', async () => {
    const file = picture.files?.[0];
    if (!file) return;
    try {
      flash('Preparing the picture…');
      const { type, data } = await readImage(file);
      await saveProcess(p, { type, data });
      flash('Picture saved');
    } catch {
      flash('That picture could not be read. Try a JPEG, PNG or WebP.', true);
    }
    picture.value = '';
  });

  $('process-detail').replaceChildren(
    h('div', { class: 'detail-head' },
      h('span', { class: 'detail-id' }, `Process · UID #${p.user_id}`),
      h('button', { class: 'icon-btn detail-close', type: 'button', 'aria-label': 'Close details', onclick: () => go('process') }, icon('x'))),
    h('div', { class: 'detail-body' },
      h('div', {},
        h('h2', { class: 'detail-title' }, clientName(p)),
        h('p', { class: 'sub' }, p.client?.email || ''),
        h('div', { class: 'detail-actions' },
          h('a', { class: 'btn btn-white btn-sm', href: `/account?as=${p.user_id}#process` }, icon('eye'), 'View as user'))),
      section('Picture', processThumbnail(p, p.image_url, { alt: p.headline || '' }),
        h('div', { class: 'detail-actions' },
          h('label', { class: 'btn btn-line btn-sm', for: 'picture-input' }, icon('plus'), p.image_url ? 'Replace' : 'Upload'),
          picture,
          p.image_url && h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => saveProcess(p, { data: null }) }, 'Remove')),
        h('p', { class: 'hint' }, 'The client sees this on Your process. Pictures are shrunk to 1600px before they are sent.')),
      section('Stage',
        h('div', { class: 'seg seg-full', role: 'group', 'aria-label': 'Stage' }, STAGES.map((s) => h('button', {
          class: 'seg-btn', type: 'button', 'aria-pressed': String(p.stage === s.key), onclick: () => saveProcess(p, { stage: s.key })
        }, s.label))),
        h('p', { class: 'hint' }, STAGES[stageIndex(p.stage)].note)),
      section('What is happening', headline,
        h('div', { class: 'detail-actions' },
          h('button', { class: 'btn btn-white btn-sm', type: 'button', onclick: () => saveProcess(p, { headline: headline.value.trim() }) }, 'Save'))),
      section('Notes', commentThread({
        comments: state.comments, me: state.me,
        onSend: async (text) => {
          try {
            return (await api('/api/comments', { method: 'POST', body: { owner_id: p.user_id, body: text } })).comment;
          } catch (err) {
            flash(errorText(err), true);
            return null;
          }
        },
        onDelete: async (comment) => {
          try {
            await api('/api/comments', { method: 'DELETE', body: { id: comment.id } });
            state.comments = state.comments.filter((c) => c.id !== comment.id);
            renderProcessDetail();
          } catch (err) {
            flash(errorText(err), true);
          }
        },
        placeholder: 'Write to the client as Consultant…'
      })),
      section('Details', kv([
        ['Started', fmtDateTime(p.created_at)],
        ['Updated', fmtDateTime(p.updated_at)],
        ['From enquiry', p.enquiry_id ? `#${p.enquiry_id}` : '—']
      ]))));
}

/* ---------- meetings ---------- */

const MEET_LABELS = { requested: 'Waiting', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' };
const MEET_BADGE = { requested: 'new', confirmed: 'replied', declined: 'closed', cancelled: 'closed' };

const MEETING_COLUMNS = [
  { key: 'starts_at', label: 'When', cls: 'c-primary', sort: (m) => Date.parse(m.starts_at),
    cell: (m) => [h('strong', {}, slotText(m.starts_at, m.minutes)), m.note ? h('span', { class: 'sub' }, m.note) : null] },
  { key: 'client', label: 'Client', cls: 'c-msg', sort: (m) => clientName(m).toLowerCase(),
    cell: (m) => h('span', { class: 'clip' }, clientName(m)) },
  { key: 'minutes', label: 'Length', cls: 'c-num', sort: (m) => m.minutes, cell: (m) => `${m.minutes} min` },
  { key: 'status', label: 'Status', cls: 'c-status', sort: (m) => m.status, cell: (m) => badge(MEET_BADGE[m.status], MEET_LABELS[m.status]) },
  { key: 'actions', srLabel: 'Actions', cls: 'c-action', cell: (m) => (m.status === 'requested'
    ? h('span', { class: 'row-actions' },
      h('button', { class: 'btn btn-white btn-xs', type: 'button', onclick: (ev) => { ev.stopPropagation(); setMeeting(m, 'confirmed'); } }, 'Confirm'),
      h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: (ev) => { ev.stopPropagation(); setMeeting(m, 'declined'); } }, 'Decline'))
    : m.status === 'confirmed' && Date.parse(m.starts_at) > Date.now()
      ? h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: (ev) => { ev.stopPropagation(); setMeeting(m, 'cancelled'); } }, 'Call off')
      : h('span', { class: 'sub' }, '—')) }
];

async function setMeeting(m, status) {
  try {
    const { meeting } = await api('/api/admin/meetings', { method: 'PATCH', body: { id: m.id, status } });
    Object.assign(m, meeting);
    renderMeetings();
    flash(status === 'confirmed' ? 'Meeting confirmed' : status === 'declined' ? 'Meeting declined' : 'Meeting called off');
  } catch (err) {
    flash(errorText(err), true);
  }
}

function renderMeetings() {
  const counts = (s) => state.meetings.filter((m) => m.status === s).length;
  segButtons($('f-meet'), [['', 'All', state.meetings.length], ['requested', 'Waiting', counts('requested')],
    ['confirmed', 'Confirmed', counts('confirmed')]], state.meetFilter.status,
  (value) => { state.meetFilter.status = value; renderMeetings(); });
  const rows = state.meetings.filter((m) => !state.meetFilter.status || m.status === state.meetFilter.status);
  $('meetings-meta').textContent = `${rows.length} of ${state.meetings.length}`;
  keepFocus($('meeting-table'), () => $('meeting-table').replaceChildren(dataTable({
    label: 'Meetings', columns: MEETING_COLUMNS, rows, sort: { key: 'starts_at', dir: 1 },
    empty: 'Nobody has booked a time yet.'
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

  const prevProcess = state.processOpen;
  const wantedProcess = view === 'process' ? Number(id) : null;
  state.processOpen = state.process.some((p) => p.user_id === wantedProcess) ? wantedProcess : null;
  markSelected($('process-table'), state.processOpen);
  if (state.processOpen) {
    loadComments(state.processOpen).then(renderProcessDetail);
  }
  showPanel($('process-detail'), Boolean(state.processOpen), prevProcess && $('process-table').querySelector(`tr[data-id="${prevProcess}"]`));

  const prevOnb = state.onbOpen;
  const wantedOnb = view === 'onboarding' ? Number(id) : null;
  state.onbOpen = state.onboarding.some((o) => o.user_id === wantedOnb) ? wantedOnb : null;
  markSelected($('onboarding-table'), state.onbOpen);
  if (state.onbOpen) renderOnbDetail();
  showPanel($('onb-detail'), Boolean(state.onbOpen), prevOnb && $('onboarding-table').querySelector(`tr[data-id="${prevOnb}"]`));
}

// The thread for the client whose process is open, kept out of the list request so it stays small.
async function loadComments(userId) {
  try {
    state.comments = (await api(`/api/process?as=${userId}`)).comments;
  } catch {
    state.comments = [];
  }
}

async function load() {
  const [e, u, o, p, m] = await Promise.all([api('/api/admin/enquiries'), api('/api/admin/users'), api('/api/admin/onboarding'),
    api('/api/admin/process'), api('/api/admin/meetings')]);
  Object.assign(state, { enquiries: e.enquiries, users: u.users, onboarding: o.onboarding, process: p.process, meetings: m.meetings, me: u.me });
  renderEnquiries();
  renderOnboarding();
  renderProcess();
  renderMeetings();
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
    $('p-text').addEventListener('input', () => { state.processFilter.text = $('p-text').value; renderProcess(); });
    const closePanel = () => go(state.onbOpen ? 'onboarding' : state.processOpen ? 'process' : 'enquiries');
    $('detail-scrim').addEventListener('click', closePanel);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && (state.open || state.onbOpen || state.processOpen) && !document.body.classList.contains('nav-open')) closePanel();
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
