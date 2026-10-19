// Request/response helpers shared by the two form routes.
// Files under api/_lib are bundled into the functions that import them but never become routes themselves.

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function fail(res, status, error) {
  json(res, status, { ok: false, error });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, 'method_not_allowed');
}

// Writes must come from our own pages: checking Origin keeps the forms from being posted elsewhere.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients send no Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function readBody(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

// Wraps a route: rejects cross-site writes and turns unexpected errors into a plain 500.
export function route(handler) {
  return async (req, res) => {
    try {
      req.query = req.query || {};
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !sameOrigin(req)) return fail(res, 403, 'bad_origin');
      await handler(req, res);
    } catch (err) {
      console.error(`${req.method} ${req.url}:`, err);
      if (!res.headersSent) fail(res, 500, 'server_error');
    }
  };
}
