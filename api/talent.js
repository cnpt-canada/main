// POST /api/talent — the networking pool form on /network#talent.
// It emails the pool address with the category they picked in the subject, so it is clear at a
// glance who wrote in. Nothing is stored: the message is the record.
// Email: RESEND_API_KEY, TALENT_TO (falls back to CONTACT_TO), optional CONTACT_FROM — see .env.example.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { emailStudio } from './_lib/notify.js';
import { EMAIL_RE, MAX_TALENT_LINKS, MAX_TALENT_MESSAGE, MAX_TALENT_NAME, TALENT_CATEGORIES } from './_lib/rules.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const body = readBody(req);
  if (body.company_website) return json(res, 200, { ok: true }); // honeypot, same as the enquiry form

  const category = String(body.category || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const links = String(body.links || '').trim();
  const message = String(body.message || '').trim();
  if (!TALENT_CATEGORIES.some((c) => c.key === category)) return fail(res, 400, 'invalid_category');
  if (!name || name.length > MAX_TALENT_NAME) return fail(res, 400, 'invalid_name');
  if (email.length > 254 || !EMAIL_RE.test(email)) return fail(res, 400, 'invalid_email');
  if (links.length > MAX_TALENT_LINKS) return fail(res, 400, 'invalid_links');
  if (!message || message.length > MAX_TALENT_MESSAGE) return fail(res, 400, 'invalid_message');

  const label = TALENT_CATEGORIES.find((c) => c.key === category).label;
  const emailed = await emailStudio({
    to: process.env.TALENT_TO,
    subject: `Talent pool — ${label}: ${name}`,
    text: [`Category: ${label}`, `Name: ${name}`, `Email: ${email}`, links ? `Links: ${links}` : null, '', message, '',
      'Sent from the talent page on the cnpt website.'].filter((l) => l !== null).join('\n'),
    replyTo: email
  });

  if (!emailed) return fail(res, emailed === null ? 500 : 502, emailed === null ? 'not_configured' : 'send_failed');
  json(res, 200, { ok: true });
});
