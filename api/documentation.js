// The documentation a client writes about their company: eleven sections, over as many sittings as
// it takes.
// GET  /api/documentation          → mine
// GET  /api/documentation?as=<id>  → a member's, for admins ("view as user"). Read-only.
// PUT  /api/documentation {answers} → merges answers in and saves. Sent as you write, so the client can stop
//                             and come back; an answer that arrives empty is dropped rather than stored.
// POST /api/documentation          → marks it handed over. It stays editable afterwards.
//
// The question set lives in the browser (app/documentation-questions.js) and is not mirrored here on purpose:
// this endpoint stores what it is given under whatever ids it is given, and only guards the shape and
// the size. A question can be reworded or retired without touching the server or the database.
import { db, run } from './_lib/db.js';
import { emailStudio } from './_lib/notify.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { toId } from './_lib/rules.js';
import { isAdmin, requireUser } from './_lib/users.js';

const COLUMNS = 'id,user_id,answers,submitted_at,created_at,updated_at';
const ID_RE = /^[a-z0-9_]{1,40}$/;
const MAX_ANSWER = 4000;   // one answer
const MAX_KEYS = 80;       // the question set is 30-odd; this leaves room to grow, not to be abused
const MAX_TOTAL = 96000;   // the whole object, well under the column's own limit

// Keeps what the questions are allowed to be: known-looking ids, string answers, a bounded total.
// Returns the cleaned object, or null when the shape is wrong.
export function cleanAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > MAX_KEYS) return null;
  const out = {};
  let total = 0;
  for (const key of keys) {
    if (!ID_RE.test(key)) return null;
    const value = raw[key];
    if (value === null || value === '') { out[key] = ''; continue; }   // cleared on purpose
    if (typeof value !== 'string') return null;
    const text = value.trim();
    if (text.length > MAX_ANSWER) return null;
    total += key.length + text.length;
    if (total > MAX_TOTAL) return null;
    out[key] = text;
  }
  return out;
}

// An answer that has been emptied stops being stored at all, so a document never fills with blanks.
const merge = (before, incoming) => {
  const next = { ...(before || {}) };
  for (const [k, v] of Object.entries(incoming)) {
    if (v === '') delete next[k];
    else next[k] = v;
  }
  return next;
};

const answered = (answers) => Object.values(answers || {}).filter((v) => v && v.trim()).length;

async function loadDoc(userId) {
  return run(db().from('documentation').select(COLUMNS).eq('user_id', userId).maybeSingle());
}

export default route(async (req, res) => {
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT', 'POST']);
  const user = await requireUser(req, res);
  if (!user) return;

  // an admin reading a member's documentation never writes to it
  if (req.query.as) {
    if (req.method !== 'GET') return fail(res, 400, 'read_only');
    if (!isAdmin(user)) return fail(res, 403, 'admin_only');
    const id = toId(req.query.as);
    if (!id) return fail(res, 400, 'invalid_id');
    const member = await run(db().from('users').select('id,name,email').eq('id', id).maybeSingle());
    if (!member) return fail(res, 404, 'not_found');
    const doc = await loadDoc(id);
    return json(res, 200, { ok: true, documentation: doc || null, viewing_as: member });
  }

  if (req.method === 'GET') {
    const doc = await loadDoc(user.id);
    return json(res, 200, { ok: true, documentation: doc || null });
  }

  if (req.method === 'PUT') {
    const answers = cleanAnswers(readBody(req).answers);
    if (!answers) return fail(res, 400, 'invalid_answers');
    const before = await loadDoc(user.id);
    const next = merge(before?.answers, answers);
    const now = new Date().toISOString();
    const saved = before
      ? await run(db().from('documentation').update({ answers: next, updated_at: now })
        .eq('user_id', user.id).select(COLUMNS).single())
      : await run(db().from('documentation').insert({ user_id: user.id, answers: next })
        .select(COLUMNS).single());
    return json(res, 200, { ok: true, documentation: saved });
  }

  // POST: handed over. The studio is told once; the client can still keep editing afterwards.
  const before = await loadDoc(user.id);
  if (!before || !answered(before.answers)) return fail(res, 400, 'nothing_to_send');
  const first = !before.submitted_at;
  const now = new Date().toISOString();
  const saved = await run(db().from('documentation').update({ submitted_at: before.submitted_at || now, updated_at: now })
    .eq('user_id', user.id).select(COLUMNS).single());
  if (first) {
    await emailStudio({
      subject: `Documentation submitted: ${user.name || user.email}`,
      text: [`Client: ${user.name || '—'} <${user.email}>`,
        `${answered(saved.answers)} answers.`, '',
        'Read it on /admin → Process, or open /account?as=' + user.id + '#docs.'].join('\n'),
      replyTo: user.email
    });
  }
  json(res, 200, { ok: true, documentation: saved });
});
