// GET /api/auth/me → { user } for the signed-in visitor, or { user: null }. A client who has not been
// through the welcome flow is marked, so every door into the workspace sends them to the same place.
// Answers null rather than an error when sign-in isn't set up yet, so the public pages never break.
import { json, methodNotAllowed, route } from '../http.js';
import { welcomePending } from '../onboarding.js';
import { currentUser, toPublicUser } from '../users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  let user = null;
  try {
    user = await currentUser(req);
  } catch (err) {
    console.error('auth/me:', err.message);
  }
  if (!user) return json(res, 200, { user: null });

  let pending = false;
  if (user.role !== 'admin') {
    try {
      pending = await welcomePending(user.id);
    } catch (err) {
      console.error('auth/me: could not read the welcome flow', err.message);   // the workspace asks again
    }
  }
  json(res, 200, { user: { ...toPublicUser(user), welcome_pending: pending } });
});
