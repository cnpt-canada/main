// Emails the studio through Resend: new enquiries and finished onboardings.
// Env: RESEND_API_KEY, CONTACT_TO (comma-separated), optional CONTACT_FROM — see .env.example.
// `to` overrides CONTACT_TO, which the talent pool uses to reach talent@cnpt.ca instead.

// Returns true when sent, false when sending failed, null when email isn't set up.
export async function emailStudio({ subject, text, replyTo, to: toOverride }) {
  const key = process.env.RESEND_API_KEY;
  const to = String(toOverride || process.env.CONTACT_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key || !to.length) return null;

  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.CONTACT_FROM || 'cnpt website <onboarding@resend.dev>',
      to,
      reply_to: replyTo,
      subject,
      text
    })
  }).catch((err) => {
    console.error('notify: request to Resend failed', err);
    return null;
  });
  if (sent && sent.ok) return true;
  if (sent) console.error('notify: Resend responded', sent.status, await sent.text());
  return false;
}
