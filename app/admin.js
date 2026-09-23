// /admin — the workspace: enquiries (with the drafts still being written), process, meetings and members.
// The page only shows what the API allows;
// every change is checked again on the server (admin role, allowed values, owners locked).
import { commentThread, processThumbnail, readImage, slotText, STAGES, stageIndex } from '/app/project.js';
import {
  CONSULTANTS, DEFAULT_FOCUS, ENQUIRY_STATUSES, FIELD_TAGS, FUNDING_STAGES, LABELS, MAX_MESSAGE, MAX_TAGS,
  api, avatar, badge, consultantAvatar, consultantList, dataTable, firstNames, flash, fmtCost, fmtDate, fmtDateTime, focalBar,
  h, icon, keepFocus, kv, markSelected, mountShell, section, showPanel, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Enquiries', process: 'Process', meetings: 'Meetings', members: 'Members' };
const state = {
  enquiries: [], users: [], onboarding: [], process: [], meetings: [], comments: [], me: null,
  processFilter: { stage: '', text: '' }, processSort: { key: 'updated_at', dir: -1 }, processOpen: null, meetFilter: { status: '' },
  filter: { status: '', stage: '', text: '' }, sort: { key: 'at', dir: -1 }, open: null,
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

/* ---------- the inbox: enquiries, and the drafts still being written ---------- */

// A row is either an enquiry or someone's unfinished run through the onboarding flow: both are the same
// thing at different moments, so they share one list. A draft's id carries a "d" so the two never collide
// in the address bar, and every id is a string so the table can match the open one.
const ONB_STEPS = 5; // company, field, focal, consultants, confirm
const doneOf = (o) => Boolean(o.submitted_at);
const nameOf = (o) => (o.client ? o.client.name || o.client.email : `Member #${o.user_id}`);
const enquiriesFor = (o) => state.enquiries.filter((e) => e.user_id === o.user_id);
const draftId = (o) => `d${o.user_id}`;
const isDraft = (r) => r.kind === 'draft';
// Both kinds read the same way: the person on top, how to reach them underneath.
const fromText = (r) => (r.client ? r.client.name || r.client.email : isDraft(r) ? nameOf(r) : r.email);
const whoNote = (r) => (r.client ? r.client.email : isDraft(r) ? 'No account' : 'Guest');
const draftLine = (o) => [o.brief, ...(o.tags || []).map((t) => `#${t}`), o.consultants?.length ? firstNames(o.consultants) : null]
  .filter(Boolean).join('  ·  ');
const summary = (r) => (isDraft(r) ? draftLine(r) || 'Nothing written yet' : r.message);
const statusOf = (r) => (isDraft(r) ? badge('closed', `Step ${r.step} of ${ONB_STEPS}`) : badge(r.status, LABELS.enquiryStatus[r.status]));
const statusRank = (r) => (isDraft(r) ? -1 : ENQUIRY_STATUSES.indexOf(r.status));

function inboxRows() {
  return [
    ...state.enquiries.map((e) => ({ ...e, kind: 'enquiry', id: String(e.id), at: e.created_at })),
    ...state.onboarding.filter((o) => !doneOf(o)).map((o) => ({ ...o, kind: 'draft', id: draftId(o), at: o.updated_at }))
  ];
}

// The row that is open, as the object held in state, so saving it updates the list as well.
function openRow() {
  const key = state.open;
  if (!key) return null;
  if (key.startsWith('d')) {
    const o = state.onboarding.find((x) => draftId(x) === key);
    return o && { kind: 'draft', row: o };
  }
  const e = state.enquiries.find((x) => String(x.id) === key);
  return e && { kind: 'enquiry', row: e };
}

const INBOX_COLUMNS = [
  { key: 'at', label: 'Received', cls: 'c-date', sort: (r) => Date.parse(r.at), cell: (r) => time(r.at) },
  { key: 'from', label: 'From', cls: 'c-primary', sort: (r) => fromText(r).toLowerCase(),
    cell: (r) => h('span', { class: 'who' }, avatar(r.client || { email: fromText(r) }),
      h('span', { class: 'who-text' }, h('strong', {}, fromText(r)), h('span', { class: 'sub' }, whoNote(r)))) },
  { key: 'stage', label: 'Stage', cls: 'c-stage', sort: (r) => FUNDING_STAGES.indexOf(r.stage),
    cell: (r) => (r.stage ? h('span', { class: 'chip' }, r.stage) : h('span', { class: 'sub' }, '—')) },
  { key: 'message', label: 'Message', cls: 'c-msg', cell: (r) => h('span', { class: 'clip' }, summary(r)) },
  { key: 'estimated_cost', label: 'Estimate', cls: 'c-cost', sort: (r) => r.estimated_cost ?? -1,
    cell: (r) => (r.estimated_cost != null ? h('span', { class: 'cost' }, fmtCost(r.estimated_cost)) : h('span', { class: 'sub' }, '—')) },
  { key: 'status', label: 'Status', cls: 'c-status', sort: statusRank, cell: statusOf }
];

function visibleRows() {
  const { status, stage, text } = state.filter;
  const needle = text.trim().toLowerCase();
  const rows = inboxRows().filter((r) => {
    const keep = status === '' ? true : status === 'draft' ? isDraft(r) : !isDraft(r) && r.status === status;
    if (!keep || (stage && r.stage !== stage)) return false;
    return matches(needle, fromText(r), r.client?.email, summary(r), isDraft(r) ? null : `#${r.id}`);
  });
  return sortRows(rows, INBOX_COLUMNS, state.sort);
}

function clearFilters() {
  Object.assign(state.filter, { status: '', stage: '', text: '' });
  $('f-stage').value = '';
  $('f-text').value = '';
  renderInbox();
}

function renderInbox() {
  const drafts = state.onboarding.filter((o) => !doneOf(o)).length;
  const count = (s) => state.enquiries.filter((e) => e.status === s).length;
  segButtons($('f-status'),
    [['', 'All', state.enquiries.length + drafts], ['draft', 'In progress', drafts],
      ...ENQUIRY_STATUSES.map((s) => [s, LABELS.enquiryStatus[s], count(s)])],
    state.filter.status, (value) => { state.filter.status = value; renderInbox(); });

  const rows = visibleRows();
  const { status, stage, text } = state.filter;
  const all = state.enquiries.length + drafts;
  $('enquiries-meta').textContent = status || stage || text.trim() ? `${rows.length} of ${all}` : `${rows.length} total`;
  keepFocus($('enquiry-table'), () => $('enquiry-table').replaceChildren(dataTable({
    label: 'Enquiries', columns: INBOX_COLUMNS, rows, sort: state.sort, selected: state.open,
    onSort: (key) => { toggleSort(state.sort, key, key === 'from' || key === 'stage' ? 1 : -1); renderInbox(); },
    onOpen: (r, replace) => go(`enquiries/${r.id}`, replace),
    empty: all
      ? ['Nothing matches these filters. ', h('button', { class: 'link', type: 'button', onclick: clearFilters }, 'Clear filters')]
      : 'Nothing yet. Enquiries show up here as soon as someone sends the contact form, and drafts as soon as someone starts.'
  })));
  shell.setCount('enquiries', count('new') + drafts);
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
    renderInbox();
    renderDetail();
    $('detail').querySelector(`[data-status="${e.status}"]`)?.focus();
  }
}

/* ---------- the panel beside the list ---------- */

let editingId = null; // the enquiry being edited, so the panel knows which way to draw itself

function renderDetail() {
  const open = openRow();
  if (!open) return;
  if (open.kind === 'draft') return renderDraftDetail(open.row);
  renderEnquiryDetail(open.row);
}

function panelHead(label) {
  return h('div', { class: 'detail-head' },
    h('span', { class: 'detail-id' }, label),
    h('button', { class: 'icon-btn detail-close', type: 'button', 'aria-label': 'Close details', onclick: () => go('enquiries') }, icon('x')));
}

function viewAsLink(userId, label = 'View as user') {
  return userId ? h('a', { class: 'btn btn-line btn-sm', href: `/account?as=${userId}#profile` }, icon('eye'), label) : null;
}

function renderEnquiryDetail(e) {
  $('detail').replaceChildren(panelHead(`Enquiry #${e.id}`),
    h('div', { class: 'detail-body' }, editingId === e.id ? editForm(e) : enquiryBody(e)));
}

function enquiryBody(e) {
  return [
    h('div', {},
      h('h2', { class: 'detail-title' }, e.email),
      h('p', { class: 'sub' }, e.client ? `Member · ${e.client.name || e.client.email}` : 'Guest · sent without an account'),
      h('div', { class: 'detail-actions' },
        h('a', { class: 'btn btn-white btn-sm', href: replyHref(e) }, icon('reply'), 'Reply by email'),
        viewAsLink(e.user_id),
        h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => copyEmail(e.email) }, icon('copy'), 'Copy email'),
        h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => { editingId = e.id; renderDetail(); } }, icon('file'), 'Edit'))),
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
    ])),
    dangerZone('Delete this enquiry', 'It goes for good, and disappears from the client’s account too.', () => removeEnquiry(e))
  ];
}

function renderDraftDetail(o) {
  const theirs = enquiriesFor(o);
  const written = o.stage || o.brief || o.tags.length || o.focus || o.consultants.length;
  $('detail').replaceChildren(panelHead(`Draft · UID #${o.user_id}`),
    h('div', { class: 'detail-body' },
      h('div', {},
        h('h2', { class: 'detail-title' }, nameOf(o)),
        h('p', { class: 'sub' }, o.client ? o.client.email : ''),
        h('div', { class: 'detail-actions' },
          viewAsLink(o.user_id, 'View as user'),
          theirs.length > 0 && h('a', { class: 'btn btn-line btn-sm', href: '#enquiries', onclick: () => showEnquiriesOf(o) },
            `Their enquiries (${theirs.length})`))),
      section('Onboarding', statusOf({ ...o, kind: 'draft' }),
        h('p', { class: 'hint' }, `They stopped at step ${o.step} of ${ONB_STEPS}. Nothing has been sent yet; what they have written is below.`)),
      written
        ? section('Answers so far',
          o.stage ? h('span', { class: 'chip' }, o.stage) : null,
          h('p', { class: 'msg' }, o.brief || '—'),
          o.tags.length ? tagList(o.tags) : null,
          o.focus ? focalBar(o.focus) : null,
          o.consultants.length ? consultantList(o.consultants) : null)
        : section('Answers so far', h('p', { class: 'sub' }, 'Nothing written yet.')),
      section('Details', kv([
        ['Started', fmtDateTime(o.created_at)],
        ['Updated', fmtDateTime(o.updated_at)]
      ])),
      dangerZone('Throw away this draft', 'They start the flow again from the beginning. Enquiries they have already sent are untouched.',
        () => removeDraft(o))));
}

function showEnquiriesOf(o) {
  clearFilters();
  if (o.client) { state.filter.text = o.client.email; $('f-text').value = o.client.email; }
  renderInbox();
}

function dangerZone(label, note, onGo) {
  return h('div', { class: 'detail-section danger-zone' },
    h('h3', {}, 'Danger zone'),
    h('p', { class: 'hint' }, note),
    h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: onGo }, icon('x'), label));
}

/* ---------- editing an enquiry ---------- */

function editForm(e) {
  const stop = () => { editingId = null; renderDetail(); };

  const email = h('input', { class: 'input', type: 'email', required: true, maxlength: '254', 'aria-label': 'Sender email' });
  email.value = e.email;
  const stage = h('select', { class: 'select', 'aria-label': 'Stage' },
    FUNDING_STAGES.map((s) => h('option', { value: s, selected: s === e.stage ? '' : null }, s)));
  stage.value = e.stage;
  const message = h('textarea', { class: 'textarea', rows: '7', maxlength: String(MAX_MESSAGE), 'aria-label': 'Message' });
  message.value = e.message;
  const count = h('span', { class: 'sub' });

  let tags = [...e.tags];
  const tagBox = h('div', { class: 'tag-grid', role: 'group', 'aria-label': 'Fields' });
  const drawTags = () => {
    const full = tags.length >= MAX_TAGS;
    const all = [...FIELD_TAGS, ...tags.filter((t) => !FIELD_TAGS.some((f) => f.toLowerCase() === t.toLowerCase()))];
    tagBox.replaceChildren(...all.map((t) => {
      const on = tags.some((x) => x.toLowerCase() === t.toLowerCase());
      return h('button', { class: 'tag-chip tag-static', type: 'button', 'aria-pressed': String(on), disabled: !on && full,
        onclick: () => { tags = on ? tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...tags, t]; drawTags(); } },
      h('span', { class: 'tag-hash', 'aria-hidden': 'true' }, '#'), t);
    }));
  };
  drawTags();

  let focus = e.focus ? [...e.focus] : null;
  const focalBox = h('div', { class: 'edit-focal' });
  const drawFocal = () => {
    focalBox.replaceChildren(focus
      ? h('div', {}, focalBar(focus, { onChange: (values) => { focus = values; } }),
        h('button', { class: 'link', type: 'button', onclick: () => { focus = null; drawFocal(); } }, 'Remove the focal'))
      : h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => { focus = [...DEFAULT_FOCUS]; drawFocal(); } },
        icon('plus'), 'Set a focal'));
  };
  drawFocal();

  let consultants = [...e.consultants];
  const whoBox = h('div', { class: 'edit-who', role: 'group', 'aria-label': 'Consultants' });
  const drawWho = () => {
    whoBox.replaceChildren(...Object.entries(CONSULTANTS).map(([key, c]) => {
      const on = consultants.includes(key);
      return h('button', { class: 'who-chip', type: 'button', 'aria-pressed': String(on),
        onclick: () => { consultants = on ? consultants.filter((k) => k !== key) : [...consultants, key]; drawWho(); } },
      consultantAvatar(key), h('span', {}, c.name.split(' ')[0]));
    }));
  };
  drawWho();

  const save = h('button', { class: 'btn btn-white btn-sm', type: 'submit' }, icon('check'), 'Save changes');
  const sync = () => {
    count.textContent = `${message.value.length} / ${MAX_MESSAGE}`;
    save.disabled = !message.value.trim() || !email.value.trim() || !email.checkValidity();
  };
  message.addEventListener('input', sync);
  email.addEventListener('input', sync);
  sync();

  const form = h('form', { class: 'edit-form', novalidate: true },
    h('div', {}, h('h2', { class: 'detail-title' }, 'Editing enquiry'),
      h('p', { class: 'sub' }, 'Nothing changes until you save.')),
    section('Sender', email),
    section('Stage', stage),
    section('Message', message, h('div', { class: 'edit-foot' }, count)),
    section('Fields', tagBox, h('p', { class: 'hint' }, `Up to ${MAX_TAGS}.`)),
    section('Focal', focalBox),
    section('Consultants', whoBox),
    h('div', { class: 'edit-actions' }, save,
      h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: stop }, 'Cancel')));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    save.disabled = true;
    try {
      const { enquiry } = await api('/api/admin/enquiries', { method: 'PATCH', body: {
        id: e.id, email: email.value.trim(), stage: stage.value, message: message.value.trim(), tags, focus, consultants
      } });
      Object.assign(e, enquiry);
      editingId = null;
      flash('Enquiry saved');
      renderInbox();
      renderDetail();
    } catch (err) {
      save.disabled = false;
      flash(errorText(err), true);
    }
  });
  return form;
}

async function removeEnquiry(e) {
  const who = e.client ? e.client.name || e.client.email : e.email;
  const line = e.message.length > 90 ? `${e.message.slice(0, 90)}…` : e.message;
  if (!confirm(`Delete this enquiry from ${who}?\n\n${e.stage} · ${fmtDate(e.created_at)}\n"${line}"\n\nThis cannot be undone. It disappears from their account too.`)) return;
  try {
    await api('/api/admin/enquiries', { method: 'DELETE', body: { id: e.id } });
    state.enquiries = state.enquiries.filter((x) => x.id !== e.id);
    editingId = null;
    flash('Enquiry deleted');
    renderInbox();
    go('enquiries');
  } catch (err) {
    flash(errorText(err), true);
  }
}

async function removeDraft(o) {
  if (!confirm(`Throw away ${nameOf(o)}’s draft?\n\nThey stopped at step ${o.step} of ${ONB_STEPS}. They will start the flow again from the beginning, and enquiries they have already sent are untouched.`)) return;
  try {
    await api('/api/admin/onboarding', { method: 'DELETE', body: { user_id: o.user_id } });
    state.onboarding = state.onboarding.filter((x) => x.user_id !== o.user_id);
    flash('Draft cleared');
    renderInbox();
    go('enquiries');
  } catch (err) {
    flash(errorText(err), true);
  }
}

/* ---------- estimates ---------- */

async function saveCost(e, cost) {
  try {
    const { enquiry } = await api('/api/admin/enquiries', { method: 'PATCH', body: { id: e.id, estimated_cost: cost } });
    Object.assign(e, enquiry);
    flash(cost == null ? 'Estimate cleared' : `Estimate saved: ${fmtCost(cost)}`);
    renderInbox();
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
    onclick: () => { clearFilters(); state.filter.text = u.email; $('f-text').value = u.email; renderInbox(); }
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
  const wanted = view === 'enquiries' && id ? String(id) : null;
  state.open = inboxRows().some((r) => r.id === wanted) ? wanted : null;
  if (state.open !== previous) editingId = null; // moving to another row leaves any half-finished edit behind
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
  renderInbox();
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
    $('f-stage').addEventListener('change', () => { state.filter.stage = $('f-stage').value; renderInbox(); });
    $('f-text').addEventListener('input', () => { state.filter.text = $('f-text').value; renderInbox(); });
    $('m-text').addEventListener('input', () => { state.memberFilter.text = $('m-text').value; renderMembers(); });
    $('p-text').addEventListener('input', () => { state.processFilter.text = $('p-text').value; renderProcess(); });
    const closePanel = () => go(state.processOpen ? 'process' : 'enquiries');
    $('detail-scrim').addEventListener('click', closePanel);
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && (state.open || state.processOpen) && !document.body.classList.contains('nav-open')) closePanel();
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
