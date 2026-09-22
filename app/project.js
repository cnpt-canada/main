// The work after an enquiry, shared by /account and /admin: which stage it is in, the picture the cnpt team
// shares for that stage, the thread beside it (Project Owner and Consultant), and the meeting calendar.
import { avatar, h, icon } from '/app/common.js';

export const STAGES = [
  { key: 'frame', label: 'Frame', note: 'Interviews, an audit, and the brief rewritten' },
  { key: 'concept', label: 'Concept', note: 'Directions built far enough to judge' },
  { key: 'system', label: 'System', note: 'The chosen direction becomes a system' },
  { key: 'entry', label: 'Entry', note: 'The launch sequence, run with your team' }
];
export const stageIndex = (key) => Math.max(0, STAGES.findIndex((s) => s.key === key));
export const MEETING_TZ = 'America/Toronto';
export const MEETING_LENGTHS = [30, 60];
export const OPEN_HOUR = 9;
export const CLOSE_HOUR = 18;
export const MAX_COMMENT = 2000;

/* ---------- when ---------- */

const inToronto = (date, opts) => new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, ...opts }).format(date);
export const clockAt = (date) => inToronto(date, { hour: '2-digit', minute: '2-digit', hour12: false });
export const dayAt = (date) => inToronto(date, { weekday: 'long', month: 'long', day: 'numeric' });

// "Thursday, September 25 · 10:00–11:00 (Toronto)", plus the reader's own time when they are elsewhere.
export function slotText(startsAt, minutes) {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60000);
  const here = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const mine = here && here !== MEETING_TZ
    ? ` · ${new Intl.DateTimeFormat('en-CA', { hour: '2-digit', minute: '2-digit', hour12: false }).format(start)} your time`
    : '';
  return `${dayAt(start)} · ${clockAt(start)}–${clockAt(end)} (Toronto)${mine}`;
}

// The Monday of the week a date falls in, in Toronto, as a UTC instant at 00:00 Toronto.
export function weekStart(date) {
  const day = inToronto(date, { weekday: 'short' });
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(day);
  const at = new Date(date.getTime() - (back < 0 ? 0 : back) * 86400000);
  return slotOn(at, OPEN_HOUR, 0);
}

// The instant for a wall-clock time in Toronto on the day `date` falls on.
export function slotOn(date, hour, minute) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  const wanted = `${ymd.year}-${ymd.month}-${ymd.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  // Toronto is behind UTC, so try both offsets and keep the one that reads back as the time we asked for
  for (const offset of [4, 5]) {
    const guess = new Date(`${wanted}:00.000Z`);
    guess.setUTCHours(guess.getUTCHours() + offset);
    if (clockAt(guess) === wanted.slice(-5)) return guess;
  }
  return new Date(`${wanted}:00.000Z`);
}

/* ---------- process ---------- */

// The picture for the stage the work is in, with the stage on top of it.
export function processThumbnail(process, imageUrl, { alt = '' } = {}) {
  const stage = STAGES[stageIndex(process?.stage)];
  return h('div', { class: 'thumb' },
    imageUrl
      ? h('img', { class: 'thumb-img', src: imageUrl, alt, loading: 'lazy' })
      : h('div', { class: 'thumb-empty' }, icon('folder'), h('span', {}, process ? 'No picture yet' : 'Not started yet')),
    process && h('span', { class: 'thumb-stage' }, stage.label));
}

// Frame → Concept → System → Entry, with the one the work is in marked.
export function stageTracker(stageKey) {
  const at = stageIndex(stageKey);
  return h('ol', { class: 'stage-track' }, STAGES.map((s, i) => h('li', {
    class: i < at ? 'done' : i === at ? 'now' : null, 'aria-current': i === at ? 'step' : null
  },
  h('span', { class: 'stage-dot', 'aria-hidden': 'true' }, i < at ? icon('check') : String(i + 1)),
  h('span', { class: 'stage-text' }, h('strong', {}, s.label), h('span', { class: 'sub' }, s.note)))));
}

/* ---------- thread ---------- */

const ago = (iso) => {
  const seconds = Math.round((Date.now() - Date.parse(iso)) / 1000);
  const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [7, 'day'], [4.35, 'week'], [12, 'month']];
  let value = seconds, unit = 'second';
  for (const [size, name] of steps) {
    if (Math.abs(value) < size) break;
    value = Math.round(value / size);
    unit = steps[steps.findIndex((s) => s[1] === name) + 1]?.[1] ?? name;
  }
  return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(-value, unit);
};

// One comment: who wrote it, what they are on this project, when, and the text.
function commentRow(comment, { canDelete, onDelete }) {
  const who = comment.author || { name: 'Someone who left', email: '', title: '—' };
  return h('li', { class: 'note', 'data-id': comment.id },
    avatar(who),
    h('div', { class: 'note-body' },
      h('p', { class: 'note-head' },
        h('strong', {}, who.name || who.email || 'Someone'),
        h('span', { class: `note-title note-title-${who.title === 'Consultant' ? 'team' : 'owner'}` }, who.title),
        h('time', { class: 'sub', datetime: comment.created_at, title: new Date(comment.created_at).toLocaleString('en-CA') }, ago(comment.created_at))),
      h('p', { class: 'note-text' }, comment.body)),
    canDelete && h('button', { class: 'icon-btn note-remove', type: 'button', 'aria-label': 'Delete this note', onclick: () => onDelete(comment) }, icon('x')));
}

// The thread under the process: everything written so far, and a box to add to it.
// `onSend(text)` should save and return the new comment; `onDelete(comment)` removes one.
export function commentThread({ comments, me, onSend, onDelete, readOnly = false, placeholder = 'Write a note…' }) {
  const list = h('ul', { class: 'notes' });
  const draw = () => list.replaceChildren(...(comments.length
    ? comments.map((c) => commentRow(c, { canDelete: !readOnly && (me?.role === 'admin' || c.author?.id === me?.id), onDelete }))
    : [h('li', { class: 'notes-empty' }, 'Nothing here yet. Notes you leave stay with your project.')]));
  draw();
  if (readOnly) return h('div', { class: 'thread' }, list);

  const field = h('textarea', { class: 'textarea note-field', rows: '2', maxlength: String(MAX_COMMENT), placeholder, 'aria-label': 'Write a note' });
  const send = h('button', { class: 'btn btn-white btn-sm', type: 'submit', disabled: true }, 'Post', icon('arrow-right'));
  const sync = () => { send.disabled = !field.value.trim(); };
  field.addEventListener('input', sync);
  field.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); form.requestSubmit(); }
  });
  const form = h('form', { class: 'note-add' }, field,
    h('div', { class: 'note-add-foot' }, h('span', { class: 'sub' }, 'Everyone on this project can see it'), send));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = field.value.trim();
    if (!text) return;
    send.disabled = true;
    const added = await onSend(text);
    if (added) {
      comments.push(added);
      field.value = '';
      draw();
    }
    sync();
    field.focus();
  });
  return h('div', { class: 'thread' }, list, form);
}

/* ---------- calendar ---------- */

const SLOT_MINUTES = 30;
const slotsPerDay = ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES;

// Mon–Fri, 09:00–18:00 in half hours: tap a slot to place a block, drag down to make it an hour.
// `onPick({ startsAt, minutes })` runs whenever the block moves; `busy` greys out what is already booked.
export function meetingCalendar({ busy = [], minutes = 30, onPick, from = new Date() }) {
  let start = weekStart(from);
  let picked = null;
  let length = minutes;

  const grid = h('div', { class: 'cal-grid' });
  const title = h('p', { class: 'cal-title' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous week' }, icon('arrow-left'));
  const forward = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next week' }, icon('arrow-right'));
  back.addEventListener('click', () => { start = new Date(start.getTime() - 7 * 86400000); draw(); });
  forward.addEventListener('click', () => { start = new Date(start.getTime() + 7 * 86400000); draw(); });

  const taken = (at, mins) => busy.some((m) =>
    at.getTime() < Date.parse(m.starts_at) + m.minutes * 60000 && Date.parse(m.starts_at) < at.getTime() + mins * 60000);

  function place(at, mins) {
    if (taken(at, mins) || at.getTime() < Date.now()) return;
    const endsBy = (Number(clockAt(at).slice(0, 2)) * 60) + Number(clockAt(at).slice(3)) + mins;
    if (endsBy > CLOSE_HOUR * 60) return;
    picked = { startsAt: at.toISOString(), minutes: mins };
    length = mins;
    draw();
    onPick?.(picked);
  }

  function draw() {
    const days = [0, 1, 2, 3, 4].map((d) => new Date(start.getTime() + d * 86400000));
    title.textContent = `${inToronto(days[0], { month: 'long', day: 'numeric' })} – ${inToronto(days[4], { month: 'long', day: 'numeric', year: 'numeric' })}`;
    back.disabled = days[0].getTime() < Date.now() - 7 * 86400000;
    const rows = [h('div', { class: 'cal-corner', 'aria-hidden': 'true' }),
      ...days.map((d) => h('div', { class: 'cal-day' }, h('strong', {}, inToronto(d, { weekday: 'short' })), h('span', {}, inToronto(d, { day: 'numeric' }))))];
    for (let i = 0; i < slotsPerDay; i++) {
      const hour = OPEN_HOUR + Math.floor(i / 2);
      const minute = i % 2 ? 30 : 0;
      rows.push(h('div', { class: minute ? 'cal-time cal-time-half' : 'cal-time' }, minute ? '' : `${String(hour).padStart(2, '0')}:00`));
      for (const day of days) {
        const at = slotOn(day, hour, minute);
        const gone = at.getTime() < Date.now();
        const busyHere = taken(at, SLOT_MINUTES);
        const inPick = picked && at.getTime() >= Date.parse(picked.startsAt) && at.getTime() < Date.parse(picked.startsAt) + picked.minutes * 60000;
        const cell = h('button', {
          class: `cal-slot${busyHere ? ' is-taken' : ''}${inPick ? ' is-picked' : ''}`, type: 'button',
          disabled: gone || busyHere, 'data-at': at.toISOString(), 'aria-pressed': String(Boolean(inPick)),
          'aria-label': `${dayAt(at)}, ${clockAt(at)}${busyHere ? ', already taken' : gone ? ', past' : ''}`
        }, inPick && at.getTime() === Date.parse(picked.startsAt) ? h('span', { class: 'cal-block' }, `${picked.minutes} min`) : null);
        cell.addEventListener('pointerdown', (ev) => {
          if (ev.button !== 0 || cell.disabled) return;
          ev.preventDefault();
          cell.setPointerCapture(ev.pointerId);
          place(at, length);
          const move = (e) => {
            const over = document.elementFromPoint(e.clientX, e.clientY);
            const to = over?.closest('.cal-slot')?.dataset.at;
            if (!to) return;
            const mins = Math.round((Date.parse(to) - at.getTime()) / 60000) + SLOT_MINUTES;
            place(at, MEETING_LENGTHS.includes(mins) ? mins : mins > 60 ? 60 : 30);
          };
          const up = () => { cell.removeEventListener('pointermove', move); cell.removeEventListener('pointerup', up); };
          cell.addEventListener('pointermove', move);
          cell.addEventListener('pointerup', up);
        });
        cell.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); place(at, length); }
        });
        rows.push(cell);
      }
    }
    grid.replaceChildren(...rows);
  }
  draw();

  return {
    el: h('div', { class: 'cal' },
      h('div', { class: 'cal-head' }, back, title, forward),
      grid,
      h('p', { class: 'hint' }, 'Tap a time to place your meeting, or drag down to make it an hour. Weekdays, 09:00–18:00 Toronto time.')),
    setLength(mins) { length = mins; if (picked) place(new Date(picked.startsAt), mins); },
    clear() { picked = null; draw(); },
    refresh(next) { busy = next; draw(); }
  };
}

/* ---------- pictures ---------- */

// Shrinks a picked image in the browser so uploads stay small, and hands back what /api/admin/process wants.
export async function readImage(file, max = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  const data = await new Promise((done) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
  return { type: 'image/jpeg', data, width: canvas.width, height: canvas.height };
}
