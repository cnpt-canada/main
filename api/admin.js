// Who is editing. Nothing here navigates anywhere: signing in happens in the page.
//
//   GET  /api/admin   → { email } for a live session, or 401 with the client id and a fresh nonce,
//                       which is everything the bar needs to put Google's own button on screen
//   POST /api/admin   → { action: "signin", credential } — the id_token Google handed the browser
//                       { action: "logout" }
//
// This route only says who you are. Saving is /api/content.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import {
  NONCE_COOKIE, NONCE_MS, adminConfig, adminEmail, cookies, newToken,
  seal, setCookie, signIn, signOut, unseal, verifyIdToken
} from './_lib/admin.js';

export default route(async (req, res) => {
  const config = adminConfig();

  if (req.method === 'POST') {
    const body = readBody(req);
    if (body.action === 'logout') {
      signOut(req, res);
      return json(res, 200, { ok: true });
    }
    if (body.action !== 'signin') return fail(res, 400, 'unknown_action');
    if (!config) return fail(res, 503, 'not_configured');

    // the nonce this page was given, which the token has to carry back
    const pending = unseal(cookies(req)[NONCE_COOKIE], config.key);
    setCookie(req, res, NONCE_COOKIE, '', 0);
    if (!pending || typeof pending.n !== 'string') return fail(res, 400, 'stale_nonce');

    let email;
    try {
      email = await verifyIdToken(body.credential, config, pending.n);
    } catch (err) {
      console.error('admin sign-in refused:', err.message);
      return fail(res, 401, 'bad_credential');
    }
    if (!config.emails.has(email)) {
      // the address is logged, not committed: this repository is public and git history is forever
      console.warn('admin sign-in by an address that is not in ADMIN_EMAILS:', email);
      return fail(res, 403, 'not_allowed');
    }
    signIn(req, res, email, config.key);
    console.log('admin signed in:', email);
    return json(res, 200, { ok: true, email });
  }

  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST']);
  if (!config) return fail(res, 503, 'not_configured');

  const email = adminEmail(req, config);
  if (email) return json(res, 200, { ok: true, email });

  // not signed in: hand back what it takes to ask Google, and keep the nonce to check the answer
  const nonce = newToken();
  setCookie(req, res, NONCE_COOKIE, seal({ n: nonce }, config.key, NONCE_MS), NONCE_MS / 1000);
  json(res, 401, { ok: false, error: 'not_signed_in', client_id: config.id, nonce });
});
