// GET /api/admin/onboarding → every account's run through the step-by-step flow, most recently updated first:
// finished (submitted_at) or where they stopped, with the draft answers so far. Estimates live on the enquiries.
import { db, run } from '../db.js';
import { json, methodNotAllowed, route } from '../http.js';
import { ONBOARDING_COLUMNS, toPublicOnboarding } from '../onboarding.js';
import { requireAdmin, withClients } from '../users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!(await requireAdmin(req, res))) return;
  const rows = await run(db().from('onboarding').select(ONBOARDING_COLUMNS).order('updated_at', { ascending: false }).limit(500));
  json(res, 200, { ok: true, onboarding: (await withClients(rows)).map((r) => ({ ...toPublicOnboarding(r), client: r.client })) });
});
