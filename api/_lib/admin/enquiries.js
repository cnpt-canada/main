// GET    /api/admin/enquiries?stage=&status= → enquiries, newest first, with the linked account if any
// PATCH  /api/admin/enquiries {id, ...}      → edits one: status, estimate, stage, sender, message, fields,
//                                              focal or consultants. Only the keys sent are changed.
// DELETE /api/admin/enquiries {id}           → removes it for good. The client stops seeing it too.
import { db, run } from '../db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../http.js';
import {
  cleanConsultants, cleanFocus, cleanTags, EMAIL_RE, ENQUIRY_STATUSES, FUNDING_STAGES, MAX_COST, MAX_MESSAGE, toId
} from '../rules.js';
import { requireAdmin, withClients } from '../users.js';

const COLUMNS = 'id,user_id,stage,email,message,status,tags,focus,consultants,estimated_cost,created_at,updated_at';
const METHODS = ['GET', 'PATCH', 'DELETE'];

// Each key an admin may change, and what counts as a good value. Anything else in the body is ignored.
function readChanges(body) {
  const changes = {};
  if ('status' in body) {
    if (!ENQUIRY_STATUSES.includes(body.status)) return { error: 'invalid_status' };
    changes.status = body.status;
  }
  if ('estimated_cost' in body) {
    const cost = body.estimated_cost;
    if (cost !== null && !(Number.isInteger(cost) && cost >= 0 && cost <= MAX_COST)) return { error: 'invalid_cost' };
    changes.estimated_cost = cost;
  }
  if ('stage' in body) {
    if (!FUNDING_STAGES.includes(body.stage)) return { error: 'invalid_stage' };
    changes.stage = body.stage;
  }
  if ('email' in body) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return { error: 'invalid_email' };
    changes.email = email;
  }
  if ('message' in body) {
    const message = String(body.message ?? '').trim();
    if (!message || message.length > MAX_MESSAGE) return { error: 'invalid_message' };
    changes.message = message;
  }
  if ('tags' in body) {
    const tags = cleanTags(body.tags);
    if (!tags) return { error: 'invalid_tags' };
    changes.tags = tags;
  }
  if ('focus' in body) {
    if (body.focus === null) changes.focus = null;
    else {
      const focus = cleanFocus(body.focus);
      if (!focus) return { error: 'invalid_focus' };
      changes.focus = focus;
    }
  }
  if ('consultants' in body) {
    const consultants = cleanConsultants(body.consultants);
    if (!consultants) return { error: 'invalid_consultants' };
    changes.consultants = consultants;
  }
  return Object.keys(changes).length ? { changes } : { error: 'nothing_to_change' };
}

export default route(async (req, res) => {
  if (!METHODS.includes(req.method)) return methodNotAllowed(res, METHODS);
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

  if (req.method === 'DELETE') {
    const gone = await run(db().from('enquiries').delete().eq('id', id).select('id').maybeSingle());
    if (!gone) return fail(res, 404, 'not_found');
    return json(res, 200, { ok: true, id });
  }

  const { changes, error } = readChanges(body);
  if (error) return fail(res, 400, error);
  const row = await run(db().from('enquiries')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLUMNS).maybeSingle());
  if (!row) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, enquiry: (await withClients([row]))[0] });
});
