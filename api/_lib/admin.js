// Admin mode: who may edit the words on the site, and how that is proven.
//
// There is no user table and no session store, because there is nothing worth keeping: Google says
// who the visitor is, a list in the environment says whether that person may edit, and the answer
// rides in one signed cookie until it expires. Nothing is provisioned, so nothing can be suspended
// out from under the site — if these variables are missing the site is simply a site with no editor.
//
// The login is the ordinary OAuth 2.0 authorization-code flow, run on the server. The browser never
// loads Google's sign-in script — it could not, the site's Content-Security-Policy allows scripts
// from this origin only — and the client secret never leaves the function.
import { createHmac, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'cnpt_admin';
export const LOGIN_COOKIE = 'cnpt_login';
export const SESSION_MS = 12 * 60 * 60 * 1000; // a working day, then sign in again
export const LOGIN_MS = 10 * 60 * 1000;        // long enough to pick an account

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Admin is off unless every part of it is set: a half-configured deployment has no door rather than
// an unlocked one.
export function adminConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const key = process.env.ADMIN_SECRET;
  const emails = String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
  if (!id || !secret || !key || key.length < 24 || !emails.length) return null;
  return { id, secret, key, emails: new Set(emails) };
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64url = (text) => Buffer.from(String(text), 'base64url');

// ─── the signed cookies ───
// The payload is readable but not forgeable: it carries its own expiry and an HMAC over both.

function mac(body, key) {
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function seal(data, key, ttl) {
  const body = b64url(JSON.stringify({ ...data, x: Date.now() + ttl }));
  return body + '.' + mac(body, key);
}

export function unseal(token, key) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const want = Buffer.from(mac(token.slice(0, dot), key));
  const got = Buffer.from(token.slice(dot + 1));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  let data;
  try {
    data = JSON.parse(unb64url(token.slice(0, dot)).toString('utf8'));
  } catch {
    return null;
  }
  return data && typeof data.x === 'number' && data.x > Date.now() ? data : null;
}

export function cookies(req) {
  const out = {};
  String(req.headers.cookie || '')
    .split(';')
    .forEach((part) => {
      const eq = part.indexOf('=');
      if (eq > 0) out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
    });
  return out;
}

// Over https — which is everywhere but a local `vercel dev` — the cookie is Secure as well.
export function setCookie(req, res, name, value, seconds) {
  const parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + seconds];
  if (proto(req) === 'https') parts.push('Secure');
  const had = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', had ? [].concat(had, parts.join('; ')) : parts.join('; '));
}

export function proto(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || '')) ? 'http' : 'https';
}

export function origin(req) {
  return proto(req) + '://' + req.headers.host;
}

export function signIn(req, res, email, key) {
  setCookie(req, res, SESSION_COOKIE, seal({ e: email }, key, SESSION_MS), SESSION_MS / 1000);
}

export function signOut(req, res) {
  setCookie(req, res, SESSION_COOKIE, '', 0);
}

// The list is checked again on every request, not just at sign-in: taking an address off
// ADMIN_EMAILS ends that person's session on their next click rather than twelve hours later.
export function adminEmail(req, config) {
  const data = unseal(cookies(req)[SESSION_COOKIE], config.key);
  const email = data && typeof data.e === 'string' ? data.e.toLowerCase() : '';
  return email && config.emails.has(email) ? email : '';
}

export const newToken = () => randomBytes(24).toString('base64url');

// ─── Google ───

export function loginUrl(config, redirectUri, state, nonce) {
  const query = new URLSearchParams({
    client_id: config.id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email',
    state,
    nonce,
    access_type: 'online',
    prompt: 'select_account' // the studio shares machines; never silently reuse the last account
  });
  return GOOGLE_AUTH + '?' + query;
}

export async function exchangeCode(config, code, redirectUri) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.id,
      client_secret: config.secret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id_token) throw new Error('token_exchange_failed: ' + (data.error || response.status));
  return data.id_token;
}

// Google's signing keys, kept for an hour. A warm function reuses them; a cold one fetches once.
let certs = { at: 0, keys: [] };
async function googleKeys() {
  if (certs.keys.length && Date.now() - certs.at < 60 * 60 * 1000) return certs.keys;
  const response = await fetch(GOOGLE_CERTS);
  if (!response.ok) throw new Error('jwks_unavailable');
  const data = await response.json();
  certs = { at: Date.now(), keys: Array.isArray(data.keys) ? data.keys : [] };
  return certs.keys;
}

// The token came straight from Google's token endpoint over TLS, so this is belt and braces — but
// the braces are cheap: the signature against Google's published keys, then the issuer, the
// audience, the expiry, the nonce this login sent, and that Google has verified the address itself.
export async function verifyIdToken(idToken, config, nonce) {
  const parts = String(idToken).split('.');
  if (parts.length !== 3) throw new Error('malformed_id_token');
  const header = JSON.parse(unb64url(parts[0]).toString('utf8'));
  const claims = JSON.parse(unb64url(parts[1]).toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('unexpected_alg: ' + header.alg);

  const jwk = (await googleKeys()).find((k) => k.kid === header.kid && k.kty === 'RSA');
  if (!jwk) throw new Error('unknown_signing_key');
  const signed = createVerify('RSA-SHA256')
    .update(parts[0] + '.' + parts[1])
    .verify(createPublicKey({ key: jwk, format: 'jwk' }), unb64url(parts[2]));
  if (!signed) throw new Error('bad_signature');

  if (!ISSUERS.includes(claims.iss)) throw new Error('bad_issuer: ' + claims.iss);
  if (claims.aud !== config.id) throw new Error('bad_audience');
  if (!(Number(claims.exp) > Math.floor(Date.now() / 1000))) throw new Error('expired');
  if (claims.nonce !== nonce) throw new Error('bad_nonce');
  if (claims.email_verified !== true || !claims.email) throw new Error('unverified_email');
  return String(claims.email).toLowerCase();
}
