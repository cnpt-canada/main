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
  h('span', { class: 'stage-dot', 'aria-hidden': 'true' }, i < at ? icon('check') : null),
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

// Which day a note belongs to, in the reader's own time, so the separators match their calendar.
const dayKey = (iso) => new Date(iso).toDateString();
const dayLabel = (iso) => {
  const d = new Date(iso), today = new Date();
  const days = Math.round((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric',
    year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
};
const clockOf = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });

// One comment. `runOn` means the person above wrote this too, on the same day, so it joins what they
// were saying instead of repeating their name and their face.
function commentRow(comment, { canDelete, onDelete, runOn = false }) {
  const who = comment.author || { name: 'Someone who left', email: '', title: '—' };
  const kind = (runOn ? 'note note-run' : 'note') + (comment.internal ? ' note-internal' : '');
  return h('li', { class: kind, 'data-id': comment.id },
    runOn ? h('span', { class: 'note-gutter', 'aria-hidden': 'true' }) : avatar(who),
    h('div', { class: 'note-body' },
      runOn ? null : h('p', { class: 'note-head' },
        h('strong', {}, who.name || who.email || 'Someone'),
        h('span', { class: `note-title note-title-${who.title === 'Consultant' ? 'team' : 'owner'}` }, who.title),
        comment.internal ? h('span', { class: 'note-title note-title-internal' }, 'Internal') : null,
        h('time', { class: 'sub', datetime: comment.created_at, title: new Date(comment.created_at).toLocaleString('en-CA') }, ago(comment.created_at))),
      h('p', { class: 'note-text' }, comment.body),
      runOn ? h('time', { class: 'note-when', datetime: comment.created_at }, clockOf(comment.created_at)) : null),
    canDelete && h('button', { class: 'icon-btn note-remove', type: 'button', 'aria-label': 'Delete this note', onclick: () => onDelete(comment) }, icon('x')));
}

const daySeparator = (iso) => h('li', { class: 'notes-day', role: 'separator' }, h('span', {}, dayLabel(iso)));

// The thread under the process: everything written so far, and a box to add to it.
// `onSend(text)` should save and return the new comment; `onDelete(comment)` removes one.
// `canWriteInternal` offers the studio the choice of keeping a note to itself. `internalOnly` takes
// the choice away and keeps every note inside — what the enquiry panel wants, where the surrounding
// screen is plainly internal and a note that emailed the client would be a surprise.
export function commentThread({ comments, me, onSend, onDelete, readOnly = false, placeholder = 'Write a note…',
  canWriteInternal = false, internalOnly = false }) {
  const list = h('ul', { class: 'notes' });
  const canRemove = (c) => !readOnly && (me?.role === 'admin' || c.author?.id === me?.id);
  const rowFor = (c, runOn) => commentRow(c, { canDelete: canRemove(c), onDelete, runOn });
  // a day is announced once, and a run from one person on that day is written once
  const rows = () => comments.flatMap((c, i) => {
    const prev = comments[i - 1];
    const newDay = !prev || dayKey(prev.created_at) !== dayKey(c.created_at);
    const runOn = !newDay && prev.author?.id != null && prev.author.id === c.author?.id
      && Boolean(prev.internal) === Boolean(c.internal);
    return [newDay ? daySeparator(c.created_at) : null, rowFor(c, runOn)].filter(Boolean);
  });
  const draw = () => list.replaceChildren(...(comments.length
    ? rows()
    : [h('li', { class: 'notes-empty' }, 'Nothing here yet. Anything either side writes stays with the project.')]));
  draw();
  if (readOnly) return h('div', { class: 'thread' }, list);

  const field = h('textarea', { class: 'textarea note-field', rows: '2', maxlength: String(MAX_COMMENT), placeholder, 'aria-label': 'Write a note' });
  const send = h('button', { class: 'btn btn-primary btn-sm', type: 'submit', disabled: true }, 'Post', icon('arrow-right'));

  // who the note is for, decided before it is written rather than after
  let internal = internalOnly;
  const who = h('span', { class: 'sub note-who' });
  const choice = canWriteInternal && !internalOnly
    ? h('div', { class: 'seg note-kind', role: 'group', 'aria-label': 'Who this note is for' },
      ...[['Send to client', false], ['Keep internal', true]].map(([label, value]) => {
        const b = h('button', { class: 'seg-btn', type: 'button', 'aria-pressed': String(internal === value) }, label);
        b.addEventListener('click', () => {
          internal = value;
          for (const other of choice.children) other.setAttribute('aria-pressed', String(other === b));
          form.classList.toggle('is-internal', internal);
          say();
        });
        return b;
      }))
    : null;
  // said from the writer's own side: a client is writing to the studio, the studio is writing to a
  // client, and neither should be told about "the client" as though they were someone else
  const say = () => {
    who.textContent = internal ? 'Kept inside cnpt · the client never sees this'
      : canWriteInternal ? 'The client sees this, and is emailed · ⌘↩ to send'
        : 'Everyone on this project can see it · ⌘↩ to send';
  };
  say();

  const sync = () => { send.disabled = !field.value.trim(); };
  field.addEventListener('input', sync);
  field.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); form.requestSubmit(); }
  });
  const form = h('form', { class: internalOnly ? 'note-add is-internal' : 'note-add' }, field,
    h('div', { class: 'note-add-foot' }, who, choice, send));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const text = field.value.trim();
    if (!text) return;
    send.disabled = true;
    const added = await onSend(text, { internal });
    if (added) {
      const first = comments.length === 0;
      const prev = comments[comments.length - 1];
      const newDay = !prev || dayKey(prev.created_at) !== dayKey(added.created_at);
      const runOn = !newDay && prev.author?.id != null && prev.author.id === added.author?.id;
      comments.push(added);
      field.value = '';
      // the new note arrives on its own, rather than the whole thread being drawn again under the reader
      const row = rowFor(added, runOn);
      row.classList.add('note-new');
      if (first) list.replaceChildren(...(newDay ? [daySeparator(added.created_at), row] : [row]));
      else { if (newDay) list.append(daySeparator(added.created_at)); list.append(row); }
      row.scrollIntoView({ block: 'nearest' });
    }
    sync();
    field.focus();
  });
  return h('div', { class: 'thread' }, list, form);
}

/* ---------- picking a time ---------- */

const DAYS_AHEAD = 60;                       // how far out a client may book

const isWeekend = (date) => ['Sat', 'Sun'].includes(inToronto(date, { weekday: 'short' }));

// The working day `step` days on from here (backwards when step is negative), as 09:00 in Toronto.
function nextWeekday(from, step) {
  let at = from;
  do { at = slotOn(new Date(at.getTime() + step * 86400000), OPEN_HOUR, 0); } while (isWeekend(at));
  return at;
}

// The first day a meeting can be asked for: tomorrow at the earliest, and the next weekday after
// that if tomorrow is the weekend. A request is confirmed by hand, so the same day cannot be
// answered in time -- the server refuses it too.
export function firstWeekday(date) {
  return nextWeekday(slotOn(date, OPEN_HOUR, 0), 1);
}

const overlaps = (aFrom, aMins, bFrom, bMins) =>
  aFrom < bFrom + bMins * 60000 && bFrom < aFrom + aMins * 60000;

// Which calendar date a moment falls on in Toronto, as plain numbers.
function dateParts(d) {
  const p = torontoFormat({ year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {});
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day) };
}
const sameDate = (a, b) => a.y === b.y && a.m === b.m && a.d === b.d;
const asNumber = (p) => p.y * 10000 + p.m * 100 + p.d;
const earlierThan = (a, b) => asNumber(a) < asNumber(b);
// Noon UTC is the same calendar day in Toronto whichever way the clocks have gone, so the month grid
// can be laid out with plain arithmetic and only the booked instant goes through slotOn.
const atNoon = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 12));
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const mondayFirst = (y, m) => (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;

/* The booker: a month to choose a day from, and that day's free hours as buttons beside it.
 *
 * This is the shape every booking site has settled on, and it is the one that suits a mouse: a day
 * is one click, an hour is one click, and both are visible at once, so a client can see that Tuesday
 * is full without first selecting Tuesday. Times run on the hour — a studio call is booked by the
 * hour, and offering half past as well doubles the buttons to say the same thing.
 *
 * Every slot is checked against the same three rules the server applies: not in the past, nothing
 * booked over it, and finished before the day closes. `onPick({ startsAt, minutes })` runs when a
 * time is chosen, and `onPick(null)` when the choice is cleared by changing day or length.
 */
export function timePicker({ busy = [], minutes = 30, onPick, from = new Date() }) {
  let length = MEETING_LENGTHS.includes(minutes) ? minutes : 30;
  let taken = busy;
  let day = firstWeekday(from);              // the day on show
  let chosen = null;                         // the hour chosen on it, as a Date
  let month = dateParts(day);                // which month the grid is showing

  const lastDay = new Date(Date.now() + DAYS_AHEAD * 86400000);

  const opensOn = dateParts(firstWeekday(new Date()));
  const free = (at) => !earlierThan(dateParts(at), opensOn)
    && at.getTime() + length * 60000 <= slotOn(at, CLOSE_HOUR, 0).getTime()
    && at.getTime() <= lastDay.getTime()
    && !taken.some((m) => overlaps(at.getTime(), length, Date.parse(m.starts_at), m.minutes));

  const hoursOf = (d) => {
    const out = [];
    for (let hh = OPEN_HOUR; hh < CLOSE_HOUR; hh++) out.push(slotOn(d, hh, 0));
    return out;
  };
  const dayHasRoom = (d) => !isWeekend(d) && hoursOf(d).some(free);

  const grid = h('div', { class: 'cal-grid', role: 'grid' });
  const monthName = h('p', { class: 'cal-month' });
  const back = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month' }, icon('arrow-left'));
  const forward = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month' }, icon('arrow-right'));
  const times = h('div', { class: 'times-list' });
  const timesHead = h('p', { class: 'times-head' });

  const monthStep = (step) => {
    const m = month.m + step;
    month = { y: month.y + Math.floor((m - 1) / 12), m: ((m - 1 + 12) % 12) + 1, d: 1 };
    drawMonth();
  };
  back.addEventListener('click', () => monthStep(-1));
  forward.addEventListener('click', () => monthStep(1));

  function drawMonth() {
    monthName.textContent = inToronto(atNoon(month.y, month.m, 1), { month: 'long', year: 'numeric' });
    // a month with nothing left in it is behind us, and a month past the horizon has nothing in it yet
    const firstOfMonth = atNoon(month.y, month.m, 1).getTime();
    back.disabled = firstOfMonth <= atNoon(dateParts(new Date()).y, dateParts(new Date()).m, 1).getTime();
    forward.disabled = firstOfMonth >= atNoon(dateParts(lastDay).y, dateParts(lastDay).m, 1).getTime();

    const cells = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
      .map((d) => h('span', { class: 'cal-dow', 'aria-hidden': 'true' }, d));
    for (let i = 0; i < mondayFirst(month.y, month.m); i++) cells.push(h('span', { class: 'cal-pad' }));

    const today = dateParts(new Date());
    for (let d = 1; d <= daysInMonth(month.y, month.m); d++) {
      const at = slotOn(atNoon(month.y, month.m, d), OPEN_HOUR, 0);
      const room = dayHasRoom(at);
      const here = dateParts(at);
      const b = h('button', {
        class: 'cal-day' + (sameDate(here, dateParts(day)) ? ' is-on' : '') + (sameDate(here, today) ? ' is-today' : ''),
        type: 'button', disabled: !room || null,
        'aria-label': inToronto(at, { weekday: 'long', month: 'long', day: 'numeric' }) + (room ? '' : ' — nothing free'),
        'aria-pressed': String(sameDate(here, dateParts(day)))
      }, String(d));
      if (room) b.addEventListener('click', () => { day = at; chosen = null; drawMonth(); drawTimes(); onPick?.(null); });
      cells.push(b);
    }
    grid.replaceChildren(...cells);
  }

  function drawTimes() {
    timesHead.textContent = inToronto(day, { weekday: 'long', month: 'long', day: 'numeric' });
    const open = hoursOf(day);
    const any = open.some(free);
    times.replaceChildren(...(any ? open.map((at) => {
      const ok = free(at);
      const b = h('button', {
        class: 'time-slot' + (chosen && chosen.getTime() === at.getTime() ? ' is-on' : ''),
        type: 'button', disabled: !ok || null, 'aria-pressed': String(Boolean(chosen) && chosen.getTime() === at.getTime())
      }, clockAt(at));
      if (ok) b.addEventListener('click', () => {
        chosen = at;
        drawTimes();
        onPick?.({ startsAt: at.toISOString(), minutes: length });
      });
      return b;
    }) : [h('p', { class: 'sub times-none' }, 'Nothing free on this day. Try another.')]));
  }

  drawMonth();
  drawTimes();

  return {
    el: h('div', { class: 'booker' },
      h('div', { class: 'booker-cal' },
        h('div', { class: 'cal-head' }, back, monthName, forward),
        grid),
      h('div', { class: 'booker-times' }, timesHead, times)),
    setLength(mins) {
      length = MEETING_LENGTHS.includes(mins) ? mins : 30;
      // the hour that was chosen may not hold a longer meeting
      if (chosen && !free(chosen)) chosen = null;
      drawMonth(); drawTimes();
      onPick?.(chosen ? { startsAt: chosen.toISOString(), minutes: length } : null);
    },
    // open on an existing meeting, for rescheduling
    show(startsAt) {
      const when = new Date(startsAt);
      day = slotOn(when, OPEN_HOUR, 0);
      month = dateParts(day);
      const hour = slotOn(when, Number(inToronto(when, { hour: '2-digit', hour12: false })), 0);
      chosen = free(hour) ? hour : null;
      drawMonth(); drawTimes();
      onPick?.(chosen ? { startsAt: chosen.toISOString(), minutes: length } : null);
    },
    update({ busy: nextBusy }) {
      if (nextBusy) taken = nextBusy;
      if (chosen && !free(chosen)) chosen = null;
      drawMonth(); drawTimes();
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
