// /onboarding — the step-by-step enquiry: company, field, consultants, confirm. A new client sees it right after
// signing up, after a welcome screen; afterwards "New enquiry" opens the same steps without the welcome.
// Each step is saved when you continue, so leaving and coming back picks up where you stopped. Sending it
// creates the enquiry (or completes the one sent from the website). Admins can open /onboarding?preview.
import {
  CONSULTANTS, FIELD_TAGS, FUNDING_STAGES, MAX_TAG, MAX_TAGS,
  api, consultantAvatar, estimateBlock, firstNames, flash, fmtDate, h, icon, signedInUser
} from '/app/common.js';

const $ = (id) => document.getElementById(id);
const MAX_BRIEF = 500;
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} &+./-]*$/u;
const STEPS = ['Your company', 'Your field', 'Consultants', 'Confirm'];
const ERRORS = {
  invalid_tags: 'One of the tags isn’t allowed. Use letters, numbers, spaces and & + . / -',
  incomplete: 'Something is missing. Go back and check each step.',
  signin_required: 'Your session ended. Sign in again.'
};
const errorText = (err) => ERRORS[err.message] || 'That didn’t save. Please try again.';

const state = {
  user: null, preview: false, draft: null, fromDraft: false, returning: false, firstRun: true, enquiryId: null,
  stage: '', brief: '', enquiry_id: null, tags: [], consultants: [], resume: 1
};

/* ---------- saving ---------- */

// What each step contributes, only what has a value (so a half-filled step still saves on exit).
function fieldsFor(step) {
  if (step === 1) {
    const f = {};
    if (state.stage) f.stage = state.stage;
    if (state.brief.trim()) f.brief = state.brief.trim();
    if (state.enquiry_id) f.enquiry_id = state.enquiry_id;
    return f;
  }
  if (step === 2) return { tags: state.tags };
  if (step === 3) return { consultants: state.consultants };
  return {};
}

async function save(fields) {
  if (state.preview) return;
  await api('/api/onboarding', { method: 'PUT', body: fields });
}

// The furthest step the answers so far allow.
function reachable() {
  if (!state.stage || !state.brief.trim()) return 1;
  if (!state.tags.length) return 2;
  if (!state.consultants.length) return 3;
  return 4;
}

/* ---------- layout ---------- */

function progress(current) {
  const el = $('progress');
  el.hidden = current < 1 || current > 4;
  el.replaceChildren(...STEPS.map((label, i) => {
    const n = i + 1;
    const cls = n < current ? 'done' : n === current ? 'now' : null;
    return h('li', { class: cls, 'aria-current': n === current ? 'step' : null },
      n < current ? icon('check') : h('span', { class: 'onb-num' }, n), h('span', { class: 'onb-label' }, label));
  }));
}

function stepFrame(step, title, lede, content, { next = 'Continue', canContinue = () => true, onNext } = {}) {
  const nextBtn = h('button', { class: 'btn btn-white btn-lg', type: 'submit' }, next, icon('arrow-right'));
  const form = h('form', { class: 'onb-step', 'aria-labelledby': 'step-h', novalidate: true },
    h('span', { class: 'onb-kicker' }, `Step ${step} of 4`),
    h('h1', { id: 'step-h', tabindex: '-1' }, title),
    h('p', { class: 'onb-lede' }, lede),
    h('div', { class: 'onb-body' }, content),
    h('div', { class: 'onb-actions' },
      h('button', { class: 'btn btn-line btn-lg', type: 'button', onclick: () => {
        // after the first run there is no welcome screen to go back to
        if (step === 1 && !state.firstRun) location.href = '/account#enquiries'; else go(step - 1);
      } }, icon('arrow-left'), 'Back'),
      nextBtn));
  const sync = () => { nextBtn.disabled = !canContinue(); };
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!canContinue()) return;
    nextBtn.disabled = true;
    try {
      await onNext();
    } catch (err) {
      flash(errorText(err), true);
      nextBtn.disabled = false;
    }
  });
  form.sync = sync;
  sync();
  return form;
}

/* ---------- 0. welcome ---------- */

function wordmark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'splash-mark');
  svg.setAttribute('viewBox', '0 0 140 32');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '/app/icons.svg#cnpt');
  svg.append(use);
  return svg;
}

function splash() {
  const first = (state.user.name || '').split(' ')[0];
  return h('section', { class: 'splash', 'aria-labelledby': 'step-h' },
    wordmark(),
    h('div', { class: 'splash-copy' },
      h('h1', { id: 'step-h', tabindex: '-1' }, state.returning ? `Welcome back${first ? `, ${first}` : ''}.` : `Welcome to cnpt${first ? `, ${first}` : ''}.`),
      h('p', {}, state.returning
        ? 'Your answers are saved. Pick up where you left off.'
        : 'Four short steps so we can prepare before your first call. It takes about two minutes.'),
      h('ol', { class: 'splash-steps' }, STEPS.map((s, i) => h('li', {}, h('span', {}, i + 1), s))),
      h('button', { class: 'btn btn-white btn-lg', type: 'button', onclick: () => go(Math.min(state.resume, reachable())) },
        state.returning ? 'Continue' : 'Let’s start', icon('arrow-right'))));
}

/* ---------- 1. company ---------- */

function stepCompany() {
  const counter = h('span', { class: 'onb-count' });
  const brief = h('textarea', { class: 'textarea', id: 'brief', rows: '5', maxlength: String(MAX_BRIEF), required: true,
    placeholder: 'A few lines on your product, where it is today, and what you need from us.' });
  brief.value = state.brief;
  const count = () => { counter.textContent = `${brief.value.length} / ${MAX_BRIEF}`; };
  brief.addEventListener('input', () => { state.brief = brief.value; count(); });
  count();

  const stages = h('div', { class: 'pill-options' }, FUNDING_STAGES.map((s) => {
    const input = h('input', { type: 'radio', name: 'stage', value: s, checked: state.stage === s, required: true });
    input.addEventListener('change', () => { state.stage = s; });
    return h('label', { class: 'pill-option' }, input, h('span', {}, s));
  }));

  const note = state.fromDraft && state.draft && h('div', { class: 'onb-note' }, icon('inbox'),
    h('p', {}, `We found the enquiry you sent on ${fmtDate(state.draft.created_at)} and filled it in below. Change anything you like, then continue.`));

  return stepFrame(1, 'Tell us about your company', 'Where you are, and what you are building.', [
    note,
    h('fieldset', { class: 'onb-field' }, h('legend', {}, 'Funding stage', h('span', { class: 'req' }, ' *')), stages),
    h('div', { class: 'onb-field' },
      h('label', { for: 'brief' }, 'Your brief', h('span', { class: 'req' }, ' *')), brief, counter)
  ], {
    canContinue: () => Boolean(state.stage && state.brief.trim()),
    onNext: async () => { await save({ ...fieldsFor(1), step: 2 }); go(2); }
  });
}

/* ---------- 2. field ---------- */

function stepField() {
  let form;
  const counter = h('span', { class: 'onb-count' });
  const chips = h('div', { class: 'tag-grid', role: 'group', 'aria-label': 'Fields' });
  const input = h('input', { class: 'input input-pill', id: 'tag-new', type: 'text', maxlength: String(MAX_TAG), autocomplete: 'off',
    placeholder: 'Add your own, e.g. Agritech' });
  const addBtn = h('button', { class: 'btn btn-line', type: 'button' }, icon('plus'), 'Add');
  const hint = h('p', { class: 'onb-hint', id: 'tag-hint' });

  const has = (t) => state.tags.some((x) => x.toLowerCase() === t.toLowerCase());
  const render = () => {
    const focused = chips.contains(document.activeElement) ? document.activeElement.dataset.tag : null;
    const full = state.tags.length >= MAX_TAGS;
    const all = [...FIELD_TAGS, ...state.tags.filter((t) => !FIELD_TAGS.some((f) => f.toLowerCase() === t.toLowerCase()))];
    chips.replaceChildren(...all.map((t) => {
      const on = has(t);
      return h('button', { class: 'tag-chip', type: 'button', 'data-tag': t, 'aria-pressed': String(on), disabled: !on && full,
        onclick: () => { state.tags = on ? state.tags.filter((x) => x.toLowerCase() !== t.toLowerCase()) : [...state.tags, t]; render(); } },
      h('span', { class: 'tag-hash', 'aria-hidden': 'true' }, '#'), t);
    }));
    if (focused) [...chips.children].find((c) => c.dataset.tag === focused && !c.disabled)?.focus();
    counter.textContent = `${state.tags.length} / ${MAX_TAGS} selected`;
    input.disabled = full;
    addBtn.disabled = full;
    hint.textContent = full ? `That’s ${MAX_TAGS}. Remove one to pick another.` : '';
    form?.sync();
  };
  const add = () => {
    const tag = input.value.replace(/^#/, '').replace(/\s+/g, ' ').trim();
    if (!tag) return;
    if (!TAG_RE.test(tag)) { hint.textContent = 'Use letters, numbers, spaces and & + . / -'; return; }
    if (!has(tag)) state.tags = [...state.tags, tag];
    input.value = '';
    render();
    input.focus();
  };
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });

  form = stepFrame(2, 'What field are you in?', `Pick up to ${MAX_TAGS}. We use them to match you with the right people and past work.`, [
    h('div', { class: 'onb-field' }, h('div', { class: 'onb-field-head' }, h('span', { class: 'onb-legend' }, 'Fields'), counter), chips),
    h('div', { class: 'onb-field' }, h('label', { for: 'tag-new' }, 'Something else?'),
      h('div', { class: 'tag-add' }, input, addBtn), hint)
  ], {
    canContinue: () => state.tags.length > 0,
    onNext: async () => { await save({ ...fieldsFor(2), step: 3 }); go(3); }
  });
  render();
  return form;
}

/* ---------- 3. consultant ---------- */

function stepConsultant() {
  const cards = h('div', { class: 'consultants' }, Object.entries(CONSULTANTS).map(([key, c]) => {
    const input = h('input', { type: 'checkbox', name: 'consultants', value: key, checked: state.consultants.includes(key) });
    input.addEventListener('change', () => {
      state.consultants = input.checked ? [...state.consultants, key] : state.consultants.filter((k) => k !== key);
    });
    return h('label', { class: 'consultant' }, input,
      h('span', { class: 'consultant-check', 'aria-hidden': 'true' }, icon('check')),
      consultantAvatar(key, true),
      h('strong', {}, c.name),
      h('span', { class: 'sub' }, c.role));
  }));
  return stepFrame(3, 'Choose your consultants', 'Pick one or more. They review your brief and lead your first call.', [
    h('fieldset', { class: 'onb-field' }, h('legend', { class: 'sr-only' }, 'Consultants'), cards)
  ], {
    canContinue: () => state.consultants.length > 0,
    onNext: async () => { await save({ ...fieldsFor(3), step: 4 }); go(4); }
  });
}

/* ---------- 4. confirm ---------- */

function stepConfirm() {
  const edit = (step) => h('button', { class: 'link', type: 'button', onclick: () => go(step) }, 'Edit');
  const row = (label, value, step) => h('div', {}, h('dt', {}, label), h('dd', {}, value), step ? edit(step) : h('span'));
  return stepFrame(4, 'Check and confirm', 'This goes to the consultants you picked. You can add more detail on your first call.', [
    h('dl', { class: 'onb-summary' },
      row('Company', [h('span', { class: 'chip' }, state.stage), h('p', { class: 'msg' }, state.brief.trim())], 1),
      row('Fields', h('div', { class: 'tag-list' }, state.tags.map((t) => h('span', { class: 'tag-chip tag-static' }, h('span', { class: 'tag-hash' }, '#'), t))), 2),
      row(state.consultants.length > 1 ? 'Consultants' : 'Consultant', h('div', { class: 'who-list' }, state.consultants.map((k) => h('div', { class: 'who' },
        consultantAvatar(k), h('span', { class: 'who-text' }, h('strong', {}, CONSULTANTS[k].name), h('span', { class: 'sub' }, CONSULTANTS[k].role))))), 3),
      row('Estimated cost', estimateBlock(null, state.consultants)))
  ], {
    next: 'Confirm and finish',
    canContinue: () => reachable() === 4,
    onNext: async () => {
      if (!state.preview) state.enquiryId = (await api('/api/onboarding', { method: 'POST' })).enquiry_id;
      done();
    }
  });
}

function done() {
  progress(5);
  history.replaceState(null, '', location.pathname + location.search + '#done');
  $('main').replaceChildren(h('section', { class: 'onb-done', 'aria-labelledby': 'step-h' },
    h('span', { class: 'onb-done-mark' }, icon('check')),
    h('h1', { id: 'step-h', tabindex: '-1' }, state.firstRun ? 'You’re all set.' : 'Enquiry sent.'),
    h('p', {}, `${firstNames(state.consultants) || 'Your consultant'} will review your brief and confirm an estimate on your enquiry.`),
    state.preview
      ? h('a', { class: 'btn btn-white btn-lg', href: '/admin#onboarding' }, 'Back to the workspace')
      : h('a', { class: 'btn btn-white btn-lg', href: `/account#enquiries${state.enquiryId ? `/${state.enquiryId}` : ''}` },
        state.firstRun ? 'Go to your workspace' : 'See your enquiry', icon('arrow-right'))));
  $('step-h').focus();
}

/* ---------- navigation ---------- */

// Steps live in the address bar (#step-2) so the browser's back button moves between them.
function go(step) {
  location.hash = step < 1 ? 'welcome' : `step-${step}`;
}

function show() {
  const m = location.hash.match(/^#step-([1-4])$/);
  // the welcome screen is only for the first run; afterwards "New enquiry" starts at the step you reached
  const step = m ? Math.min(Number(m[1]), reachable()) : state.firstRun ? 0 : Math.min(state.resume, reachable());
  progress(step);
  const view = [splash, stepCompany, stepField, stepConsultant, stepConfirm][step]();
  $('main').replaceChildren(view);
  $('step-h').focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

/* ---------- start ---------- */

const user = await signedInUser(`/onboarding${location.search}`);
if (user) {
  state.user = user;
  state.preview = user.role === 'admin' && new URLSearchParams(location.search).has('preview');
  let ready = true;
  if (state.preview) {
    $('preview').hidden = false;
    $('exit').textContent = 'Exit preview';
    $('exit').href = '/admin#onboarding';
  } else {
    try {
      const { onboarding, draft } = await api('/api/onboarding');
      state.firstRun = !onboarding?.submitted_at;
      if (!state.firstRun) {
        document.title = 'New enquiry — cnpt';
        $('exit').href = '/account#enquiries';
      }
      {
        if (onboarding) {
          Object.assign(state, {
            stage: onboarding.stage || '', brief: onboarding.brief || '', enquiry_id: onboarding.enquiry_id,
            tags: onboarding.tags || [], consultants: onboarding.consultants || [], resume: onboarding.step || 1
          });
          state.returning = Boolean(onboarding.stage || onboarding.brief || onboarding.tags?.length);
        }
        state.draft = draft;
        if (draft && !state.brief) {
          Object.assign(state, { stage: state.stage || draft.stage, brief: draft.message, enquiry_id: draft.id, fromDraft: true });
        }
      }
    } catch {
      ready = false;
      $('main').replaceChildren(h('p', { class: 'loading' }, 'This could not be loaded. Please refresh the page.'));
    }
    // leaving mid-step keeps what's filled in
    $('exit').addEventListener('click', async (ev) => {
      ev.preventDefault();
      const m = location.hash.match(/^#step-([1-3])$/);
      try { if (m) await save(fieldsFor(Number(m[1]))); } catch { /* keep what was saved before */ }
      location.href = state.firstRun ? '/' : '/account#enquiries';
    });
  }
  if (ready) {
    // open on the welcome screen (first run) or the step you reached; the address bar follows
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    window.addEventListener('hashchange', show);
    show();
  }
}
