// GET /api/auth/google?next=/account
// Sends the browser to Google's account chooser. Signing in for the first time creates the
// account, so this is also the sign-up path.
import { methodNotAllowed, publicUrl, redirect, route, safePath } from '../http.js';
import { createOAuthState } from '../session.js';

export default route(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return redirect(res, '/signin?error=not_configured');
  }

  const next = safePath(req.query.next, '/account');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${publicUrl(req)}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: await createOAuthState(req, res, next)
  }).toString();
  redirect(res, url.toString());
});
