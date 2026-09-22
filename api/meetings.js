// GET   /api/meetings                              → my meetings, and the slots already taken (times only)
// POST  /api/meetings {starts_at, minutes, note?}  → books a slot; the cnpt team confirms it afterwards
// PATCH /api/meetings {id, status: 'cancelled'}    → calls off one of mine
import { db, run } from './_lib/db.js';
import { emailStudio } from './_lib/notify.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { loadMeetings, MEETING_COLUMNS } from './_lib/process.js';
import { checkSlot, MAX_MEETING_NOTE, MEETING_DAYS_AHEAD, MEETING_TZ, toId } from './_lib/rules.js';
import { requireUser } from './_lib/users.js';

const LIVE = ['requested', 'confirmed']; // a slot is taken while it is either of these
const overlaps = (aStart, aMin, bStart, bMin) =>
  Date.parse(aStart) < Date.parse(bStart) + bMin * 60000 && Date.parse(bStart) < Date.parse(aStart) + aMin * 60000;

const whenText = (startsAt, minutes) => {
  const start = new Date(startsAt);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(start);
  const time = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${day}, ${time(start)}–${time(new Date(start.getTime() + minutes * 60000))} (Toronto)`;
};

// Everything booked from now on, so the calendar can grey out what is gone. Times only: no names.
async function busySlots() {
  const rows = await run(db().from('meetings').select('starts_at,minutes,status')
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', new Date(Date.now() + MEETING_DAYS_AHEAD * 86400000).toISOString())
    .order('starts_at', { ascending: true }).limit(500));
  return rows.filter((m) => LIVE.includes(m.status)).map(({ starts_at, minutes }) => ({ starts_at, minutes }));
}

export default route(async (req, res) => {
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'PATCH']);
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const [mine, busy] = await Promise.all([loadMeetings(user.id), busySlots()]);
    return json(res, 200, { ok: true, meetings: mine, busy });
  }

  const body = readBody(req);

  if (req.method === 'PATCH') {
    const id = toId(body.id);
    if (!id) return fail(res, 400, 'invalid_id');
    if (body.status !== 'cancelled') return fail(res, 400, 'invalid_status'); // only the cnpt team confirms
    const meeting = await run(db().from('meetings').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id).in('status', LIVE).select(MEETING_COLUMNS).maybeSingle());
    if (!meeting) return fail(res, 404, 'not_found');
    return json(res, 200, { ok: true, meeting });
  }

  const minutes = Number(body.minutes ?? 30);
  const { startsAt, error } = checkSlot(body.starts_at, minutes);
  if (error) return fail(res, 400, error);
  const note = String(body.note ?? '').trim();
  if (note.length > MAX_MEETING_NOTE) return fail(res, 400, 'invalid_note');

  const busy = await busySlots();
  if (busy.some((m) => overlaps(startsAt, minutes, m.starts_at, m.minutes))) return fail(res, 409, 'slot_taken');

  const meeting = await run(db().from('meetings')
    .insert({ user_id: user.id, starts_at: startsAt, minutes, note: note || null })
    .select(MEETING_COLUMNS).single());

  await emailStudio({
    subject: `Meeting requested: ${user.name || user.email}`,
    text: [`Client: ${user.name || '—'} <${user.email}>`, `When: ${whenText(startsAt, minutes)}`, '', note || '(no note)', '',
      'Confirm it on /admin → Meetings.'].join('\n'),
    replyTo: user.email
  });
  json(res, 200, { ok: true, meeting });
});
