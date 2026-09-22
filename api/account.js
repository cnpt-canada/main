// GET    /api/account          → the signed-in user's profile, enquiries and onboarding
// GET    /api/account?as=<id>  → the same for another member, for admins ("view as user"). Read-only.
// DELETE /api/account          → deletes the account and signs out. Enquiries stay with the studio as
//                                business records, no longer linked to anyone.
import { db, run } from './_lib/db.js';
import { fail, json, methodNotAllowed, route } from './_lib/http.js';
import { loadOnboarding, toPublicOnboarding } from './_lib/onboarding.js';
import { toId } from './_lib/rules.js';
import { endSession } from './_lib/session.js';
import { isAdmin, requireUser, toPublicUser, USER_COLUMNS } from './_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed(res, ['GET', 'DELETE']);
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'DELETE') {
    if (req.query.as) return fail(res, 400, 'read_only');
    await run(db().from('users').delete().eq('id', user.id));
    endSession(req, res);
    return json(res, 200, { ok: true });
  }

  let who = user;
  if (req.query.as) {
    if (!isAdmin(user)) return fail(res, 403, 'admin_only');
    const id = toId(req.query.as);
    who = id && await run(db().from('users').select(USER_COLUMNS).eq('id', id).maybeSingle());
    if (!who) return fail(res, 404, 'not_found');
  }

  const [enquiries, onboarding] = await Promise.all([
    run(db().from('enquiries').select('id,stage,message,status,created_at')
      .eq('user_id', who.id).order('created_at', { ascending: false })),
    loadOnboarding(who.id)
  ]);
  json(res, 200, {
    ok: true, user: toPublicUser(who), enquiries, onboarding: toPublicOnboarding(onboarding),
    viewing_as: who.id !== user.id
  });
});
