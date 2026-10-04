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

const SLOT_MINUTES = 30;
const DAYS_AHEAD = 30;                       // how far out a client may book

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

const overlaps = (aFrom, aMins, bFrom, bMins) =>
  aFrom < bFrom + bMins * 60000 && bFrom < aFrom + aMins * 60000;

/* One wheel of the dial.
 *
 * A column that scrolls, with a snap point on every row and half a wheel of padding at each end so
 * the first and last rows can reach the middle. The browser does the momentum and the snapping; the
 * only thing here is reading back which row the scroll came to rest on, and drawing the rows further
 * from the middle fainter and smaller so the column reads as a drum rather than a list.
 *
 * It is also a listbox: the column takes focus, the arrow keys move it, and Home and End go to the
 * ends — a wheel you can only flick is a wheel a keyboard cannot use.
 */
function wheel({ label, onChange }) {
  const list = h('ul', { class: 'wheel-list' });
  const box = h('div', { class: 'wheel', role: 'listbox', tabindex: '0', 'aria-label': label }, list);
  let rows = [];
  let index = 0;
  let settle = null;
  let quiet = false;                       // true while we are the ones moving it

  // offsetHeight, not getBoundingClientRect: the rows carry a scale and the rect reports it
  const rowHeight = () => rows[0]?.el.offsetHeight || 42;

  // how far each row sits from the middle, as a fraction of a row
  function shade() {
    const mid = box.scrollTop + box.clientHeight / 2;
    for (const r of rows) {
      const d = Math.abs((r.el.offsetTop + r.el.offsetHeight / 2) - mid) / rowHeight();
      r.el.style.opacity = String(Math.max(0.3, 1 - d * 0.3));
      r.el.style.transform = `scale(${Math.max(0.8, 1 - d * 0.08)})`;
    }
  }

  function readBack() {
    if (!rows.length) return;
    const i = Math.min(rows.length - 1, Math.max(0, Math.round(box.scrollTop / rowHeight())));
    if (i === index) return;
    index = i;
    mark();
    onChange?.(rows[i].value, i);
  }

  function mark() {
    rows.forEach((r, i) => {
      r.el.classList.toggle('is-on', i === index);
      r.el.setAttribute('aria-selected', String(i === index));
    });
    box.setAttribute('aria-activedescendant', rows[index]?.el.id || '');
  }

  box.addEventListener('scroll', () => {
    shade();
    if (quiet) return;
    clearTimeout(settle);
    settle = setTimeout(readBack, 90);
  }, { passive: true });

  box.addEventListener('keydown', (ev) => {
    const step = { ArrowDown: 1, ArrowUp: -1, PageDown: 3, PageUp: -3 }[ev.key];
    const to = ev.key === 'Home' ? 0 : ev.key === 'End' ? rows.length - 1 : step ? index + step : null;
    if (to === null) return;
    ev.preventDefault();
    go(Math.min(rows.length - 1, Math.max(0, to)), true);
  });

  // moving the wheel ourselves must not read back as the person having moved it
  function go(i, tell) {
    if (!rows.length) return;
    index = Math.min(rows.length - 1, Math.max(0, i));
    quiet = true;
    box.scrollTo({ top: index * rowHeight(), behavior: 'auto' });
    mark();
    shade();
    requestAnimationFrame(() => { quiet = false; });
    if (tell) onChange?.(rows[index].value, index);
  }

  return {
    el: box,
    get value() { return rows[index]?.value; },
    get index() { return index; },
    // `items` is [{ value, label, sub, off }]; `keep` is the value to stay on if it is still there
    fill(items, keep) {
      const was = keep !== undefined ? keep : rows[index]?.value;
      list.replaceChildren();
      rows = items.map((it, i) => {
        const el = h('li', {
          class: it.off ? 'wheel-opt is-off' : 'wheel-opt',
          id: `${box.id || label.toLowerCase()}-opt-${i}`,
          role: 'option',
          'aria-disabled': it.off ? 'true' : null
        }, h('span', {}, it.label), it.sub ? h('small', {}, it.sub) : null);
        el.addEventListener('click', () => go(i, true));
        list.appendChild(el);
        return { el, value: it.value, off: Boolean(it.off) };
      });
      let i = rows.findIndex((r) => r.value === was && !r.off);
      if (i < 0) i = rows.findIndex((r) => !r.off);
      go(i < 0 ? 0 : i, false);
      return rows[index]?.value;
    },
    set(value) {
      const i = rows.findIndex((r) => r.value === value);
      if (i >= 0) go(i, false);
    },
    disabled(i) { return rows[i]?.off; }
  };
}

/* The dial: a day, an hour and a minute, each on its own wheel.
 *
 * Every combination is checked against the same three rules the server applies — the time has not
 * passed, nothing else is booked over it, and the meeting finishes before the day closes — and a row
 * that fails is greyed rather than hidden, so the shape of a day stays the same as you move through
 * it and a full morning reads as full rather than as missing.
 *
 * `onPick({ startsAt, minutes })` runs whenever the three wheels settle on something bookable, and
 * `onPick(null)` when they settle on something that is not.
 */
export function timeDial({ busy = [], mine = [], minutes = 30, onPick, from = new Date() }) {
  let length = MEETING_LENGTHS.includes(minutes) ? minutes : SLOT_MINUTES;
  let taken = busy;

  const days = [];
  for (let d = firstWeekday(from), i = 0; i < DAYS_AHEAD; i++, d = nextWeekday(d, 1)) days.push(d);

  const free = (at, mins) => at.getTime() >= Date.now()
    && at.getTime() + mins * 60000 <= slotOn(at, CLOSE_HOUR, 0).getTime()
    && !taken.some((m) => overlaps(at.getTime(), mins, Date.parse(m.starts_at), m.minutes));

  // a day is bookable if any half hour in it is
  const dayOpen = (d) => {
    for (let hh = OPEN_HOUR; hh < CLOSE_HOUR; hh++) {
      for (const mm of [0, 30]) if (free(slotOn(d, hh, mm), length)) return true;
    }
    return false;
  };
  const hourOpen = (d, hh) => [0, 30].some((mm) => free(slotOn(d, hh, mm), length));

  const dayWheel = wheel({ label: 'Day', onChange: () => { fillHours(); settled(); } });
  const hourWheel = wheel({ label: 'Hour', onChange: () => { fillMinutes(); settled(); } });
  const minWheel = wheel({ label: 'Minute', onChange: settled });

  // the date it is in Toronto, not the first day that can be booked: on a Sunday those differ, and
  // calling Monday 'Today' sends a client to the wrong day
  const ymd = (d) => inToronto(d, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = ymd(new Date());
  function fillDays() {
    dayWheel.fill(days.map((d) => ({
      value: d.getTime(),
      label: ymd(d) === today ? 'Today' : inToronto(d, { weekday: 'short', day: 'numeric' }),
      sub: inToronto(d, { month: 'short' }),
      off: !dayOpen(d)
    })));
  }
  function fillHours() {
    const d = new Date(dayWheel.value);
    const hrs = [];
    for (let hh = OPEN_HOUR; hh < CLOSE_HOUR; hh++) {
      hrs.push({ value: hh, label: String(hh).padStart(2, '0'), off: !hourOpen(d, hh) });
    }
    hourWheel.fill(hrs);
  }
  function fillMinutes() {
    const d = new Date(dayWheel.value);
    const hh = hourWheel.value;
    minWheel.fill([0, 30].map((mm) => ({
      value: mm, label: String(mm).padStart(2, '0'), off: !free(slotOn(d, hh, mm), length)
    })));
  }

  function at() {
    if (dayWheel.value === undefined || hourWheel.value === undefined || minWheel.value === undefined) return null;
    return slotOn(new Date(dayWheel.value), hourWheel.value, minWheel.value);
  }
  function settled() {
    const when = at();
    onPick?.(when && free(when, length) ? { startsAt: when.toISOString(), minutes: length } : null);
  }

  const el = h('div', { class: 'dial' },
    h('div', { class: 'dial-band', 'aria-hidden': 'true' }),
    h('div', { class: 'dial-cols' },
      dayWheel.el,
      h('div', { class: 'dial-sep', 'aria-hidden': 'true' }, hourWheel.el, h('span', { class: 'dial-colon' }, ':'), minWheel.el)));

  fillDays();
  fillHours();
  fillMinutes();
  // the first paint happens before the wheels have a height, so the rows are shaded once they do
  requestAnimationFrame(() => { dayWheel.set(dayWheel.value); hourWheel.set(hourWheel.value); minWheel.set(minWheel.value); settled(); });

  return {
    el,
    setLength(mins) {
      length = MEETING_LENGTHS.includes(mins) ? mins : SLOT_MINUTES;
      fillDays(); fillHours(); fillMinutes(); settled();
    },
    // move the dial onto an existing meeting, for rescheduling
    show(startsAt) {
      if (!el.isConnected) { requestAnimationFrame(() => this.show(startsAt)); return; }
      const when = new Date(startsAt);
      const day = days.find((d) => inToronto(d, { day: 'numeric', month: 'short' }) === inToronto(when, { day: 'numeric', month: 'short' }));
      if (day) dayWheel.set(day.getTime());
      fillHours();
      hourWheel.set(Number(inToronto(when, { hour: '2-digit', hour12: false })));
      fillMinutes();
      minWheel.set(when.getMinutes() < 30 ? 0 : 30);
      settled();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    update({ busy: nextBusy, mine: nextMine }) {
      if (nextBusy) taken = nextBusy;
      if (nextMine) mine = nextMine;
      fillDays(); fillHours(); fillMinutes(); settled();
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
