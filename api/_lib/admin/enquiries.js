// GET   /api/admin/enquiries?stage=&status= → enquiries, newest first, with the linked account if any
// PATCH /api/admin/enquiries {id, status?, estimated_cost?} → moves an enquiry through new → in review → replied
//                                                       → closed, and/or sets its estimate (whole CAD; null clears it)
import { db, run } from '../db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../http.js';
import { ENQUIRY_STATUSES, FUNDING_STAGES, MAX_COST, toId } from '../rules.js';
import { requireAdmin, withClients } from '../users.js';

const COLUMNS = 'id,user_id,stage,email,message,status,tags,focus,consultants,estimated_cost,created_at,updated_at';

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
  const changes = {};
  if ('status' in body) {
    if (!ENQUIRY_STATUSES.includes(body.status)) return fail(res, 400, 'invalid_status');
    changes.status = body.status;
  }
  if ('estimated_cost' in body) {
    const cost = body.estimated_cost;
    if (cost !== null && !(Number.isInteger(cost) && cost >= 0 && cost <= MAX_COST)) return fail(res, 400, 'invalid_cost');
    changes.estimated_cost = cost;
  }
  if (!Object.keys(changes).length) return fail(res, 400, 'invalid_status');
  const row = await run(db().from('enquiries')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLUMNS).maybeSingle());
  if (!row) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, enquiry: (await withClients([row]))[0] });
});
