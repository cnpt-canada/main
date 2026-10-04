// POST /api/contact — the short note under "Tell us what market you are walking into" on the home
// page. No sign-in needed, and nothing to fill in but an address and a line: the long route is
// Start a project, which signs the client in and opens a workspace, and that is more than someone
// asking a first question wants to do.
//
// The note is emailed to the studio with the sender as reply-to, so a reply is one click and lands
// in their inbox rather than in a system they would have to log into to read.
// Email: RESEND_API_KEY, CONTACT_TO, optional CONTACT_FROM — see .env.example.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { emailStudio } from './_lib/notify.js';
import { EMAIL_RE, MAX_CONTACT_MESSAGE } from './_lib/rules.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = readBody(req);
  if (body.company_website) return json(res, 200, { ok: true }); // honeypot, same as the other forms

  const email = String(body.email || '').trim().toLowerCase();
  const message = String(body.message || '').trim();
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(res, 400, 'invalid_email');
  if (!message || message.length > MAX_CONTACT_MESSAGE) return fail(res, 400, 'invalid_message');

  // Nothing is stored: there is no table behind this and adding one would be a migration for a form
  // whose whole point is to be small. If the mail does not go, the page says so and shows the
  // address to write to, rather than accepting the note and losing it.
  const emailed = await emailStudio({
    subject: `Website enquiry from ${email}`,
    text: [message, '', `From: ${email}`, 'Sent from the short form on the cnpt home page.'].join('\n'),
    replyTo: email
  });
  if (emailed !== true) {
    return fail(res, emailed === null ? 500 : 502, emailed === null ? 'not_configured' : 'send_failed');
  }
  json(res, 200, { ok: true });
});
