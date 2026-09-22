// /account — the client's enquiries (with fields, the focal split, consultants and the estimate) and profile,
// in the same workspace frame as /admin. Profile also shows the client's project at a glance.
// Admins can open /account?as=<id> to see a member's account exactly as they do ("view as user", read-only).
import { commentThread, meetingCalendar, MEETING_LENGTHS, processThumbnail, slotText, stageTracker, STAGES, stageIndex } from '/app/project.js';
import {
  DEFAULT_FOCUS, ENQUIRY_STATUSES, FUNDING_STAGES, LABELS,
  api, avatar, badge, consultantList, dataTable, estimateBlock, flash, fmtCost, fmtDate, fmtDateTime, focalBar, h, icon, keepFocus, kv,
  markSelected, mountShell, section, showPanel, signOut, signedInUser, sortRows, tagList, toggleSort
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const VIEWS = { enquiries: 'Your enquiries', process: 'Your process', meeting: 'Book a meeting', profile: 'Profile' };
const STATUS_NOTES = {
  new: 'Received. Someone from the cnpt team will read it shortly.',
  in_review: 'The cnpt team is reading it and will reply by email.',
  replied: 'The cnpt team has replied by email. Check your inbox, and your spam folder just in case.',
  closed: 'This enquiry is closed. You can send a new one any time.'
};
const state = { enquiries: [], sort: { key: 'created_at', dir: -1 }, open: null, viewingAs: null,
  me: null, project: null, comments: [], meetings: [], busy: [], imageUrl: null, projectLoaded: false, picked: null, members: null };
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
      editable && h('button', { class: 'btn btn-line btn-sm focal-set', type: 'button', onclick: () => saveFocus(e, DEFAULT_FOCUS, { reopen: true }) },
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
        !state.viewingAs && h('a', { class: 'btn btn-white btn-sm', href: '/onboarding' }, icon('plus'), 'New enquiry'))));
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
      h('a', { class: 'btn btn-line btn-sm', href: 'mailto:info@cnpt.ca' }, 'info@cnpt.ca')));
  }
  $('overview').replaceChildren(...cards);
}

/* ---------- your process ---------- */

const asQuery = () => (state.viewingAs ? `?as=${encodeURIComponent(state.viewingAs)}` : '');

// Loads the process, its thread and the meetings the first time one of those views is opened.
async function loadProject() {
  if (state.projectLoaded) return;
  // both at once: neither needs the other, and each is its own trip to the server
  const [data, times] = await Promise.all([
    api(`/api/process${asQuery()}`),
    state.viewingAs ? null : api('/api/meetings').catch(() => null)
  ]);
  Object.assign(state, {
    project: data.process, imageUrl: data.image_url, comments: data.comments, meetings: data.meetings, projectLoaded: true,
    busy: times?.busy ?? []
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

function renderProcess() {
  const p = state.project;
  const body = $('process-body');
  const head = h('section', { class: 'card' },
    h('div', { class: 'card-head card-head-row' },
      h('h2', {}, p?.headline || 'Your work with cnpt'),
      p && h('span', { class: 'sub' }, `Updated ${fmtDate(p.updated_at)}`)),
    h('div', { class: 'card-body project-now' },
      processThumbnail(p, state.imageUrl, { alt: p?.headline || 'The work right now' }),
      p
        ? stageTracker(p.stage)
        : h('p', { class: 'sub' }, 'The cnpt team opens this once your enquiry is picked up. You will see the stage, a picture of what is being made, and notes here.')));
  const thread = h('section', { class: 'card', 'aria-labelledby': 'notes-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'notes-h' }, 'Notes')),
    h('div', { class: 'card-body' }, commentThread({
      comments: state.comments, me: state.me, onSend: addComment, onDelete: removeComment, readOnly: Boolean(state.viewingAs)
    })));
  body.replaceChildren(head, thread);
}

/* ---------- book a meeting ---------- */

const liveMeetings = () => state.meetings.filter((m) => m.status === 'requested' || m.status === 'confirmed');

function meetingRow(m) {
  const past = Date.parse(m.starts_at) < Date.now();
  return h('li', { class: 'booking' },
    h('div', {},
      h('p', { class: 'booking-when' }, slotText(m.starts_at, m.minutes)),
      m.note ? h('p', { class: 'sub' }, m.note) : null),
    badge(m.status === 'confirmed' ? 'replied' : m.status === 'requested' ? 'new' : 'closed',
      m.status === 'confirmed' ? 'Confirmed' : m.status === 'requested' ? 'Waiting' : m.status === 'declined' ? 'Declined' : 'Cancelled'),
    !state.viewingAs && !past && (m.status === 'requested' || m.status === 'confirmed')
      ? h('button', { class: 'btn btn-line btn-xs', type: 'button', onclick: () => cancelMeeting(m) }, 'Cancel')
      : null);
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

function renderMeeting() {
  const body = $('meeting-body');
  const mine = h('section', { class: 'card', 'aria-labelledby': 'mine-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'mine-h' }, 'Your meetings')),
    state.meetings.length
      ? h('ul', { class: 'bookings' }, [...state.meetings].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).map(meetingRow))
      : h('div', { class: 'empty-note' }, h('p', {}, state.viewingAs ? 'No meetings booked.' : 'Nothing booked yet. Pick a time above.')));

  if (state.viewingAs) return body.replaceChildren(mine);

  // the picked block, written out under the calendar, with a note and the button that books it
  const when = h('p', { class: 'pick-when' }, 'No time picked yet');
  const sub = h('p', { class: 'sub' }, 'Tap a slot on the calendar.');
  const note = h('input', { class: 'input', id: 'meeting-note', type: 'text', maxlength: '500', placeholder: 'What would you like to talk about? (optional)' });
  const book = h('button', { class: 'btn btn-white btn-sm', type: 'submit', disabled: true }, 'Request this time', icon('arrow-right'));
  const lengths = h('div', { class: 'seg', role: 'group', 'aria-label': 'How long' }, MEETING_LENGTHS.map((mins) => h('button', {
    class: 'seg-btn', type: 'button', 'aria-pressed': String(mins === 30), 'data-len': mins,
    onclick: (ev) => {
      for (const b of lengths.children) b.setAttribute('aria-pressed', String(b === ev.currentTarget));
      calendar.setLength(mins);
    }
  }, mins === 30 ? '30 min' : '1 hour')));

  const calendar = meetingCalendar({
    busy: state.busy,
    mine: liveMeetings(),
    onPick: (picked) => {
      state.picked = picked;
      when.textContent = slotText(picked.startsAt, picked.minutes);
      sub.textContent = 'The cnpt team confirms it by email, usually within a working day.';
      book.disabled = false;
    }
  });

  const form = h('form', { class: 'pick' }, h('div', { class: 'pick-head' }, when, sub),
    h('div', { class: 'pick-row' }, note, book));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!state.picked) return;
    book.disabled = true;
    try {
      const { meeting } = await api('/api/meetings', { method: 'POST', body: { ...{ starts_at: state.picked.startsAt, minutes: state.picked.minutes }, note: note.value.trim() || undefined } });
      state.meetings.push(meeting);
      state.busy.push({ starts_at: meeting.starts_at, minutes: meeting.minutes });
      state.picked = null;
      note.value = '';
      renderMeeting();
      flash('Meeting requested. We will confirm by email.');
    } catch (err) {
      flash(err.message === 'slot_taken' ? 'Someone just took that slot. Please pick another.' : 'That time could not be booked. Please try again.', true);
      book.disabled = false;
    }
  });

  body.replaceChildren(
    h('section', { class: 'card', 'aria-labelledby': 'cal-h' },
      h('div', { class: 'card-head card-head-row' }, h('h2', { id: 'cal-h' }, 'Pick a time'), lengths),
      h('div', { class: 'card-body' }, calendar.el, form)),
    mine);
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

  if (view === 'process' || view === 'meeting') {
    loadProject().then(() => (view === 'process' ? renderProcess() : renderMeeting()), () => {
      $(view === 'process' ? 'process-body' : 'meeting-body').replaceChildren(h('p', { class: 'loading' }, 'This could not be loaded. Please refresh the page.'));
    });
  }
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
    // a new client finishes onboarding first
    if (!data.viewing_as && me.role !== 'admin' && !data.onboarding?.submitted_at) {
      location.replace('/onboarding');
    } else {
      if (data.viewing_as) viewAs(data.user);
      state.enquiries = data.enquiries;
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
