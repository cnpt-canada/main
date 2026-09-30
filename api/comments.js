// POST   /api/comments {body, owner_id?, internal?} → writes in a process thread. Clients write in their own;
//                                          admins write in any client's thread (owner_id), as Consultant.
//                                          The other side is emailed, so a note is not left unread.
//                                          internal: true keeps it inside the studio — the client never
//                                          sees it and no mail goes out. Admins only.
// DELETE /api/comments {id}               → removes a comment you wrote (admins can remove any).
import { db, run } from './_lib/db.js';
import { emailStudio } from './_lib/notify.js';
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
  let client = null;
  if (isAdmin(user) && body.owner_id != null) {
    ownerId = toId(body.owner_id);
    client = ownerId && await run(db().from('users').select('id,email,name').eq('id', ownerId).maybeSingle());
    if (!client) return fail(res, 404, 'not_found');
  } else if (body.owner_id != null && toId(body.owner_id) !== user.id) {
    return fail(res, 403, 'not_your_thread');
  }

  // Who wrote last, so a run of notes from one person is one email rather than one each. Only notes
  // that were actually sent count: a note the studio kept to itself never reached anyone, so it
  // cannot be the reason the next one is held back.
  const previous = await run(db().from('comments').select('author_id,created_at')
    .eq('owner_id', ownerId).eq('internal', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle());

  // a note the studio keeps to itself. A client asking for one is simply writing an ordinary note.
  const internal = isAdmin(user) && body.internal === true;

  const saved = await run(db().from('comments').insert({ owner_id: ownerId, author_id: user.id, body: text, internal })
    .select(COMMENT_COLUMNS).single());
  // sent before the reply, the way a booking is: work left running after a response can be cut short.
  // Nothing goes out for a note the studio is keeping to itself.
  if (!internal) await tellTheOtherSide({ user, client, text, previous });
  json(res, 200, { ok: true, comment: (await withAuthors([saved]))[0] });
});

// A note goes the other way: a client's reaches the studio, the studio's reaches that client. Sending
// happens after the reply, so a mail that will not go out never costs the writer their note.
const RUN_WINDOW = 15 * 60 * 1000; // a second note this soon after your own is part of the same thought

async function tellTheOtherSide({ user, client, text, previous }) {
  if (previous && previous.author_id === user.id
    && Date.now() - Date.parse(previous.created_at) < RUN_WINDOW) return;
  const who = user.name || user.email;
  const quoted = text.length > 600 ? `${text.slice(0, 600)}\u2026` : text;
  try {
    if (client) {
      await emailStudio({
        to: client.email,
        subject: 'cnpt: a new note on your project',
        text: [`${who} wrote in your project workspace:`, '', quoted, '',
          'Reply in the workspace: https://cnpt.ca/account#process'].join('\n')
      });
    } else {
      await emailStudio({
        subject: `New note from ${who}`,
        text: [`Client: ${who} <${user.email}>`, '', quoted, '',
          'Reply on /admin \u2192 Process.'].join('\n'),
        replyTo: user.email
      });
    }
  } catch (err) {
    console.error('comments: could not send the notification', err);
  }
}
