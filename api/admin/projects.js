// GET    /api/admin/projects                                  → every project, most recently updated first
// POST   /api/admin/projects {title, user_id, stage, status, note} → creates a project for a client
// PATCH  /api/admin/projects {id, …fields}                    → updates the fields that were sent
// DELETE /api/admin/projects?id=                               → deletes a project
// The client sees their projects (stage, status and note) on /account.
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { MAX_NOTE, MAX_TITLE, PROJECT_STAGES, PROJECT_STATUSES, toId } from '../_lib/rules.js';
import { requireAdmin, withClients } from '../_lib/users.js';

const COLUMNS = 'id,user_id,title,stage,status,note,created_at,updated_at';

// Checks the fields present in `input`; with `partial` false, a title is required.
// Returns { values } or { error }.
async function readProject(input, partial) {
  const values = {};
  if (!partial || 'title' in input) {
    const title = String(input.title || '').trim();
    if (!title || title.length > MAX_TITLE) return { error: 'invalid_title' };
    values.title = title;
  }
  if ('stage' in input) {
    if (!PROJECT_STAGES.includes(input.stage)) return { error: 'invalid_stage' };
    values.stage = input.stage;
  }
  if ('status' in input) {
    if (!PROJECT_STATUSES.includes(input.status)) return { error: 'invalid_status' };
    values.status = input.status;
  }
  if ('note' in input) {
    const note = input.note == null ? '' : String(input.note).trim();
    if (note.length > MAX_NOTE) return { error: 'invalid_note' };
    values.note = note || null;
  }
  if ('user_id' in input) {
    if (input.user_id === null || input.user_id === '') {
      values.user_id = null;
    } else {
      const userId = toId(input.user_id);
      const exists = userId && (await run(db().from('users').select('id').eq('id', userId).maybeSingle()));
      if (!exists) return { error: 'invalid_client' };
      values.user_id = userId;
    }
  }
  return { values };
}

export default route(async (req, res) => {
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'DELETE']);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const rows = await run(db().from('projects').select(COLUMNS).order('updated_at', { ascending: false }).limit(500));
    return json(res, 200, { ok: true, projects: await withClients(rows) });
  }

  if (req.method === 'DELETE') {
    const id = toId(req.query.id);
    if (!id) return fail(res, 400, 'invalid_id');
    const gone = await run(db().from('projects').delete().eq('id', id).select('id'));
    if (!gone.length) return fail(res, 404, 'not_found');
    return json(res, 200, { ok: true });
  }

  const body = readBody(req);
  const { values, error } = await readProject(body, req.method === 'PATCH');
  if (error) return fail(res, 400, error);

  if (req.method === 'POST') {
    const row = await run(db().from('projects').insert(values).select(COLUMNS).single());
    return json(res, 201, { ok: true, project: (await withClients([row]))[0] });
  }

  const id = toId(body.id);
  if (!id) return fail(res, 400, 'invalid_id');
  const row = await run(db().from('projects')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', id).select(COLUMNS).maybeSingle());
  if (!row) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, project: (await withClients([row]))[0] });
});
