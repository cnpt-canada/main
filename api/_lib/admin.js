// Admin mode: who may edit the words on the site, and how that is proven.
//
// There is no user table and no session store, because there is nothing worth keeping: Google says
// who the visitor is, a list in the environment says whether that person may edit, and the answer
// rides in one signed cookie until it expires. Nothing is provisioned, so nothing can be suspended
// out from under the site — if these variables are missing the site is simply a site with no editor.
//
// Signing in happens in the page. The editor presses Google's own button in the bar at the foot of
// the screen, picks an account in Google's popup, and the page they were reading is still there
// underneath — nothing navigates away and nothing comes back on a redirect. Google hands the browser
// a signed id_token, the browser posts it here, and this file checks it: the signature against
// Google's published keys, then the issuer, the audience, the expiry, the nonce this page asked for,
// and that Google has verified the address itself. Only then is there a session.
//
// That is why there is no client secret: nothing here ever speaks to Google on the editor's behalf,
// it only reads what Google signed.
import { createHmac, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'cnpt_admin';
export const NONCE_COOKIE = 'cnpt_nonce';
export const SESSION_MS = 12 * 60 * 60 * 1000; // a working day, then sign in again
export const NONCE_MS = 15 * 60 * 1000;        // long enough to pick an account

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Admin is off unless every part of it is set: a half-configured deployment has no door rather than
// an unlocked one.
export function adminConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const emails = String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.includes('@'));
  if (!id || !emails.length || !sessionKey()) return null;
  return { id, key: sessionKey(), emails: new Set(emails) };
}

// What signs the session cookie. ADMIN_SECRET if it is set; otherwise one derived from the client
// secret the Google project already has, so a deployment that was set up for Google sign-in before
// needs nothing new. The derived key never leaves the function and signs nothing but our own cookie.
function sessionKey() {
  const given = process.env.ADMIN_SECRET;
  if (given && given.length >= 24) return given;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return secret ? createHmac('sha256', secret).update('cnpt-admin-session-v1').digest('base64url') : '';
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

// This token reached us through the browser, so every part of it is checked before it means
// anything: the signature against Google's published keys, then the issuer, the audience, the
// expiry, the nonce this page asked for, and that Google has verified the address itself.
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
