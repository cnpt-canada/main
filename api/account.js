// GET    /api/account → the signed-in user's profile and enquiries
// DELETE /api/account → deletes the account and signs out. Enquiries stay with the studio as
//                       business records, no longer linked to anyone.
import { db, run } from './_lib/db.js';
import { json, methodNotAllowed, route } from './_lib/http.js';
import { endSession } from './_lib/session.js';
import { requireUser, toPublicUser } from './_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'DELETE') return methodNotAllowed(res, ['GET', 'DELETE']);
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'DELETE') {
    await run(db().from('users').delete().eq('id', user.id));
    endSession(req, res);
    return json(res, 200, { ok: true });
  }

  const enquiries = await run(db().from('enquiries').select('id,stage,message,status,created_at')
    .eq('user_id', user.id).order('created_at', { ascending: false }));
  json(res, 200, { ok: true, user: toPublicUser(user), enquiries });
});
