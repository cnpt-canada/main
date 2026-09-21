// GET /api/auth/me → { user } for the signed-in visitor, or { user: null }.
// Answers null rather than an error when sign-in isn't set up yet, so the public pages never break.
import { json, methodNotAllowed, route } from '../_lib/http.js';
import { currentUser, toPublicUser } from '../_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  let user = null;
  try {
    user = await currentUser(req);
  } catch (err) {
    console.error('auth/me:', err.message);
  }
  json(res, 200, { user: user ? toPublicUser(user) : null });
});
