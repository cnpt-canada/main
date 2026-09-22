// POST /api/auth/logout — ends the session.
import { json, methodNotAllowed, route } from '../http.js';
import { endSession } from '../session.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  endSession(req, res);
  json(res, 200, { ok: true });
});
