// GET /api/auth/callback — where Google sends the sign-in popup back to.
//
// Google puts the id_token in the URL fragment, which never reaches a server, so there is nothing
// for this route to read: it serves a blank page whose only job is to hand the token to the page
// that opened it and close itself. The address of this path is the one the Google client has
// registered, which is why the sign-in needs nothing set up.
import { route } from '../_lib/http.js';

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signing in</title>
<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/site.css"></head>
<body><script src="/auth-done.js"></script></body></html>
`;

export default route(async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(PAGE);
});
