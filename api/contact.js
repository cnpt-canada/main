// POST /api/contact — the enquiry form on the home page. No sign-in needed.
// Saves the enquiry (linked to the account when the sender is signed in) and emails it to the studio.
// It succeeds when either step works, so a missing email setup never loses an enquiry.
// Email: RESEND_API_KEY, CONTACT_TO (comma-separated), optional CONTACT_FROM — see .env.example.
import { db, hasDb, run } from './_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { emailStudio } from './_lib/notify.js';
import { EMAIL_RE, FUNDING_STAGES, MAX_MESSAGE } from './_lib/rules.js';
import { currentUser } from './_lib/users.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = readBody(req);
  // honeypot: people never see this field, so anything in it came from a bot
  if (body.company_website) return json(res, 200, { ok: true });

  const stage = String(body.stage || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  if (!FUNDING_STAGES.includes(stage)) return fail(res, 400, 'invalid_stage');
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(res, 400, 'invalid_email');
  if (!message || message.length > MAX_MESSAGE) return fail(res, 400, 'invalid_message');

  const user = await currentUser(req).catch(() => null);
  const saved = hasDb()
    ? await run(db().from('enquiries').insert({ user_id: user ? user.id : null, stage, email, message }))
        .then(() => true, (err) => { console.error('contact: could not save the enquiry', err); return false; })
    : false;
  const emailed = await notifyStudio({ stage, email, message, account: user });

  if (!saved && !emailed) {
    const notSetUp = !hasDb() && emailed === null;
    return fail(res, notSetUp ? 500 : 502, notSetUp ? 'not_configured' : 'send_failed');
  }
  json(res, 200, { ok: true });
});

// Emails the enquiry to the studio. Returns true when sent, false when sending failed, null when not set up.
function notifyStudio({ stage, email, message, account }) {
  const lines = [`Stage: ${stage}`, `Email: ${email}`];
  if (account) lines.push(`Account: ${account.name || account.email}`);
  return emailStudio({
    subject: `New enquiry (${stage})`,
    text: `${lines.join('\n')}\n\n${message}\n\nSent from the contact form on the cnpt website.`,
    replyTo: email
  });
}
