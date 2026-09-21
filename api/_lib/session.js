// Sessions: an HttpOnly cookie holding a signed JWT with the user's id.
// The role is not stored in the cookie; it is read from the database on every request,
// so granting or removing admin access (or deleting the account) takes effect immediately.
import { randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { isSecure, readCookie, setCookie } from './http.js';

const SESSION_DAYS = 30;
const STATE_MINUTES = 10;

// "__Host-" cookies are only accepted over HTTPS, for this exact host and path; plain names are used on local http.
const sessionCookie = (req) => (isSecure(req) ? '__Host-cnpt_session' : 'cnpt_session');
const stateCookie = (req) => (isSecure(req) ? '__Host-cnpt_oauth' : 'cnpt_oauth');

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error('JWT_SECRET is missing or shorter than 32 characters');
  return new TextEncoder().encode(s);
}

function sign(payload, expiresIn, audience) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(secret());
}

async function verify(token, audience) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'], audience });
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(req) {
  const payload = await verify(readCookie(req, sessionCookie(req)), 'session');
  return payload && Number.isInteger(payload.uid) ? payload : null;
}

export async function startSession(req, res, uid) {
  const token = await sign({ uid }, `${SESSION_DAYS}d`, 'session');
  setCookie(res, sessionCookie(req), token, { maxAge: SESSION_DAYS * 86400, secure: isSecure(req) });
}

export function endSession(req, res) {
  setCookie(res, sessionCookie(req), '', { maxAge: 0, secure: isSecure(req) });
}

// OAuth state: a signed token carrying where to go afterwards plus a random nonce. The nonce is also
// kept in a short-lived cookie, so a callback only completes in the browser that started the sign-in
// (this stops someone from signing a visitor into the attacker's own account).
export async function createOAuthState(req, res, next) {
  const nonce = randomBytes(24).toString('base64url');
  setCookie(res, stateCookie(req), nonce, { maxAge: STATE_MINUTES * 60, secure: isSecure(req) });
  return sign({ next, nonce }, `${STATE_MINUTES}m`, 'oauth-state');
}

export async function consumeOAuthState(req, res, state) {
  const nonce = readCookie(req, stateCookie(req));
  setCookie(res, stateCookie(req), '', { maxAge: 0, secure: isSecure(req) });
  const payload = await verify(state, 'oauth-state');
  return payload && nonce && payload.nonce === nonce ? payload : null;
}
