// The way in to admin mode, and the only route Google talks to.
//
//   GET  /api/admin             → who is signed in: { email }, or 401, for the mark in the footer
//   GET  /api/admin?login=1     → off to Google, with the page to come back to
//   GET  /api/admin?code=…      → back from Google. This URL is the redirect URI registered there.
//   POST /api/admin             → { action: "logout" }
//
// Nothing here can edit anything: this route only says who you are. Saving is /api/content.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import {
  LOGIN_COOKIE, LOGIN_MS, adminConfig, adminEmail, cookies, exchangeCode, loginUrl,
  newToken, origin, seal, setCookie, signIn, signOut, unseal, verifyIdToken
} from './_lib/admin.js';

// Only ever back to a path on this site, never to an address an attacker put in the link.
function safeNext(value) {
  const next = Array.isArray(value) ? value[0] : value;
  return /^\/(?!\/)[^\s#]*$/.test(String(next || '')) ? String(next) : '/';
}

function goTo(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

const first = (value) => String(Array.isArray(value) ? value[0] : value || '');

export default route(async (req, res) => {
  const config = adminConfig();

  if (req.method === 'GET' && (req.query.login || req.query.code || req.query.error)) {
    if (!config) return fail(res, 503, 'not_configured');
    // Google matches this against the registered URI exactly, so it is the deployment's own origin
    // unless ADMIN_REDIRECT_URI overrides it (a preview deployment, say, has another host).
    const redirectUri = process.env.ADMIN_REDIRECT_URI || origin(req) + '/api/admin';

    if (req.query.login) {
      const state = newToken();
      const nonce = newToken();
      setCookie(req, res, LOGIN_COOKIE,
        seal({ s: state, n: nonce, next: safeNext(req.query.next) }, config.key, LOGIN_MS), LOGIN_MS / 1000);
      return goTo(res, loginUrl(config, redirectUri, state, nonce));
    }

    // back from Google: the login cookie says which login this is an answer to, and is spent here
    const pending = unseal(cookies(req)[LOGIN_COOKIE], config.key);
    setCookie(req, res, LOGIN_COOKIE, '', 0);
    const next = pending ? safeNext(pending.next) : '/';
    if (req.query.error) return goTo(res, next + '#admin-error'); // or the editor pressed Cancel
    if (!pending || pending.s !== first(req.query.state)) return goTo(res, next + '#admin-error');

    let email;
    try {
      email = await verifyIdToken(await exchangeCode(config, first(req.query.code), redirectUri), config, pending.n);
    } catch (err) {
      console.error('admin sign-in refused:', err.message);
      return goTo(res, next + '#admin-error');
    }
    if (!config.emails.has(email)) {
      // the address is logged, not committed: this repository is public and git history is forever
      console.warn('admin sign-in by an address that is not in ADMIN_EMAILS:', email);
      return goTo(res, next + '#admin-denied');
    }
    signIn(req, res, email, config.key);
    console.log('admin signed in:', email);
    return goTo(res, next + '#admin');
  }

  if (req.method === 'POST') {
    if (readBody(req).action !== 'logout') return fail(res, 400, 'unknown_action');
    signOut(req, res);
    return json(res, 200, { ok: true });
  }

  if (req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST']);
  if (!config) return fail(res, 503, 'not_configured');
  const email = adminEmail(req, config);
  if (!email) return fail(res, 401, 'not_signed_in');
  json(res, 200, { ok: true, email });
});
