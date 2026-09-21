// /account — the client's projects (with their stage), their enquiries, and their profile.
import {
  LABELS, PROJECT_STAGES, STAGE_ICONS,
  api, avatar, flash, fmtDate, h, icon, renderNav, signOut, signedInUser
} from '/app/common.js';

const $ = (id) => document.getElementById(id);

function projectCard(p) {
  const current = PROJECT_STAGES.indexOf(p.stage);
  const stepClass = (i) => (p.status === 'complete' || i < current ? 'done' : i === current ? 'now' : null);
  return h('article', { class: 'project' },
    h('div', { class: 'project-top' },
      h('div', {},
        h('h3', {}, p.title),
        h('p', { class: 'updated' }, `Updated ${fmtDate(p.updated_at)}`)),
      h('span', { class: `badge badge-${p.status}` }, LABELS.projectStatus[p.status])),
    h('ol', { class: 'track', 'aria-label': 'Project stage' },
      PROJECT_STAGES.map((stage, i) =>
        h('li', { class: stepClass(i), 'aria-current': i === current ? 'step' : null },
          h('span', { class: 'ic' }, icon(STAGE_ICONS[stage])),
          h('span', {}, LABELS.projectStage[stage])))),
    p.note
      ? h('div', { class: 'note' }, h('span', { class: 'note-label' }, 'From the studio'), h('p', {}, p.note))
      : null);
}

function enquiryRow(e) {
  return h('li', { class: 'row' },
    h('time', { datetime: e.created_at }, fmtDate(e.created_at)),
    h('div', { class: 'row-main' },
      h('span', { class: 'chip' }, e.stage),
      h('p', { class: 'msg' }, e.message)),
    h('span', { class: `badge badge-${e.status}` }, LABELS.enquiryStatus[e.status]));
}

function specRow(label, ...value) {
  return h('div', {}, h('dt', {}, label), h('dd', {}, ...value));
}

function render({ user, projects, enquiries }) {
  const first = (user.name || '').split(' ')[0];
  $('hello').textContent = first ? `Hello, ${first}.` : 'Your account';
  $('hello-sub').replaceChildren(avatar(user), h('span', {}, user.email));

  $('projects-meta').textContent = projects.length ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}` : '';
  $('projects').replaceChildren(...(projects.length
    ? projects.map(projectCard)
    : [h('p', { class: 'empty' }, 'No projects yet. Once we start working together, your project and its stage will appear here.')]));

  $('enquiries').replaceChildren(...(enquiries.length
    ? enquiries.map(enquiryRow)
    : [h('li', { class: 'empty' }, 'You have not sent an enquiry yet. ', h('a', { href: '/#contact' }, 'Tell us about your company'), '.')]));

  const rows = [
    specRow('Name', user.name || '—'),
    specRow('Email', user.email),
    specRow('Signed in with', 'Google'),
    specRow('Member since', fmtDate(user.created_at)),
    user.role === 'admin' && specRow('Access', 'Studio admin · ', h('a', { href: '/admin' }, 'Open admin'))
  ];
  $('profile').replaceChildren(...rows.filter(Boolean));
}

const user = await signedInUser('/account');
if (user) {
  renderNav(user, 'account');
  $('signout').addEventListener('click', signOut);
  $('delete').addEventListener('click', async () => {
    const ok = confirm('Delete your cnpt account? You will be signed out. Enquiries and project records stay with the studio.');
    if (!ok) return;
    try {
      await api('/api/account', { method: 'DELETE' });
      location.href = '/';
    } catch {
      flash('Your account could not be deleted. Please try again.', true);
    }
  });
  try {
    render(await api('/api/account'));
  } catch {
    $('projects').replaceChildren(h('p', { class: 'empty' }, 'Your account could not be loaded. Please refresh the page.'));
  }
}
