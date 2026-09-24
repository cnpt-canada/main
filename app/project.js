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

// Building a date formatter is slow, and the calendar asks for the same handful over and over
// (ninety cells, repainted on every step of a drag), so each one is made once and kept.
const FORMATS = new Map();
function torontoFormat(opts) {
  const key = JSON.stringify(opts);
  let made = FORMATS.get(key);
  if (!made) FORMATS.set(key, made = new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, ...opts }));
  return made;
}
const inToronto = (date, opts) => torontoFormat(opts).format(date);
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

// The instant for a wall-clock time in Toronto on the day `date` falls on.
export function slotOn(date, hour, minute) {
  const ymd = torontoFormat({ year: 'numeric', month: '2-digit', day: '2-digit' })
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
  const rowFor = (c) => commentRow(c, { canDelete: !readOnly && (me?.role === 'admin' || c.author?.id === me?.id), onDelete });
  const draw = () => list.replaceChildren(...(comments.length
    ? comments.map(rowFor)
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
      const first = comments.length === 0;
      comments.push(added);
      field.value = '';
      // the new note arrives on its own, rather than the whole thread being drawn again under the reader
      const row = rowFor(added);
      row.classList.add('note-new');
      if (first) list.replaceChildren(row); else list.append(row);
    }
    sync();
    field.focus();
  });
  return h('div', { class: 'thread' }, list, form);
}

/* ---------- calendar ---------- */

const SLOT_MINUTES = 30;
const SLOTS_PER_DAY = ((CLOSE_HOUR - OPEN_HOUR) * 60) / SLOT_MINUTES;
const DAYS_ON_SHOW = 5;

const isWeekend = (date) => ['Sat', 'Sun'].includes(inToronto(date, { weekday: 'short' }));

// The working day `step` days on from here (backwards when step is negative), as 09:00 in Toronto.
function nextWeekday(from, step) {
  let at = from;
  do { at = slotOn(new Date(at.getTime() + step * 86400000), OPEN_HOUR, 0); } while (isWeekend(at));
  return at;
}

// The first working day on or after `date` — today, unless today is the weekend.
export function firstWeekday(date) {
  const at = slotOn(date, OPEN_HOUR, 0);
  return isWeekend(at) ? nextWeekday(at, 1) : at;
}

// Five working days across, 09:00–18:00 in half hours, starting with today. Tap a slot to place the
// meeting, drag down the same day to make it an hour. The days are built once and repainted in place, so a
// drag never loses the cell under the pointer. `busy` greys out what is gone, `mine` marks the times this
// person already booked, and anything longer than half an hour is drawn as one block rather than two.
// `onPick({ startsAt, minutes })` runs whenever the block moves.
export function meetingCalendar({ busy = [], mine = [], minutes = 30, onPick, from = new Date() }) {
  const today = firstWeekday(from);
  let firstDay = today;
  let picked = null;
  let length = minutes;
  let cells = [];
  const byEl = new Map(); // which cell a button belongs to, for the hit test during a drag

  const grid = h('div', { class: 'cal-grid' });
  const title = h('p', { class: 'cal-title' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Earlier days' }, icon('arrow-left'));
  const forward = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Later days' }, icon('arrow-right'));
  const shift = (step) => {
    let at = firstDay;
    for (let i = 0; i < DAYS_ON_SHOW; i++) at = nextWeekday(at, step);
    firstDay = at.getTime() < today.getTime() ? today : at;
    build();
  };
  back.addEventListener('click', () => shift(-1));
  forward.addEventListener('click', () => shift(1));

  const overlaps = (aFrom, aMins, bFrom, bMins) =>
    aFrom < bFrom + bMins * 60000 && bFrom < aFrom + aMins * 60000;
  const takenBy = (list, at, mins) => list.some((m) => overlaps(at.getTime(), mins, Date.parse(m.starts_at), m.minutes));
  const isTaken = (at, mins) => takenBy(busy, at, mins);
  // The booking covering this half hour, so a longer one can be drawn as a single block.
  const coverAt = (list, time) => list.find((m) => time >= Date.parse(m.starts_at) && time < Date.parse(m.starts_at) + m.minutes * 60000);

  // Can a meeting of `mins` start here? It has to be free, ahead of now, and finish before the day closes.
  function canPlace(at, mins) {
    if (at.getTime() < Date.now() || isTaken(at, mins)) return false;
    const closes = slotOn(at, CLOSE_HOUR, 0);
    return at.getTime() + mins * 60000 <= closes.getTime();
  }

  function place(at, mins) {
    const want = MEETING_LENGTHS.includes(mins) ? mins : SLOT_MINUTES;
    const fits = canPlace(at, want) ? want : canPlace(at, SLOT_MINUTES) ? SLOT_MINUTES : null;
    if (fits === null) return;
    if (picked && Date.parse(picked.startsAt) === at.getTime() && picked.minutes === fits) return;
    picked = { startsAt: at.toISOString(), minutes: fits };
    length = fits;
    paint();
    onPick?.(picked);
  }

  // Updates the cells that are already on screen; never rebuilds them. A drag repaints on every step,
  // so each cell remembers how it was last left and the ones that have not changed are skipped.
  // An hour covers two cells: the first carries the label, and the run classes close the seam between
  // them so what you see is a single block.
  function paint() {
    const now = Date.now();
    const pickFrom = picked ? Date.parse(picked.startsAt) : 0;
    const pickTo = picked ? pickFrom + picked.minutes * 60000 : 0;
    const step = SLOT_MINUTES * 60000;
    for (const cell of cells) {
      const { el, at } = cell;
      const time = at.getTime();
      const past = time < now;                                  // a meeting cannot start in the past, as the server also says
      const mineAt = coverAt(mine, time);
      const busyAt = mineAt || coverAt(busy, time);
      const inPick = Boolean(picked) && time >= pickFrom && time < pickTo;
      // where this cell sits inside the block it belongs to
      const run = inPick
        ? { from: pickFrom, minutes: picked.minutes }
        : mineAt ? { from: Date.parse(mineAt.starts_at), minutes: mineAt.minutes } : null;
      const runStart = Boolean(run) && time === run.from;
      const runEnd = Boolean(run) && time + step >= run.from + run.minutes * 60000;
      const label = !runStart ? '' : inPick ? `${picked.minutes} min` : 'Yours';
      const state = `${past ? 'p' : ''}${busyAt ? 'b' : ''}${mineAt ? 'm' : ''}${inPick ? 'k' : ''}${runStart ? 's' : ''}${runEnd ? 'e' : ''}|${label}`;
      if (state === cell.state) continue;
      cell.state = state;
      el.disabled = past || Boolean(busyAt);
      el.classList.toggle('is-past', past && !busyAt);
      el.classList.toggle('is-taken', Boolean(busyAt) && !mineAt);
      el.classList.toggle('is-mine', Boolean(mineAt));
      el.classList.toggle('is-picked', inPick);
      el.classList.toggle('is-run-start', runStart);
      el.classList.toggle('is-run-end', runEnd);
      el.classList.toggle('is-span2', runStart && !runEnd);     // the label is centred over both halves
      el.setAttribute('aria-pressed', String(inPick));
      el.setAttribute('aria-label', `${cell.when}${mineAt ? ', yours' : busyAt ? ', already taken' : past ? ', past' : ''}`);
      el.firstChild.textContent = label;
      el.firstChild.hidden = !label;
    }
  }

  function build() {
    const days = [firstDay];
    while (days.length < DAYS_ON_SHOW) days.push(nextWeekday(days[days.length - 1], 1));
    title.textContent = `${inToronto(days[0], { month: 'long', day: 'numeric' })} – ${inToronto(days[DAYS_ON_SHOW - 1], { month: 'long', day: 'numeric', year: 'numeric' })}`;
    back.disabled = firstDay.getTime() <= today.getTime();      // today is as far back as the calendar goes
    cells = [];
    byEl.clear();
    const rows = [h('div', { class: 'cal-corner', 'aria-hidden': 'true' }),
      ...days.map((d) => {
        const isToday = d.getTime() === today.getTime();
        return h('div', { class: isToday ? 'cal-day is-today' : 'cal-day' },
          h('strong', {}, isToday ? 'Today' : inToronto(d, { weekday: 'short' })),
          h('span', {}, isToday ? inToronto(d, { weekday: 'short', day: 'numeric' }) : inToronto(d, { day: 'numeric' })));
      })];
    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const hour = OPEN_HOUR + Math.floor(i / 2);
      const minute = i % 2 ? 30 : 0;
      rows.push(h('div', { class: minute ? 'cal-time cal-time-half' : 'cal-time' }, minute ? '' : `${String(hour).padStart(2, '0')}:00`));
      days.forEach((day, column) => {
        const at = slotOn(day, hour, minute);
        const el = h('button', { class: 'cal-slot', type: 'button', 'data-at': at.toISOString(), 'data-day': String(column) },
          h('span', { class: 'cal-block', hidden: true }));
        rows.push(el);
        cells.push({ el, at, column, when: `${dayAt(at)}, ${clockAt(at)}`, state: null });
        byEl.set(el, cells[cells.length - 1]);
      });
    }
    grid.replaceChildren(...rows);
    paint();
  }

  // One set of listeners on the grid, so repainting can never take them away mid-drag.
  const cellAt = (target) => byEl.get(target?.closest?.('.cal-slot'));
  grid.addEventListener('pointerdown', (ev) => {
    const from = cellAt(ev.target);
    if (ev.button !== 0 || !from || from.el.disabled) return;
    ev.preventDefault();
    grid.setPointerCapture(ev.pointerId);
    place(from.at, length);
    // A pointer can report several positions between two frames. Only the latest one matters, and
    // working it out once a frame keeps the block following the finger instead of running behind it.
    let at = null, waiting = 0;
    const step = () => {
      waiting = 0;
      const point = at;
      if (!point) return;
      const over = cellAt(document.elementFromPoint(point.x, point.y));
      if (!over || over.column !== from.column) return;           // stay in the day you started in
      const mins = Math.round((over.at.getTime() - from.at.getTime()) / 60000) + SLOT_MINUTES;
      place(from.at, mins >= 60 ? 60 : SLOT_MINUTES);
    };
    const move = (e) => {
      at = { x: e.clientX, y: e.clientY };
      if (!waiting) waiting = requestAnimationFrame(step);
    };
    const up = () => {
      if (waiting) cancelAnimationFrame(waiting);
      step(); // the pointer may have moved since the last frame; finish where it actually is
      grid.removeEventListener('pointermove', move);
      grid.removeEventListener('pointerup', up);
      grid.removeEventListener('pointercancel', up);
    };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);
  });
  grid.addEventListener('keydown', (ev) => {
    const cell = cellAt(ev.target);
    if (!cell || (ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault();
    place(cell.at, length);
  });
  build();

  return {
    el: h('div', { class: 'cal' },
      h('div', { class: 'cal-head' }, back, title, forward),
      grid,
      h('p', { class: 'hint' }, 'Tap a time to place your meeting, or drag down to make it an hour. Weekdays, 09:00–18:00 Toronto time.')),
    setLength(mins) {
      length = mins;
      if (picked) place(new Date(picked.startsAt), mins);
    },
    clear() { picked = null; paint(); },
    refresh({ busy: nextBusy = busy, mine: nextMine = mine } = {}) {
      busy = nextBusy;
      mine = nextMine;
      paint();
    }
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
