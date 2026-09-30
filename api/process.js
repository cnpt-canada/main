// GET /api/process           → my process (stage, picture, headline), its thread and my meetings
// GET /api/process?as=<id>   → the same for a member, for admins ("view as user"). Read-only.
// GET /api/process?as=<id>&internal=1 → with the studio's own notes as well. Admins only, and asked
//                              for on purpose: "view as user" leaves it off, so it shows what the
//                              client actually sees.
import { db, run } from './_lib/db.js';
import { fail, json, methodNotAllowed, route } from './_lib/http.js';
import { loadComments, loadMeetings, loadProcess, withAuthors } from './_lib/process.js';
import { toId } from './_lib/rules.js';
import { imageLink } from './_lib/storage.js';
import { isAdmin, requireUser, toPublicUser, USER_COLUMNS } from './_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const user = await requireUser(req, res);
  if (!user) return;

  let who = user;
  if (req.query.as) {
    if (!isAdmin(user)) return fail(res, 403, 'admin_only');
    const id = toId(req.query.as);
    who = id && await run(db().from('users').select(USER_COLUMNS).eq('id', id).maybeSingle());
    if (!who) return fail(res, 404, 'not_found');
  }

  // only an admin can reach another member at all, and even then the studio's own notes come back
  // only when they are asked for
  const includeInternal = isAdmin(user) && req.query.internal === '1';
  const [process, comments, meetings] = await Promise.all([
    loadProcess(who.id), loadComments(who.id, { includeInternal }), loadMeetings(who.id)]);
  json(res, 200, {
    ok: true,
    user: toPublicUser(who),
    process: process || null,
    image_url: await imageLink(process?.image_path),
    comments: await withAuthors(comments),
    meetings,
    viewing_as: who.id !== user.id
  });
});
