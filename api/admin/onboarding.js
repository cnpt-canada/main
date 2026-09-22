// GET   /api/admin/onboarding                          → every client's onboarding, most recently updated first
// PATCH /api/admin/onboarding {user_id, estimated_cost} → sets the estimate in CAD (null clears it).
//                                                        The client sees "Estimating…" until it's set.
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { ONBOARDING_COLUMNS, toPublicOnboarding } from '../_lib/onboarding.js';
import { MAX_COST, toId } from '../_lib/rules.js';
import { requireAdmin, withClients } from '../_lib/users.js';

const withClient = async (rows) => (await withClients(rows)).map((r) => ({ ...toPublicOnboarding(r), client: r.client }));

export default route(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'PATCH']);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const rows = await run(db().from('onboarding').select(ONBOARDING_COLUMNS).order('updated_at', { ascending: false }).limit(500));
    return json(res, 200, { ok: true, onboarding: await withClient(rows) });
  }

  const body = readBody(req);
  const userId = toId(body.user_id);
  if (!userId) return fail(res, 400, 'invalid_id');
  const cost = body.estimated_cost;
  if (cost !== null && !(Number.isInteger(cost) && cost >= 0 && cost <= MAX_COST)) return fail(res, 400, 'invalid_cost');
  const row = await run(db().from('onboarding').update({ estimated_cost: cost })
    .eq('user_id', userId).select(ONBOARDING_COLUMNS).maybeSingle());
  if (!row) return fail(res, 404, 'not_found');
  json(res, 200, { ok: true, onboarding: (await withClient([row]))[0] });
});
