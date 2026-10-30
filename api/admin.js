// Who is editing. Nothing here navigates anywhere: signing in happens in the page.
//
//   GET  /api/admin   → { client_id } — what the bar needs to draw Google's own button
//   POST /api/admin   → { credential } — the id_token Google handed the browser. Answers with the
//                       address if it is one of the editors, and 403 if it is not.
//
// The browser keeps that token for the hour it is good for and sends it with each save, so this
// route hands out nothing to keep and there is no session to end. Saving is /api/content.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { adminConfig, isEditor, verifyIdToken } from './_lib/admin.js';

export default route(async (req, res) => {
  const config = adminConfig();
  if (!config) return fail(res, 503, 'not_configured');

  if (req.method === 'GET') return json(res, 200, { ok: true, client_id: config.id });
  if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

  let email;
  try {
    email = await verifyIdToken(readBody(req).credential, config);
  } catch (err) {
    console.error('admin sign-in refused:', err.message);
    return fail(res, 401, 'bad_credential');
  }
  if (!isEditor(email, config)) {
    // the address is logged, not committed: this repository is public and git history is forever
    console.warn('admin sign-in by an address that is not an editor:', email);
    return fail(res, 403, 'not_allowed');
  }
  console.log('admin signed in:', email);
  json(res, 200, { ok: true, email });
});
