// Request/response helpers shared by every API route.
// Files under api/_lib are bundled into the functions that import them but never become routes themselves.

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

export function fail(res, status, error) {
  json(res, status, { ok: false, error });
}

export function methodNotAllowed(res, allowed) {
  res.setHeader('Allow', allowed.join(', '));
  fail(res, 405, 'method_not_allowed');
}

export function isSecure(req) {
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

// Base URL for the OAuth redirect URI. PUBLIC_URL pins it (it must match the URI registered with Google).
export function publicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  return `${isSecure(req) ? 'https' : 'http'}://${req.headers.host}`;
}

// Only paths on this site, like "/account" — never "//other.site", "/\other.site" or absolute URLs.
export function safePath(value, fallback = '/') {
  return typeof value === 'string' && /^\/(?![/\\])[^\s]*$/.test(value) ? value : fallback;
}

// Writes must come from our own pages. SameSite cookies already stop most cross-site requests;
// checking Origin as well closes the gap for older browsers.
export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser clients send no Origin, and carry no session cookie either
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function readBody(req) {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
}

export function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Adds a Set-Cookie header without dropping any set earlier in the same response.
export function setCookie(res, name, value, { maxAge, secure }) {
  const cookie = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (secure) cookie.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [].concat(prev || [], cookie.join('; ')));
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
