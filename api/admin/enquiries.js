// GET   /api/admin/enquiries?stage=&status= → enquiries, newest first, with the linked account if any
// PATCH /api/admin/enquiries {id, status}   → moves an enquiry through new → in review → replied → closed
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { ENQUIRY_STATUSES, FUNDING_STAGES, toId } from '../_lib/rules.js';
import { requireAdmin, withClients } from '../_lib/users.js';

const COLUMNS = 'id,user_id,stage,email,message,status,created_at,updated_at';

export default route(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    let query = db().from('enquiries').select(COLUMNS);
    if (FUNDING_STAGES.includes(req.query.stage)) query = query.eq('stage', req.query.stage);
    if (ENQUIRY_STATUSES.includes(req.query.status)) query = query.eq('status', req.query.status);
    const rows = await run(query.order('created_at', { ascending: false }).limit(500));
    return json(res, 200, { ok: true, enquiries: await withClients(rows) });
  }

  const body = readBody(req);
  const id = toId(body.id);
  if (!id) return fail(res, 400, 'invalid_id');
  if (!ENQUIRY_STATUSES.includes(body.status)) return fail(res, 400, 'invalid_status');
  const row = await run(db().from('enquiries')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLUMNS).maybeSingle());
  if (!row) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, enquiry: (await withClients([row]))[0] });
});
