// GET /api/auth/callback?code=…&state=…
// Google sends the browser back here. Exchanges the one-time code for the user's Google identity,
// creates or updates the account, attaches earlier enquiries sent from the same address, and starts
// the session. Every failure goes back to /signin with a reason the page can explain.
import { decodeJwt } from 'jose';
import { db, run } from '../db.js';
import { methodNotAllowed, publicUrl, redirect, route, safePath } from '../http.js';
import { welcomePending } from '../onboarding.js';
import { isAdmin } from '../users.js';
import { consumeOAuthState, startSession } from '../session.js';

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Where a sign-in ends. A client who has never told us about their company opens the welcome flow
// instead of the workspace — decided here so the browser makes one jump, not two.
async function landing(user, next) {
  const asked = safePath(next, '/account');
  if (isAdmin(user)) return asked;                     // owners from ADMIN_EMAILS count, whatever the row says
  try {
    if (await welcomePending(user.id)) return '/onboarding';
  } catch (err) {
    console.error('auth: could not read the welcome flow', err);   // the workspace asks again on arrival
  }
  return asked;
}

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const back = (reason) => redirect(res, `/signin?error=${reason}`);

  const saved = await consumeOAuthState(req, res, String(req.query.state || ''));
  if (req.query.error) return back('cancelled');
  if (!saved || !req.query.code) return back('expired');

  let claims;
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${publicUrl(req)}/api/auth/callback`,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) {
      console.error('auth: token exchange failed', tokenRes.status, await tokenRes.text());
      return back('google');
    }
    const { id_token: idToken } = await tokenRes.json();
    // The id_token arrives directly from Google's token endpoint over TLS (not through the browser),
    // so its claims are checked here rather than its signature.
    claims = idToken ? decodeJwt(idToken) : {};
  } catch (err) {
    console.error('auth: could not reach Google', err);
    return back('google');
  }

  const valid =
    GOOGLE_ISSUERS.includes(claims.iss) &&
    claims.aud === process.env.GOOGLE_CLIENT_ID &&
    typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() &&
    typeof claims.sub === 'string' && claims.sub &&
    typeof claims.email === 'string' &&
    (claims.email_verified === true || claims.email_verified === 'true');
  if (!valid) return back('google');

  const email = claims.email.toLowerCase();
  const profile = {
    email,
    name: typeof claims.name === 'string' ? claims.name.slice(0, 200) : null,
    picture: typeof claims.picture === 'string' && claims.picture.startsWith('https://') ? claims.picture : null,
    last_login: new Date().toISOString()
  };

  let user;
  try {
    const existing = await run(db().from('users').select('id').eq('google_sub', claims.sub).maybeSingle());
    user = existing
      ? await run(db().from('users').update(profile).eq('id', existing.id).select('id, role').single())
      : await run(db().from('users').insert({ google_sub: claims.sub, ...profile }).select('id, role').single());
    // enquiries sent before signing up, from this same Google-verified address, now belong to the account
    await run(db().from('enquiries').update({ user_id: user.id }).is('user_id', null).eq('email', email));
  } catch (err) {
    console.error('auth: could not save the user', err);
    return back('server');
  }

  await startSession(req, res, user.id);
  redirect(res, await landing({ ...user, email }, saved.next));
});
