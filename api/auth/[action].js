// Google sign-in, behind one function: /api/auth/google, /callback, /logout, /me.
// Vercel counts every file under api/ as its own function, and the plan allows twelve, so the four
// sign-in routes share this one. The handlers themselves live in api/_lib/auth/.
import callback from '../_lib/auth/callback.js';
import google from '../_lib/auth/google.js';
import logout from '../_lib/auth/logout.js';
import me from '../_lib/auth/me.js';
import { fail } from '../_lib/http.js';

const ROUTES = { google, callback, logout, me };

export default function handler(req, res) {
  const route = ROUTES[req.query?.action];
  if (!route) return fail(res, 404, 'not_found');
  return route(req, res);
}
