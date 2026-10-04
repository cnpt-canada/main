// The documentation, as a view inside /account. Eleven sections a client writes about their company —
// far too much for one sitting, so nothing here asks for one: every answer saves itself shortly after
// you stop typing, and the page can be left and come back to as often as it takes.
//
// The same view serves the studio. An admin opening /account?as=<id> gets it read-only, which is how
// every other part of this workspace already treats "view as user", so there is no second screen to
// keep in step with this one.
import { SECTIONS, MAX_ANSWER } from '/app/documentation-questions.js';
import { api, flash, fmtDate, h, icon } from '/app/common.js';

const QUESTIONS = SECTIONS.flatMap((s) => s.questions);
const SAVE_AFTER = 900;   // ms of quiet before an answer is sent

const state = { doc: null, answers: {}, viewingAs: null, pending: {}, timer: 0, saving: false };

const answeredCount = () => QUESTIONS.filter((q) => (state.answers[q.id] || '').trim()).length;

/* ---------- saving ---------- */

// Everything typed since the last save goes together, so a burst of edits is one request.
async function flush() {
  if (state.saving) return;
  const batch = state.pending;
  if (!Object.keys(batch).length) return;
  state.pending = {};
  state.saving = true;
  mark('saving');
  try {
    const { documentation } = await api('/api/documentation', { method: 'PUT', body: { answers: batch } });
    state.doc = documentation;
    mark('saved');
  } catch (err) {
    // put the unsaved answers back at the front of the queue so nothing is lost
    state.pending = { ...batch, ...state.pending };
    mark('failed');
    flash(err.message === 'invalid_answers' ? 'That answer is too long to save.' : 'That didn’t save. It will try again.', true);
  } finally {
    state.saving = false;
    if (Object.keys(state.pending).length) setTimeout(flush, 1200);
  }
}

function queue(id, value) {
  state.answers[id] = value;
  state.pending[id] = value;
  mark('typing');
  clearTimeout(state.timer);
  state.timer = setTimeout(flush, SAVE_AFTER);
  drawProgress();
}

let statusEl = null;
const STATUS = {
  typing: 'Saving…',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Not saved'
};
function mark(kind) {
  if (!statusEl) return;
  statusEl.textContent = STATUS[kind] || '';
  statusEl.className = 'doc-status' + (kind === 'failed' ? ' is-bad' : kind === 'saved' ? ' is-ok' : '');
}

/* ---------- the form ---------- */

function field(q) {
  const value = state.answers[q.id] || '';
  const id = 'q-' + q.id;
  if (state.viewingAs) {
    return h('div', { class: 'doc-q' },
      h('p', { class: 'doc-label' }, q.q),
      value
        ? h('p', { class: 'doc-answer' }, value)
        : h('p', { class: 'doc-answer is-blank' }, 'Not answered yet'));
  }
  const box = h('textarea', {
    class: 'textarea doc-field', id, rows: String(q.lines || 2),
    maxlength: String(MAX_ANSWER), value
  });
  box.value = value;
  box.addEventListener('input', () => queue(q.id, box.value));
  box.addEventListener('blur', () => { clearTimeout(state.timer); flush(); });
  return h('div', { class: 'doc-q' },
    h('label', { class: 'doc-label', for: id }, q.q),
    q.hint ? h('p', { class: 'doc-hint' }, q.hint) : null,
    box);
}

function sectionCard(s, n) {
  const done = s.questions.filter((q) => (state.answers[q.id] || '').trim()).length;
  return h('section', { class: 'card doc-section', id: 'doc-' + s.id, 'aria-labelledby': 'h-' + s.id },
    h('div', { class: 'card-head card-head-row' },
      h('h2', { id: 'h-' + s.id }, s.title),
      h('span', { class: 'sub' }, done + ' of ' + s.questions.length)),
    h('div', { class: 'card-body doc-body' },
      s.note ? h('p', { class: 'sub doc-note' }, s.note) : null,
      ...s.questions.map(field)));
}

let progressEl = null;
function drawProgress() {
  if (!progressEl) return;
  const done = answeredCount();
  const pct = Math.round((done / QUESTIONS.length) * 100);
  progressEl.replaceChildren(
    h('p', { class: 'reading-label' }, 'Answered'),
    h('p', { class: 'reading-value' }, done + ' of ' + QUESTIONS.length),
    // the page's style-src has no 'unsafe-inline', so the width is written through the CSSOM rather
    // than as a style attribute, the same way the focal bar does it
    h('div', { class: 'doc-bar', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' },
      (() => { const fill = h('span', {}); fill.style.width = pct + '%'; return fill; })()),
    h('p', { class: 'reading-note' }, state.doc?.submitted_at
      ? 'Sent ' + fmtDate(state.doc.submitted_at) + '. Changes since then are saved too.'
      : 'Nothing is sent until you say so. Everything is saved as you write.'));
  // the index keeps its own count in step
  SECTIONS.forEach((s) => {
    const link = document.querySelector('[data-index="' + s.id + '"] .doc-index-n');
    if (!link) return;
    const done2 = s.questions.filter((q) => (state.answers[q.id] || '').trim()).length;
    link.textContent = done2 + '/' + s.questions.length;
    link.parentElement.classList.toggle('is-done', done2 === s.questions.length);
  });
}

async function send(btn) {
  clearTimeout(state.timer);
  await flush();
  btn.disabled = true;
  try {
    const { documentation } = await api('/api/documentation', { method: 'POST' });
    state.doc = documentation;
    flash(documentation.submitted_at ? 'Sent to the cnpt team. You can still change anything.' : 'Sent.');
    drawProgress();
  } catch (err) {
    flash(err.message === 'nothing_to_send' ? 'Write at least one answer first.' : 'That didn’t send. Please try again.', true);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- the view ---------- */

export async function renderDocs(body, { viewingAs = null } = {}) {
  state.viewingAs = viewingAs;
  try {
    const { documentation } = await api('/api/documentation' + (viewingAs ? '?as=' + encodeURIComponent(viewingAs) : ''));
    state.doc = documentation;
    state.answers = { ...(documentation?.answers || {}) };
  } catch (err) {
    body.replaceChildren(h('p', { class: 'loading' },
      err.message === 'admin_only' ? 'Only the cnpt team can read someone else’s documentation.' : 'This could not be loaded.'));
    return;
  }

  const cards = SECTIONS.map((s, i) => sectionCard(s, i + 1));

  progressEl = h('div', { class: 'reading doc-progress' });
  statusEl = h('span', { class: 'doc-status' });

  const index = h('nav', { class: 'card doc-index', 'aria-label': 'Sections' },
    h('div', { class: 'card-head' }, h('h2', {}, 'Sections')),
    h('ol', {}, SECTIONS.map((s, i) => h('li', { 'data-index': s.id },
      h('a', { href: '#doc-' + s.id, onclick: (ev) => {
        ev.preventDefault();
        document.getElementById('doc-' + s.id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } }, h('span', { class: 'doc-index-i' }, String(i + 1).padStart(2, '0')), s.title),
      h('span', { class: 'doc-index-n' }, '0/' + s.questions.length)))));

  const rail = h('div', { class: 'project-rail col-4' }, progressEl, index);

  const main = h('div', { class: 'doc-main col-8' },
    ...(viewingAs ? [] : [h('div', { class: 'doc-top' }, statusEl)]),
    ...cards,
    viewingAs ? null : h('div', { class: 'doc-send' },
      h('p', { class: 'sub' }, 'Send it when you are ready. You can keep editing afterwards — we see the latest either way.'),
      (() => {
        const btn = h('button', { class: 'btn btn-signal', type: 'button' },
          state.doc?.submitted_at ? 'Send the update' : 'Send to the team', icon('arrow-right'));
        btn.addEventListener('click', () => send(btn));
        return btn;
      })()));

  body.replaceChildren(main, rail);
  drawProgress();
  mark(state.doc ? 'saved' : '');
  if (state.doc) mark('');
}
