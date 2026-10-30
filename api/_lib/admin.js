// Admin mode: who may edit the words on the site, and how that is proven.
//
// Signing in happens in the page. The editor presses Google's own button in the bar at the foot of
// the screen, picks an account in Google's popup, and the page they were reading is still there
// underneath — nothing navigates away. Google hands the browser a signed id_token; the browser sends
// that token with every request it makes here, and every request checks it from scratch: the
// signature against Google's published keys, then the issuer, the audience, the expiry, and that
// Google has verified the address. Then the address has to be one of the editors.
//
// So there is no session store, no session cookie and no secret of our own to keep — Google's own
// token, good for about an hour, is the whole proof. Nothing can be forged without Google's signing
// key, and because nothing rides in a cookie there is no cross-site request to defend against.
//
// The two things this needs are the Google client id, which is a public value (it is handed to every
// browser that loads the sign-in button), and the list of editors, which is held as SHA-256 of each
// address so that this public repository carries no one's email. Either can be overridden by
// GOOGLE_CLIENT_ID and ADMIN_EMAILS, which is how a different studio, or a new address, gets in
// without a commit.
import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

// Where Google is allowed to send the popup back to. This path is what the client has registered as
// an authorised redirect URI, which is why the sign-in works with nothing added in Google Cloud.
export const CALLBACK = '/api/auth/callback';

// Google Cloud → Credentials → "cnpt web". Public: it is in every page that draws the button.
const CLIENT_ID = '1018487057646-ugttb3b2j04g0uu770t3uo6pjlsmk00k.apps.googleusercontent.com';

// sha256 of each editor's Google address
const EDITORS = [
  '6554a5d71ba5f6f52ca955043ed5e1f5c0f68c7db51b6208d6e2482078b574bb',
  'ab223473cc75f1ddc14383e5f08b43dfcacfef1e2a7cdd12bca462ca1f7ed11e'
];

const fingerprint = (email) => createHash('sha256').update(String(email).trim().toLowerCase()).digest('hex');

export function adminConfig() {
  const id = process.env.GOOGLE_CLIENT_ID || CLIENT_ID;
  const named = String(process.env.ADMIN_EMAILS || '')
    .split(/[,;\s]+/)
    .filter((s) => s.includes('@'))
    .map(fingerprint);
  const editors = new Set(named.length ? named : EDITORS);
  return id && editors.size ? { id, editors } : null;
}

const unb64url = (text) => Buffer.from(String(text), 'base64url');

export function proto(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (forwarded) return forwarded;
  return /^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || '')) ? 'http' : 'https';
}

export function origin(req) {
  return proto(req) + '://' + req.headers.host;
}

// Google's account chooser, asked for the identity and nothing else. response_type=id_token means
// Google hands the answer straight to the browser as a signed token, so there is no code to
// exchange and no client secret anywhere in this site.
export function chooserUrl(config, from) {
  const query = new URLSearchParams({
    client_id: config.id,
    redirect_uri: from + CALLBACK,
    response_type: 'id_token',
    scope: 'openid email',
    nonce: randomBytes(16).toString('base64url'),
    prompt: 'select_account' // the studio shares machines; never silently reuse the last account
  });
  return GOOGLE_AUTH + '?' + query;
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

export async function verifyIdToken(idToken, config) {
  const parts = String(idToken || '').split('.');
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
  if (claims.email_verified !== true || !claims.email) throw new Error('unverified_email');
  return String(claims.email).toLowerCase();
}

export function isEditor(email, config) {
  return config.editors.has(fingerprint(email));
}

// The address behind this request, or '' — the token travels in the Authorization header, so it is
// checked again on every save rather than trusted because a cookie was set once.
export async function editor(req, config) {
  const header = String(req.headers.authorization || '');
  if (!/^Bearer /.test(header)) return '';
  let email;
  try {
    email = await verifyIdToken(header.slice(7), config);
  } catch (err) {
    console.warn('admin token refused:', err.message);
    return '';
  }
  return isEditor(email, config) ? email : '';
}
