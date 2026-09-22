// POST   /api/comments {body, owner_id?} → writes in a process thread. Clients write in their own;
//                                          admins write in any client's thread (owner_id), as Consultant.
// DELETE /api/comments {id}               → removes a comment you wrote (admins can remove any).
import { db, run } from './_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { COMMENT_COLUMNS, withAuthors } from './_lib/process.js';
import { MAX_COMMENT, toId } from './_lib/rules.js';
import { isAdmin, requireUser } from './_lib/users.js';

export default route(async (req, res) => {
  if (!['POST', 'DELETE'].includes(req.method)) return methodNotAllowed(res, ['POST', 'DELETE']);
  const user = await requireUser(req, res);
  if (!user) return;
  const body = readBody(req);

  if (req.method === 'DELETE') {
    const id = toId(body.id);
    if (!id) return fail(res, 400, 'invalid_id');
    let query = db().from('comments').delete().eq('id', id);
    if (!isAdmin(user)) query = query.eq('author_id', user.id); // you can only remove your own
    const gone = await run(query.select('id').maybeSingle());
    if (!gone) return fail(res, 404, 'not_found');
    return json(res, 200, { ok: true });
  }

  const text = String(body.body ?? '').trim();
  if (!text || text.length > MAX_COMMENT) return fail(res, 400, 'invalid_comment');

  let ownerId = user.id;
  if (isAdmin(user) && body.owner_id != null) {
    ownerId = toId(body.owner_id);
    const client = ownerId && await run(db().from('users').select('id').eq('id', ownerId).maybeSingle());
    if (!client) return fail(res, 404, 'not_found');
  } else if (body.owner_id != null && toId(body.owner_id) !== user.id) {
    return fail(res, 403, 'not_your_thread');
  }

  const saved = await run(db().from('comments').insert({ owner_id: ownerId, author_id: user.id, body: text })
    .select(COMMENT_COLUMNS).single());
  json(res, 200, { ok: true, comment: (await withAuthors([saved]))[0] });
});
