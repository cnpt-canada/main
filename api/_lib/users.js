// Who is asking: the signed-in user, and whether they may use the admin pages.
import { db, run } from './db.js';
import { fail } from './http.js';
import { getSession } from './session.js';

export const USER_COLUMNS = 'id,email,name,picture,role,created_at,last_login';

// Owners are the Google accounts listed in ADMIN_EMAILS. They are always admins, and their
// access can't be removed from the admin page, so the studio can never lock itself out.
export function isOwner(email) {
  const owners = String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return Boolean(email) && owners.includes(String(email).toLowerCase());
}

export function isAdmin(user) {
  return Boolean(user) && (user.role === 'admin' || isOwner(user.email));
}

// The fields a browser is allowed to see about a user.
export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: isAdmin(user) ? 'admin' : 'user',
    owner: isOwner(user.email),
    created_at: user.created_at,
    last_login: user.last_login
  };
}

export async function currentUser(req) {
  const session = await getSession(req);
  if (!session) return null;
  return run(db().from('users').select(USER_COLUMNS).eq('id', session.uid).maybeSingle());
}

// Returns the signed-in user, or answers 401 and returns null.
export async function requireUser(req, res) {
  const user = await currentUser(req);
  if (!user) fail(res, 401, 'signin_required');
  return user;
}

// Returns the signed-in admin, or answers 401/403 and returns null.
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdmin(user)) {
    fail(res, 403, 'admin_only');
    return null;
  }
  return user;
}

// Adds a small `client` object (name, email, picture) to rows that carry a user_id.
export async function withClients(rows) {
  const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  if (!ids.length) return rows.map((r) => ({ ...r, client: null }));
  const users = await run(db().from('users').select('id,name,email,picture').in('id', ids));
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.map((r) => ({ ...r, client: byId.get(r.user_id) || null }));
}
