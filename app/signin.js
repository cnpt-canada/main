// /signin — the door to the workspace: one button that starts Google sign-in, and a first sign-in
// creates the account. Afterwards the browser lands on the project phase.
import { api, safeNext } from '/app/common.js';

const MESSAGES = {
  cancelled: 'Sign-in was cancelled. You can try again whenever you are ready.',
  expired: 'That sign-in attempt expired. Please try again.',
  google: 'Google could not confirm your account. Please try again.',
  not_configured: 'Sign-in is not available yet. Please email info@cnpt.ca in the meantime.',
  server: 'Something went wrong on our side. Please try again.'
};

const params = new URLSearchParams(location.search);
const next = safeNext(params.get('next'), '/account#process');
document.getElementById('google').href = `/api/auth/google?next=${encodeURIComponent(next)}`;

const error = params.get('error');
if (error) {
  const box = document.getElementById('error');
  box.textContent = MESSAGES[error] || MESSAGES.server;
  box.hidden = false;
}

// already signed in: skip this page
try {
  const { user } = await api('/api/auth/me');
  if (user) location.replace(next);
} catch {
  // stay on the page
}
