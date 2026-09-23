// GET    /api/admin/onboarding           → every account's run through the step-by-step flow, most recently
//                                          updated first: finished (submitted_at) or where they stopped, with
//                                          the draft answers so far. Estimates live on the enquiries.
// DELETE /api/admin/onboarding {user_id}  → throws away someone's draft. They start the flow again from the
//                                          beginning; enquiries they have already sent are untouched.
import { db, run } from '../db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../http.js';
import { ONBOARDING_COLUMNS, toPublicOnboarding } from '../onboarding.js';
import { toId } from '../rules.js';
import { requireAdmin, withClients } from '../users.js';

const METHODS = ['GET', 'DELETE'];

export default route(async (req, res) => {
  if (!METHODS.includes(req.method)) return methodNotAllowed(res, METHODS);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'DELETE') {
    const userId = toId(readBody(req).user_id);
    if (!userId) return fail(res, 400, 'invalid_id');
    const gone = await run(db().from('onboarding').delete().eq('user_id', userId).select('user_id').maybeSingle());
    if (!gone) return fail(res, 404, 'not_found');
    return json(res, 200, { ok: true, user_id: userId });
  }

  const rows = await run(db().from('onboarding').select(ONBOARDING_COLUMNS).order('updated_at', { ascending: false }).limit(500));
  json(res, 200, { ok: true, onboarding: (await withClients(rows)).map((r) => ({ ...toPublicOnboarding(r), client: r.client })) });
});
