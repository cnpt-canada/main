// Contact form endpoint (Vercel serverless function).
// Validates a submission from the #contact form and forwards it by email through Resend.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  API key from resend.com
//   CONTACT_TO      inbox(es) that receive enquiries, comma-separated
//   CONTACT_FROM    optional sender; defaults to Resend's shared address until a domain is verified

const STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];
const MAX_MESSAGE = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  // honeypot: people never see this field, so anything in it came from a bot
  if (body.company_website) return res.status(200).json({ ok: true });

  const stage = String(body.stage || '').trim();
  const email = String(body.email || '').trim();
  const message = String(body.message || '').trim();

  if (!STAGES.includes(stage)) return res.status(400).json({ ok: false, error: 'invalid_stage' });
  if (email.length > 254 || !EMAIL_RE.test(email)) return res.status(400).json({ ok: false, error: 'invalid_email' });
  if (!message || message.length > MAX_MESSAGE) return res.status(400).json({ ok: false, error: 'invalid_message' });

  const key = process.env.RESEND_API_KEY;
  const to = String(process.env.CONTACT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) {
    console.error('contact: RESEND_API_KEY or CONTACT_TO is not set');
    return res.status(500).json({ ok: false, error: 'not_configured' });
  }

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || 'cnpt website <onboarding@resend.dev>',
      to,
      reply_to: email,
      subject: `New enquiry (${stage})`,
      text: `Stage: ${stage}\nEmail: ${email}\n\n${message}\n\nSent from the contact form on the cnpt website.`
    })
  }).catch((err) => {
    console.error('contact: request to Resend failed', err);
    return null;
  });

  if (!sent || !sent.ok) {
    if (sent) console.error('contact: Resend responded', sent.status, await sent.text());
    return res.status(502).json({ ok: false, error: 'send_failed' });
  }
  return res.status(200).json({ ok: true });
};
