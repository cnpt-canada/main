// /admin — enquiries, client projects and members. The page only shows what the API allows;
// every change is checked again on the server (admin role, allowed values, owners locked).
import {
  FUNDING_STAGES, LABELS, PROJECT_STAGES,
  api, avatar, flash, fmtDate, h, renderNav, signedInUser
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const TABS = ['enquiries', 'projects', 'members'];
const state = { enquiries: [], projects: [], users: [], me: null };

const ERRORS = {
  owner_locked: 'Owners are set in ADMIN_EMAILS and can’t be changed here.',
  cannot_demote_self: 'You can’t remove your own admin access.',
  invalid_title: 'Give the project a title (up to 120 characters).',
  invalid_client: 'That client no longer exists. Reload the page.',
  invalid_note: 'The note is too long (2,000 characters at most).',
  admin_only: 'Your admin access was removed.',
  signin_required: 'Your session ended. Sign in again.'
};
const errorText = (err) => ERRORS[err.message] || 'That didn’t save. Please try again.';

/* ---------- small form builders ---------- */

function field(label, control, cls) {
  return h('label', { class: cls ? `field ${cls}` : 'field' }, h('span', {}, label), control);
}
function select(name, values, labels, selected, attrs) {
  return h('select', { class: 'select', name, ...attrs },
    values.map((v) => h('option', { value: v, selected: v === selected }, labels ? labels[v] : v)));
}
function clientSelect(selectedId) {
  return h('select', { class: 'select', name: 'user_id' },
    h('option', { value: '' }, 'No client yet'),
    state.users.map((u) => h('option', { value: u.id, selected: u.id === selectedId }, u.name ? `${u.name} (${u.email})` : u.email)));
}
function projectFields(p) {
  return h('div', { class: 'form-grid' },
    field('Title', h('input', { class: 'input', name: 'title', value: p.title || '', maxlength: 120, required: true, autocomplete: 'off' })),
    field('Client', clientSelect(p.user_id || null)),
    field('Stage', select('stage', PROJECT_STAGES, LABELS.projectStage, p.stage || 'frame')),
    field('Status', select('status', Object.keys(LABELS.projectStatus), LABELS.projectStatus, p.status || 'active')),
    field('Note to the client', h('textarea', { class: 'textarea', name: 'note', maxlength: 2000, rows: 3 }, p.note || ''), 'span-2'));
}
function readProject(form) {
  const f = form.elements;
  return {
    title: f.title.value.trim(),
    user_id: f.user_id.value ? Number(f.user_id.value) : null,
    stage: f.stage.value,
    status: f.status.value,
    note: f.note.value.trim()
  };
}

/* ---------- enquiries ---------- */

function enquiryRow(e) {
  const status = select('status', Object.keys(LABELS.enquiryStatus), LABELS.enquiryStatus, e.status,
    { 'aria-label': `Status of the enquiry from ${e.email}` });
  status.addEventListener('change', async () => {
    const previous = e.status;
    status.disabled = true;
    try {
      const { enquiry } = await api('/api/admin/enquiries', { method: 'PATCH', body: { id: e.id, status: status.value } });
      Object.assign(e, enquiry);
      flash(`Marked as ${LABELS.enquiryStatus[e.status].toLowerCase()}`);
      updateCounts();
      if ($('f-status').value) renderEnquiries(); // it may no longer match the filter
    } catch (err) {
      status.value = previous;
      flash(errorText(err), true);
    } finally {
      status.disabled = false;
    }
  });
  const reply = `mailto:${encodeURIComponent(e.email)}?subject=${encodeURIComponent('Re: your enquiry to cnpt')}`;
  return h('li', { class: 'row' },
    h('div', { class: 'row-meta' },
      h('time', { datetime: e.created_at }, fmtDate(e.created_at)),
      h('span', { class: 'chip' }, e.stage)),
    h('div', { class: 'row-main' },
      h('a', { class: 'row-email', href: reply }, e.email),
      h('span', { class: 'sub' }, e.client ? `Account: ${e.client.name || e.client.email}` : 'No account'),
      h('p', { class: 'msg' }, e.message)),
    h('div', { class: 'row-side' }, status));
}

function renderEnquiries() {
  const stage = $('f-stage').value;
  const status = $('f-status').value;
  const rows = state.enquiries.filter((e) => (!stage || e.stage === stage) && (!status || e.status === status));
  $('enquiries-meta').textContent = `${rows.length} of ${state.enquiries.length}`;
  $('enquiry-list').replaceChildren(...(rows.length
    ? rows.map(enquiryRow)
    : [h('li', { class: 'empty' }, state.enquiries.length ? 'No enquiries match these filters.' : 'No enquiries yet.')]));
}

/* ---------- projects ---------- */

function projectEditor(p) {
  const form = h('form', { class: 'card' },
    projectFields(p),
    h('div', { class: 'edit-foot' },
      h('span', { class: 'sub' },
        `${p.client ? `For ${p.client.name || p.client.email}` : 'No client yet'} · Updated ${fmtDate(p.updated_at)}`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => removeProject(p, form) }, 'Delete'),
        h('button', { class: 'btn btn-white btn-sm', type: 'submit' }, 'Save changes'))));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { project } = await api('/api/admin/projects', { method: 'PATCH', body: { id: p.id, ...readProject(form) } });
      state.projects = state.projects.map((x) => (x.id === project.id ? project : x));
      form.replaceWith(projectEditor(project)); // only this card, so edits in other cards are kept
      flash('Project saved');
    } catch (err) {
      flash(errorText(err), true);
      button.disabled = false;
    }
  });
  return form;
}

async function removeProject(p, form) {
  if (!confirm(`Delete “${p.title}”? The client will no longer see it.`)) return;
  try {
    await api(`/api/admin/projects?id=${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    state.projects = state.projects.filter((x) => x.id !== p.id);
    form.remove();
    if (!state.projects.length) renderProjects();
    updateCounts();
    flash('Project deleted');
  } catch (err) {
    flash(errorText(err), true);
  }
}

function renderProjects() {
  $('project-list').replaceChildren(...(state.projects.length
    ? state.projects.map(projectEditor)
    : [h('p', { class: 'empty' }, 'No projects yet. Create one above; pick the client once they have signed in.')]));
}

function setUpNewProject() {
  const form = $('new-project');
  $('new-project-fields').replaceChildren(projectFields({}));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const { project } = await api('/api/admin/projects', { method: 'POST', body: readProject(form) });
      const hadNone = !state.projects.length;
      state.projects.unshift(project);
      if (hadNone) renderProjects();
      else $('project-list').prepend(projectEditor(project));
      $('new-project-fields').replaceChildren(projectFields({}));
      updateCounts();
      flash('Project created');
    } catch (err) {
      flash(errorText(err), true);
    } finally {
      button.disabled = false;
    }
  });
}

/* ---------- members ---------- */

async function setRole(u, role) {
  const who = u.name || u.email;
  const question = role === 'admin'
    ? `Give ${who} admin access? They will see every enquiry, project and member.`
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

function memberRow(u) {
  const [kind, label] = u.owner ? ['owner', 'Owner'] : u.role === 'admin' ? ['admin', 'Admin'] : ['user', 'Member'];
  let action;
  if (u.owner) action = h('span', { class: 'sub' }, 'Set in ADMIN_EMAILS');
  else if (u.id === state.me) action = h('span', { class: 'sub' }, 'You');
  else action = h('button', { class: 'btn btn-line btn-sm', type: 'button', onclick: () => setRole(u, u.role === 'admin' ? 'user' : 'admin') },
    u.role === 'admin' ? 'Remove admin' : 'Make admin');
  return h('li', { class: 'row row-user' },
    avatar(u, true),
    h('div', { class: 'row-main' },
      h('strong', {}, u.name || u.email),
      h('span', { class: 'sub' }, `${u.email} · Joined ${fmtDate(u.created_at)} · Last sign-in ${fmtDate(u.last_login)}`)),
    h('span', { class: `badge badge-${kind}` }, label),
    action);
}

function renderMembers() {
  $('members-meta').textContent = `${state.users.length} ${state.users.length === 1 ? 'member' : 'members'}`;
  $('member-list').replaceChildren(...state.users.map(memberRow));
}

/* ---------- tabs ---------- */

function updateCounts() {
  const fresh = state.enquiries.filter((e) => e.status === 'new').length;
  $('count-enquiries').textContent = fresh ? `${fresh} new` : String(state.enquiries.length);
  $('count-projects').textContent = String(state.projects.length);
  $('count-members').textContent = String(state.users.length);
}

function showTab(name, focus) {
  for (const t of TABS) {
    const tab = $(`tab-${t}`);
    tab.setAttribute('aria-selected', String(t === name));
    tab.tabIndex = t === name ? 0 : -1;
    $(`panel-${t}`).hidden = t !== name;
  }
  if (focus) $(`tab-${name}`).focus();
  history.replaceState(null, '', `#${name}`);
}

function setUpTabs() {
  TABS.forEach((t, i) => {
    const tab = $(`tab-${t}`);
    tab.addEventListener('click', () => showTab(t));
    tab.addEventListener('keydown', (ev) => {
      const step = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
      if (step) showTab(TABS[(i + step + TABS.length) % TABS.length], true);
    });
  });
  const fromHash = location.hash.slice(1);
  showTab(TABS.includes(fromHash) ? fromHash : 'enquiries');
}

/* ---------- start ---------- */

function denied() {
  $('main').replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'page-head' },
      h('span', { class: 'eyebrow' }, 'admin'),
      h('h1', {}, 'Admins only.'),
      h('p', {}, 'This page is for the cnpt studio. ', h('a', { href: '/account' }, 'Go to your account'), '.'))));
}

const me = await signedInUser('/admin');
if (me) {
  renderNav(me, 'admin');
  if (me.role !== 'admin') {
    denied();
  } else {
    setUpTabs();
    FUNDING_STAGES.forEach((s) => $('f-stage').append(h('option', { value: s }, s)));
    Object.entries(LABELS.enquiryStatus).forEach(([v, label]) => $('f-status').append(h('option', { value: v }, label)));
    $('f-stage').addEventListener('change', renderEnquiries);
    $('f-status').addEventListener('change', renderEnquiries);
    try {
      const [e, p, u] = await Promise.all([
        api('/api/admin/enquiries'), api('/api/admin/projects'), api('/api/admin/users')
      ]);
      Object.assign(state, { enquiries: e.enquiries, projects: p.projects, users: u.users, me: u.me });
      setUpNewProject();
      renderEnquiries();
      renderProjects();
      renderMembers();
      updateCounts();
    } catch (err) {
      if (err.status === 403) denied();
      else $('enquiry-list').replaceChildren(h('li', { class: 'empty' }, 'The admin data could not be loaded. Please refresh the page.'));
    }
  }
}
