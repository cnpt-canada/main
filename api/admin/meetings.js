// GET   /api/admin/meetings                  → every meeting, soonest first, with the client who booked it
// PATCH /api/admin/meetings {id, status}     → confirm, decline or call off a meeting
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { MEETING_COLUMNS } from '../_lib/process.js';
import { MEETING_STATUSES, toId } from '../_lib/rules.js';
import { requireAdmin, withClients } from '../_lib/users.js';

export default route(async (req, res) => {
  if (!['GET', 'PATCH'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH']);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const rows = await run(db().from('meetings').select(MEETING_COLUMNS).order('starts_at', { ascending: true }).limit(500));
    return json(res, 200, { ok: true, meetings: await withClients(rows) });
  }

  const body = readBody(req);
  const id = toId(body.id);
  if (!id) return fail(res, 400, 'invalid_id');
  if (!MEETING_STATUSES.includes(body.status)) return fail(res, 400, 'invalid_status');
  const meeting = await run(db().from('meetings').update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id).select(MEETING_COLUMNS).maybeSingle());
  if (!meeting) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, meeting: (await withClients([meeting]))[0] });
});
