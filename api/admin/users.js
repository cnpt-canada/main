// GET   /api/admin/users           → everyone who has signed in, newest first
// PATCH /api/admin/users {id, role} → grants or removes admin access
// Owners (ADMIN_EMAILS) can't be changed, and admins can't remove their own access.
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { ROLES, toId } from '../_lib/rules.js';
import { USER_COLUMNS, isOwner, requireAdmin, toPublicUser } from '../_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const users = await run(db().from('users').select(USER_COLUMNS).order('created_at', { ascending: false }).limit(1000));
    return json(res, 200, { ok: true, users: users.map(toPublicUser), me: admin.id });
  }

  const body = readBody(req);
  const id = toId(body.id);
  if (!id) return fail(res, 400, 'invalid_id');
  if (!ROLES.includes(body.role)) return fail(res, 400, 'invalid_role');

  const target = await run(db().from('users').select(USER_COLUMNS).eq('id', id).maybeSingle());
  if (!target) return fail(res, 404, 'not_found');
  if (isOwner(target.email)) return fail(res, 400, 'owner_locked');
  if (target.id === admin.id && body.role !== 'admin') return fail(res, 400, 'cannot_demote_self');

  const updated = await run(db().from('users').update({ role: body.role }).eq('id', id).select(USER_COLUMNS).single());
  json(res, 200, { ok: true, user: toPublicUser(updated) });
});
