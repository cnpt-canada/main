// The admin API, behind one function: /api/admin/enquiries, /onboarding, /users, /process, /meetings.
// Vercel counts every file under api/ as its own function, and the plan allows twelve, so these five
// share this one. The handlers themselves live in api/_lib/admin/, and each still checks for an admin.
import enquiries from '../_lib/admin/enquiries.js';
import meetings from '../_lib/admin/meetings.js';
import onboarding from '../_lib/admin/onboarding.js';
import process from '../_lib/admin/process.js';
import users from '../_lib/admin/users.js';
import { fail } from '../_lib/http.js';

const ROUTES = { enquiries, onboarding, users, process, meetings };

export default function handler(req, res) {
  const route = ROUTES[req.query?.section];
  if (!route) return fail(res, 404, 'not_found');
  return route(req, res);
}
