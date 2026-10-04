// /account — the client's enquiries (with fields, the focal split, consultants and the estimate) and profile,
// in the same workspace frame as /admin. Profile also shows the client's project at a glance.
// Admins can open /account?as=<id> to see a member's account exactly as they do ("view as user", read-only).
import { clockAt, commentThread, dayAt, MEETING_LENGTHS, processThumbnail, slotText, stageTracker, STAGES, stageIndex, timeDial } from '/app/project.js';
import { renderDocs } from '/app/documentation.js';
import {
  DEFAULT_FOCUS, ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, consultantList, dataTable, estimateBlock, flash, fmtCost, fmtDate, fmtDateTime, focalBar, h, icon, keepFocus, kv,
  markSelected, mountShell, section, showPanel, signOut, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { process: 'Your project', docs: 'Your documentation', meeting: 'Meetings', enquiries: 'Enquiries', profile: 'Profile' };
const STATUS_NOTES = {
  new: 'Received. Someone from the cnpt team will read it shortly.',
  in_review: 'The cnpt team is reading it and will reply by email.',
  replied: 'The cnpt team has replied by email. Check your inbox, and your spam folder just in case.',
  closed: 'This enquiry is closed. You can send a new one any time.'
};
const state = { enquiries: [], sort: { key: 'created_at', dir: -1 }, open: null, viewingAs: null, docsAnswered: null,
  me: null, project: null, comments: [], meetings: [], busy: [], imageUrl: null, projectLoaded: false, picked: null, moving: null, members: null,
  onboarding: null };
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
      focalSection(e),
      e.consultants.length && section(e.consultants.length > 1 ? 'Consultants' : 'Consultant', consultantList(e.consultants)),
      section('Details', kv([
        ['Stage', h('span', { class: 'chip' }, e.stage)],
        ['Sent', fmtDateTime(e.created_at)],
        ['Reference', `#${e.id}`]
      ]))));
}

// The focal split. The client can keep adjusting it until the enquiry is closed; each change saves by itself.
function focalSection(e) {
  const editable = !state.viewingAs && e.status !== 'closed';
  if (!e.focus) {
    return section('Focal', h('p', { class: 'sub' }, editable ? 'Not set yet. Tell us how the work should be split.' : 'Not set.'),
      editable && h('button', { class: 'btn btn-ghost btn-sm focal-set', type: 'button', onclick: () => saveFocus(e, DEFAULT_FOCUS, { reopen: true }) },
        icon('plus'), 'Set focal'));
  }
  if (!editable) return section('Focal', focalBar(e.focus));
  const status = h('p', { class: 'focal-status', role: 'status' }, 'Drag the edges to change it. It saves by itself.');
  let timer;
  return section('Focal', focalBar(e.focus, { onChange: (values, done) => {
    if (!done) return;
    status.textContent = 'Saving…';
    clearTimeout(timer);
    timer = setTimeout(() => saveFocus(e, values, { status }), 300);
  } }), status);
}

async function saveFocus(e, focus, { status, reopen } = {}) {
  try {
    const { enquiry } = await api('/api/account', { method: 'PATCH', body: { id: e.id, focus } });
    Object.assign(e, enquiry);
    if (status) status.textContent = 'Saved.';
    if (reopen) {
      renderDetail();
      $('detail').querySelector('.focal-handle')?.focus();
    }
    renderOverview();
  } catch (err) {
    if (status) status.textContent = '';
    flash(err.message === 'closed' ? 'This enquiry is closed, so its focal can’t change.' : 'The focal split didn’t save. Please try again.', true);
  }
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

// Admins only, and not while already looking through someone else's eyes: pick a member and open their
// account exactly as they see it. It sits with the admin's own profile rather than as a button on every
// row of the Members table.
async function renderViewAs() {
  if (state.me?.role !== 'admin' || state.viewingAs) return;
  const card = $('viewas-card');
  const body = $('viewas');
  card.hidden = false;
  if (!state.members) {
    body.replaceChildren(h('p', { class: 'loading' }, 'Loading members…'));
    try {
      state.members = (await api('/api/admin/users')).users.filter((u) => u.id !== state.me.id);
    } catch {
      state.members = [];
      return body.replaceChildren(h('p', { class: 'sub' }, 'The member list could not be loaded.'));
    }
  }

  const list = h('ul', { class: 'as-list' });
  const find = h('input', { class: 'input', type: 'search', placeholder: 'Search name or email', autocomplete: 'off',
    'aria-label': 'Search members' });
  const draw = () => {
    const needle = find.value.trim().toLowerCase();
    const rows = state.members.filter((u) => !needle || `${u.name || ''} ${u.email}`.toLowerCase().includes(needle));
    list.replaceChildren(...(rows.length
      ? rows.slice(0, 40).map((u) => h('li', {},
        h('a', { class: 'as-item', href: `/account?as=${u.id}#profile`, 'aria-label': `View as ${u.name || u.email}` },
          avatar(u),
          h('span', { class: 'who-text' },
            h('strong', {}, u.name || u.email),
            h('span', { class: 'sub' }, u.email)),
          h('span', { class: 'as-note' }, u.role === 'admin' ? 'Admin' : u.last_login ? `Seen ${fmtDate(u.last_login)}` : ''),
          icon('arrow-right'))))
      : [h('li', { class: 'sub' }, 'Nobody matches that search.')]));
  };
  find.addEventListener('input', draw);
  draw();
  body.replaceChildren(
    h('p', { class: 'sub' }, 'Opens their account the way they see it. Nothing can be changed from there.'),
    h('label', { class: 'search' }, icon('search'), find),
    list);
}

// The right-hand side of Profile: the project at a glance, from the enquiries.
function renderOverview() {
  const list = [...state.enquiries].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const card = (title, ...content) => h('section', { class: 'card' },
    h('div', { class: 'card-head' }, h('h2', {}, title)), h('div', { class: 'card-body' }, content));
  const cards = [];
  if (!list.length) {
    cards.push(h('section', { class: 'card', 'aria-labelledby': 'project-h' },
      h('div', { class: 'card-head' }, h('h2', { id: 'project-h' }, 'My project')),
      h('div', { class: 'empty-note' },
        h('p', {}, state.viewingAs ? 'No enquiries yet.' : 'Nothing here yet. Send your first enquiry and your project shows up here.'),
        !state.viewingAs && h('a', { class: 'btn btn-primary btn-sm', href: '/onboarding' }, icon('plus'), 'New enquiry'))));
  } else {
    const latest = list[0];
    const stat = (n, label) => h('div', { class: 'stat' }, h('strong', {}, String(n)), h('span', {}, label));
    cards.push(h('section', { class: 'card', 'aria-labelledby': 'project-h' },
      h('div', { class: 'card-head card-head-row' }, h('h2', { id: 'project-h' }, 'My project'), h('a', { href: '#enquiries' }, 'All enquiries')),
      h('div', { class: 'stats' },
        stat(list.length, list.length === 1 ? 'Enquiry' : 'Enquiries'),
        stat(list.filter((e) => e.status === 'new' || e.status === 'in_review').length, 'In progress'),
        stat(list.filter((e) => e.estimated_cost != null).length, 'Estimates')),
      h('div', { class: 'latest' },
        h('p', {}, h('span', { class: 'sub' }, `Latest · ${fmtDate(latest.created_at)}`), h('a', { class: 'clip', href: `#enquiries/${latest.id}` }, latest.message)),
        badge(latest.status, LABELS.enquiryStatus[latest.status]))));
    const focused = list.find((e) => e.focus);
    cards.push(card('Focal', focused
      ? [focalBar(focused.focus), h('p', { class: 'hint' }, `From enquiry #${focused.id} · `,
        h('a', { href: `#enquiries/${focused.id}` }, !state.viewingAs && focused.status !== 'closed' ? 'Change it' : 'Open it'))]
      : h('p', { class: 'sub' }, 'Not set yet. Set it on any of your enquiries.')));
    const consultants = [...new Set(list.flatMap((e) => e.consultants))];
    if (consultants.length) cards.push(card(consultants.length > 1 ? 'Your consultants' : 'Your consultant', consultantList(consultants)));
    const tags = list.flatMap((e) => e.tags).filter((t, i, all) => all.findIndex((x) => x.toLowerCase() === t.toLowerCase()) === i);
    if (tags.length) cards.push(card('Your fields', tagList(tags)));
  }
  if (!state.viewingAs) {
    cards.push(h('section', { class: 'card card-row', 'aria-labelledby': 'help-h' },
      h('div', {}, h('h2', { id: 'help-h' }, 'Questions?'), h('p', { class: 'sub' }, 'Write to the cnpt team. We reply within two working days.')),
      h('a', { class: 'btn btn-ghost btn-sm', href: 'mailto:info@cnpt.ca' }, 'info@cnpt.ca')));
  }
  $('overview').replaceChildren(...cards);
}

/* ---------- your process ---------- */

const asQuery = () => (state.viewingAs ? `?as=${encodeURIComponent(state.viewingAs)}` : '');

// Loads the process, its thread and the meetings the first time one of those views is opened.
async function loadProject() {
  if (state.projectLoaded) return;
  // all at once: none needs another, and each is its own trip to the server. The brief is only
  // counted here — the rail says how far along it is, and the documentation page loads it itself.
  const [data, times, docs] = await Promise.all([
    api(`/api/process${asQuery()}`),
    state.viewingAs ? null : api('/api/meetings').catch(() => null),
    state.viewingAs ? null : api('/api/documentation').catch(() => null)
  ]);
  Object.assign(state, {
    project: data.process, imageUrl: data.image_url, comments: data.comments, meetings: data.meetings, projectLoaded: true,
    busy: times?.busy ?? [],
    docsAnswered: docs ? Object.values(docs.documentation?.answers || {}).filter((v) => v && v.trim()).length : null
  });
}

async function addComment(text) {
  try {
    return (await api('/api/comments', { method: 'POST', body: { body: text } })).comment;
  } catch {
    flash('That note could not be saved. Please try again.', true);
    return null;
  }
}

async function removeComment(comment) {
  try {
    await api('/api/comments', { method: 'DELETE', body: { id: comment.id } });
    state.comments = state.comments.filter((c) => c.id !== comment.id);
    renderProcess();
  } catch {
    flash('That note could not be removed. Please try again.', true);
  }
}

// Anything the client is the one holding up, said plainly and linked to where it is done.
function waitingOn() {
  const items = [];
  if (!state.viewingAs && state.onboarding?.skipped_at && !state.onboarding?.submitted_at) {
    const step = Math.min(5, Math.max(1, state.onboarding.step || 1));
    items.push(step > 1
      ? { text: `Finish telling us about your project — you are on step ${step} of 5.`, href: '/onboarding', action: 'Continue' }
      : { text: 'Tell us about your project — five short steps, about two minutes.', href: '/onboarding', action: 'Start now' });
  }
  // the documentation, while it is still mostly blank: the studio can only work from what it has
  if (!state.viewingAs && state.docsAnswered != null && state.docsAnswered < 8) {
    items.push({
      text: state.docsAnswered
        ? `Your documentation is ${state.docsAnswered} answers in. The rest shapes what we build.`
        : 'Write your documentation — eleven short sections, saved as you go.',
      href: '#docs', action: state.docsAnswered ? 'Continue' : 'Start' });
  }
  const asked = state.meetings.filter((m) => m.status === 'requested' && Date.parse(m.starts_at) > Date.now());
  if (asked.length) {
    items.push({ text: asked.length === 1
      ? `A meeting you asked for on ${slotText(asked[0].starts_at, asked[0].minutes)} is waiting for the team to confirm.`
      : `${asked.length} meetings you asked for are waiting for the team to confirm.`, href: '#meeting', action: 'See meetings' });
  }
  if (!items.length) return null;
  return h('section', { class: 'card card-waiting' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Waiting on')),
    h('ul', { class: 'waiting' }, items.map((it) => h('li', {},
      h('span', {}, it.text),
      h('a', { class: 'btn btn-ghost btn-xs', href: it.href }, it.action)))));
}

// The soonest meeting still ahead.
const nextMeeting = () => state.meetings
  .filter((m) => (m.status === 'confirmed' || m.status === 'requested') && Date.parse(m.starts_at) > Date.now())
  .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0] || null;

const reading = (label, value, note, href) => h(href ? 'a' : 'div', href ? { class: 'reading', href } : { class: 'reading' },
  h('p', { class: 'reading-label' }, label),
  h('p', { class: 'reading-value' }, value),
  note ? h('p', { class: 'reading-note' }, note) : null);

// Where the client stands, in four readings, before they read a word of the thread.
function statusStrip() {
  const p = state.project;
  const at = p ? stageIndex(p.stage) : -1;
  const next = nextMeeting();
  const last = state.comments[state.comments.length - 1];
  const priced = state.enquiries.find((e) => e.estimated_cost != null);
  return h('div', { class: 'readings col-12' },
    reading('Stage', p ? STAGES[at].label : 'Not started',
      p ? `${at + 1} of ${STAGES.length} · ${STAGES[at].note}` : 'Opens when your enquiry is picked up'),
    reading('Next meeting', next ? dayAt(new Date(next.starts_at)) : 'None booked',
      next
        ? `${clockAt(new Date(next.starts_at))} Toronto · ${next.status === 'confirmed' ? 'Confirmed' : 'Waiting on the team'}`
        : 'Pick a time', '#meeting'),
    reading('Conversation', state.comments.length ? `${state.comments.length} note${state.comments.length === 1 ? '' : 's'}` : 'Nothing yet',
      last ? `Last ${fmtDate(last.created_at)}` : 'Write whenever you need to'),
    reading('Estimate', priced ? fmtCost(priced.estimated_cost) : 'To be confirmed',
      priced ? 'From your enquiry' : 'Set after the team reads your enquiry', '#enquiries'));
}

function renderProcess() {
  const p = state.project;
  const body = $('process-body');

  // the conversation is the page: it is what this place is for
  const thread = h('section', { class: 'card card-thread col-8', 'aria-labelledby': 'notes-h' },
    h('div', { class: 'card-head card-head-row' },
      h('h2', { id: 'notes-h' }, 'Conversation'),
      h('span', { class: 'sub' }, state.comments.length
        ? `${state.comments.length} note${state.comments.length === 1 ? '' : 's'}`
        : 'Between you and the cnpt team')),
    h('div', { class: 'card-body' }, commentThread({
      comments: state.comments, me: state.me, onSend: addComment, onDelete: removeComment,
      readOnly: Boolean(state.viewingAs), placeholder: 'Write to the cnpt team…'
    })));

  // and beside it, where the work stands
  const stateCard = h('section', { class: 'card' },
    h('div', { class: 'card-head card-head-row' },
      h('h2', {}, 'Where the work is'),
      p && h('span', { class: 'sub' }, `Updated ${fmtDate(p.updated_at)}`)),
    h('div', { class: 'card-body project-now' },
      p ? h('p', { class: 'rail-strong' }, p.headline || 'Your work with cnpt') : null,
      // the picture only takes room once there is one to show
      state.imageUrl ? processThumbnail(p, state.imageUrl, { alt: p?.headline || 'The work right now' }) : null,
      p
        ? stageTracker(p.stage)
        : h('p', { class: 'sub' }, 'The cnpt team opens this once your enquiry is picked up. You will see the stage, a picture of what is being made, and the conversation here.')));

  const rail = h('div', { class: 'project-rail col-4' },
    ...[waitingOn(), stateCard].filter(Boolean));
  body.replaceChildren(statusStrip(), thread, rail);
}

/* ---------- meetings ---------- */

const liveMeetings = () => state.meetings.filter((m) => m.status === 'requested' || m.status === 'confirmed');

const isOver = (m) => Date.parse(m.starts_at) + m.minutes * 60000 <= Date.now();

const STATUS = {
  confirmed: ['replied', 'Confirmed', 'The team has this in the diary.'],
  requested: ['new', 'Waiting on the team', 'Usually confirmed within a working day.'],
  declined: ['closed', 'Declined', 'Pick another time and we will take it from there.'],
  cancelled: ['closed', 'Called off', null]
};

// How long until it, in words, so a client can see at a glance what is close.
function countdown(startsAt) {
  const mins = Math.round((Date.parse(startsAt) - Date.now()) / 60000);
  if (mins < 0) return null;
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? '' : 's'}`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'tomorrow' : `in ${days} days`;
}

/* One booked meeting. A client could see these before, in a list at the foot of the page under a
 * calendar tall enough to push them off the screen, and the only thing they could do was call one
 * off. The meeting now leads the page, says what state it is in and why, and can be moved. */
function meetingRow(m, { onMove } = {}) {
  const past = isOver(m);
  const [tone, label, why] = STATUS[m.status] || ['closed', m.status, null];
  const soon = past ? null : countdown(m.starts_at);
  const canAct = !state.viewingAs && !past && (m.status === 'requested' || m.status === 'confirmed');
  return h('li', { class: past ? 'booking is-past' : 'booking' },
    h('div', { class: 'booking-main' },
      h('p', { class: 'booking-when' }, slotText(m.starts_at, m.minutes),
        soon ? h('span', { class: 'booking-soon' }, soon) : null),
      m.note ? h('p', { class: 'sub booking-note' }, m.note) : null,
      !past && why ? h('p', { class: 'sub booking-why' }, why) : null),
    h('div', { class: 'booking-side' },
      badge(tone, label),
      canAct
        ? h('div', { class: 'booking-acts' },
          h('button', { class: 'btn btn-ghost btn-xs', type: 'button', onclick: () => onMove?.(m) }, 'Move'),
          h('button', { class: 'btn btn-ghost btn-xs', type: 'button', onclick: () => cancelMeeting(m) }, 'Cancel'))
        : null));
}

// Soonest first while they are still ahead; everything already over goes underneath, most recent first.
function meetingsInOrder() {
  const ahead = state.meetings.filter((m) => !isOver(m)).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const done = state.meetings.filter(isOver).sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
  return { ahead, done };
}

async function cancelMeeting(m) {
  if (!confirm('Call off this meeting?')) return;
  try {
    const { meeting } = await api('/api/meetings', { method: 'PATCH', body: { id: m.id, status: 'cancelled' } });
    Object.assign(m, meeting);
    state.busy = state.busy.filter((b) => Date.parse(b.starts_at) !== Date.parse(m.starts_at));
    renderMeeting();
    flash('Meeting called off.');
  } catch {
    flash('That meeting could not be called off. Please try again.', true);
  }
}

// Moving a meeting is calling it off and asking for another time, so the dial is loaded with the old
// one and the client picks the new one. Saying that plainly beats a silent reschedule they cannot check.
function moveMeeting(m) {
  state.moving = m;
  flash('Pick the new time, then ask for it. The old one is called off once the new one is in.');
  renderMeeting();                     // the dial is placed on the old time as it is built, below
}

function renderMeeting() {
  const body = $('meeting-body');
  const { ahead, done } = meetingsInOrder();

  // What is booked comes first: it is the thing a client opens this page to check.
  const booked = h('section', { class: 'card col-12', 'aria-labelledby': 'mine-h' },
    h('div', { class: 'card-head card-head-row' },
      h('h2', { id: 'mine-h' }, 'Your meetings'),
      ahead.length ? h('span', { class: 'sub' }, `${ahead.length} coming up`) : null),
    h('div', { class: 'card-body' },
      ahead.length
        ? h('ul', { class: 'bookings' }, ahead.map((m) => meetingRow(m, { onMove: moveMeeting })))
        : h('p', { class: 'sub' }, state.viewingAs ? 'Nothing booked.' : 'Nothing booked yet. Pick a time below.'),
      done.length
        ? h('details', { class: 'been' },
          h('summary', {}, `${done.length} that ${done.length === 1 ? 'has' : 'have'} been and gone`),
          h('ul', { class: 'bookings' }, done.map((m) => meetingRow(m))))
        : null));

  if (state.viewingAs) return body.replaceChildren(booked);

  const when = h('p', { class: 'pick-when is-empty' }, 'Turn the dial');
  const sub = h('p', { class: 'sub' }, 'Weekdays, 09:00–18:00 Toronto time. Times already taken are greyed out.');
  const note = h('input', { class: 'input', id: 'meeting-note', type: 'text', maxlength: '500',
    placeholder: 'e.g. Where the concept should go next' });
  const book = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', disabled: true },
    state.moving ? 'Move to this time' : 'Request this time', icon('arrow-right'));
  const lengths = h('div', { class: 'seg', role: 'group', 'aria-label': 'How long' }, MEETING_LENGTHS.map((mins) => h('button', {
    class: 'seg-btn', type: 'button', 'aria-pressed': String(mins === 30), 'data-len': mins,
    onclick: (ev) => {
      for (const b of lengths.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget));
      dial.setLength(mins);
    }
  }, mins === 30 ? '30 min' : '1 hour')));

  const dial = timeDial({
    // the meeting being moved does not block itself, or the dial would open on a time it calls taken
    busy: state.moving
      ? state.busy.filter((x) => Date.parse(x.starts_at) !== Date.parse(state.moving.starts_at))
      : state.busy,
    mine: liveMeetings(),
    onPick: (picked) => {
      state.picked = picked;
      when.textContent = picked ? slotText(picked.startsAt, picked.minutes) : 'That time is not free';
      when.classList.toggle('is-empty', !picked);
      book.disabled = !picked;
    }
  });

  const moving = state.moving
    ? h('p', { class: 'pick-moving' }, 'Moving ', h('strong', {}, slotText(state.moving.starts_at, state.moving.minutes)), '. ',
      h('button', { class: 'link', type: 'button', onclick: () => { state.moving = null; renderMeeting(); } }, 'Keep it where it is'))
    : null;

  const form = h('form', { class: 'pick' },
    moving,
    h('div', { class: 'pick-head', role: 'status' }, when, sub),
    h('div', { class: 'field' },
      h('label', { for: 'meeting-note' }, 'What would you like to talk about? ', h('span', { class: 'sub' }, '(optional)')),
      note),
    book);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!state.picked) return;
    book.disabled = true;
    const moved = state.moving;
    try {
      const { meeting } = await api('/api/meetings', { method: 'POST',
        body: { starts_at: state.picked.startsAt, minutes: state.picked.minutes, note: note.value.trim() || undefined } });
      state.meetings.push(meeting);
      state.busy.push({ starts_at: meeting.starts_at, minutes: meeting.minutes });
      // the new time is in before the old one is let go, so a client is never left with neither
      if (moved) {
        try {
          const { meeting: off } = await api('/api/meetings', { method: 'PATCH', body: { id: moved.id, status: 'cancelled' } });
          Object.assign(moved, off);
          state.busy = state.busy.filter((b) => Date.parse(b.starts_at) !== Date.parse(moved.starts_at));
        } catch {
          flash('The new time is booked, but the old one could not be called off. Please cancel it below.', true);
        }
      }
      state.picked = null;
      state.moving = null;
      note.value = '';
      renderMeeting();
      flash(moved ? 'Meeting moved. We will confirm by email.' : 'Meeting requested. We will confirm by email.');
    } catch (err) {
      flash(err.message === 'slot_taken' ? 'Someone just took that slot. Please pick another.' : 'That time could not be booked. Please try again.', true);
      book.disabled = false;
    }
  });

  body.replaceChildren(
    booked,
    h('section', { class: 'card col-12', 'aria-labelledby': 'cal-h' },
      h('div', { class: 'card-head card-head-row' },
        h('h2', { id: 'cal-h' }, state.moving ? 'Pick a new time' : 'Book a time'), lengths),
      h('div', { class: 'card-body dial-body' }, dial.el, form)));

  // only once the wheels are in the document and have a height can they be turned to a given time
  if (state.moving) dial.show(state.moving.starts_at);
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
  // signing in lands on the project phase; the other views are a click away in the navigation
  const view = Object.hasOwn(VIEWS, name) ? name : 'process';
  for (const v of Object.keys(VIEWS)) $(`view-${v}`).hidden = v !== view;
  shell.setView(view, VIEWS[view]);

  if (view === 'process' || view === 'meeting') {
    loadProject().then(() => (view === 'process' ? renderProcess() : renderMeeting()), () => {
      $(view === 'process' ? 'process-body' : 'meeting-body').replaceChildren(h('p', { class: 'loading' }, 'This could not be loaded. Please refresh the page.'));
    });
  }
  if (view === 'docs') renderDocs($('docs-body'), { viewingAs: state.viewingAs });
  if (view === 'profile') renderViewAs();   // the member list is only fetched once, and only for an admin

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
    h('a', { class: 'btn btn-ghost btn-xs', href: '/admin#members' }, 'Exit'));
  banner.hidden = false;
  for (const id of ['new-enquiry', 'signout-card', 'delete-card']) $(id).hidden = true;
  document.title = `${member.name || member.email} — viewing as — cnpt`;
}

/* ---------- start ---------- */

const me = await signedInUser(`/account${location.search}`);
// a new client tells us about the project first, before the workspace is drawn
if (me?.welcome_pending) location.replace('/onboarding');
else if (me) {
  const asId = me.role === 'admin' ? new URLSearchParams(location.search).get('as') : null;
  if (!asId && location.search) history.replaceState(null, '', location.pathname + location.hash);
  state.viewingAs = asId;
  state.me = me;
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
    // a new client tells us about the project first — unless they chose to skip, which the account remembers
    if (!data.viewing_as && me.role !== 'admin' && !data.onboarding?.submitted_at && !data.onboarding?.skipped_at) {
      location.replace('/onboarding');
    } else {
      if (data.viewing_as) viewAs(data.user);
      state.enquiries = data.enquiries;
      state.onboarding = data.onboarding;
      renderProfile(data.user);
      renderOverview();
      renderEnquiries();
      route();
    }
  } catch (err) {
    const text = err.status === 404 ? 'That member doesn’t exist.' : 'This account could not be loaded. Please refresh the page.';
    $('enquiry-table').replaceChildren(h('p', { class: 'loading' }, text));
  }
}
