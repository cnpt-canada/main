// Who is editing. Nothing here navigates anywhere: signing in happens in the page.
//
//   GET  /api/admin?signin=1 → off to Google's account chooser. The page opens this in a popup, so
//                       this is the popup's first stop and the page itself never moves.
//   GET  /api/admin   → { client_id }, which is all there is to say about how to sign in, and
//                       whether this deployment can commit a save at all
//   POST /api/admin   → { credential } — the id_token Google handed the browser. Answers with the
//                       address if it is one of the editors, and 403 if it is not.
//
// The browser keeps that token for the hour it is good for and sends it with each save, so this
// route hands out nothing to keep and there is no session to end. Saving is /api/content.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { adminConfig, chooserUrl, isEditor, origin, verifyIdToken } from './_lib/admin.js';
import { repoConfig } from './_lib/github.js';

export default route(async (req, res) => {
  const config = adminConfig();
  if (!config) return fail(res, 503, 'not_configured');

  if (req.method === 'GET' && req.query.signin) {
    res.statusCode = 302;
    res.setHeader('Location', chooserUrl(config, origin(req)));
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  // save says whether a commit can be made, not how: the repository is public and the token it
  // would be made with is never named here. An editor is told before typing, rather than at Save.
  if (req.method === 'GET') return json(res, 200, { ok: true, client_id: config.id, save: Boolean(repoConfig()) });
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
  json(res, 200, { ok: true, email, save: Boolean(repoConfig()) });
});
