// GET  /api/onboarding → my onboarding so far, plus the latest enquiry I sent (to continue from it)
// PUT  /api/onboarding {step?, stage?, brief?, enquiry_id?, tags?, consultants?} → saves progress
// POST /api/onboarding → submits it. If it didn't continue an enquiry, one is created from the brief,
//                        so the studio sees it in Enquiries. Submitted answers can't be changed here.
import { db, run } from './_lib/db.js';
import { emailStudio } from './_lib/notify.js';
import { loadOnboarding, ONBOARDING_COLUMNS, toPublicOnboarding } from './_lib/onboarding.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { cleanConsultants, cleanTags, FUNDING_STAGES, MAX_MESSAGE, toId } from './_lib/rules.js';
import { requireUser } from './_lib/users.js';

const CONSULTANT_NAMES = { michael: 'Michael (Joongmin) Park', brandon: 'Brandon Siow', kenny: 'Kenny' };

async function latestEnquiry(userId) {
  const rows = await run(db().from('enquiries').select('id,stage,message,created_at')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1));
  return rows[0] || null;
}

// Checks the fields that were sent and returns them ready to save, or an error code.
async function readChanges(body, user) {
  const changes = {};
  if ('step' in body) {
    if (![1, 2, 3, 4].includes(body.step)) return { error: 'invalid_step' };
    changes.step = body.step;
  }
  if ('stage' in body) {
    if (!FUNDING_STAGES.includes(body.stage)) return { error: 'invalid_stage' };
    changes.stage = body.stage;
  }
  if ('brief' in body) {
    const brief = String(body.brief ?? '').trim();
    if (brief.length > MAX_MESSAGE) return { error: 'invalid_brief' };
    changes.brief = brief;
  }
  if ('tags' in body) {
    const tags = cleanTags(body.tags);
    if (!tags) return { error: 'invalid_tags' };
    changes.tags = tags;
  }
  if ('consultants' in body) {
    const consultants = cleanConsultants(body.consultants);
    if (!consultants) return { error: 'invalid_consultants' };
    changes.consultants = consultants;
  }
  if ('enquiry_id' in body) {
    if (body.enquiry_id === null) changes.enquiry_id = null;
    else {
      const id = toId(body.enquiry_id);
      const mine = id && await run(db().from('enquiries').select('id').eq('id', id).eq('user_id', user.id).maybeSingle());
      if (!mine) return { error: 'invalid_enquiry' };
      changes.enquiry_id = id;
    }
  }
  return { changes };
}

export default route(async (req, res) => {
  if (!['GET', 'PUT', 'POST'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PUT', 'POST']);
  const user = await requireUser(req, res);
  if (!user) return;
  const row = await loadOnboarding(user.id);

  if (req.method === 'GET') {
    return json(res, 200, { ok: true, onboarding: toPublicOnboarding(row), draft: await latestEnquiry(user.id) });
  }
  if (row && row.submitted_at) return fail(res, 409, 'already_submitted');

  if (req.method === 'PUT') {
    const { changes, error } = await readChanges(readBody(req), user);
    if (error) return fail(res, 400, error);
    const values = { ...changes, updated_at: new Date().toISOString() };
    const saved = row
      ? await run(db().from('onboarding').update(values).eq('id', row.id).select(ONBOARDING_COLUMNS).single())
      : await run(db().from('onboarding').insert({ user_id: user.id, ...values }).select(ONBOARDING_COLUMNS).single());
    return json(res, 200, { ok: true, onboarding: toPublicOnboarding(saved) });
  }

  // POST: submit
  if (!row || !row.stage || !row.brief || !row.tags?.length || !row.consultants?.length) return fail(res, 400, 'incomplete');
  let enquiryId = row.enquiry_id;
  if (!enquiryId) {
    const enquiry = await run(db().from('enquiries')
      .insert({ user_id: user.id, email: user.email, stage: row.stage, message: row.brief }).select('id').single());
    enquiryId = enquiry.id;
  }
  const now = new Date().toISOString();
  const saved = await run(db().from('onboarding')
    .update({ enquiry_id: enquiryId, step: 4, submitted_at: now, updated_at: now })
    .eq('id', row.id).select(ONBOARDING_COLUMNS).single());

  await emailStudio({
    subject: `Onboarding finished: ${user.name || user.email} (${row.stage})`,
    text: [
      `Client: ${user.name || '—'} <${user.email}>`,
      `Stage: ${row.stage}`,
      `Fields: ${row.tags.map((t) => `#${t}`).join(' ')}`,
      `Consultants: ${row.consultants.map((c) => CONSULTANT_NAMES[c]).join(', ')}`,
      '', row.brief, '',
      'Add the estimated cost on /admin → Onboarding.'
    ].join('\n'),
    replyTo: user.email
  });
  json(res, 200, { ok: true, onboarding: toPublicOnboarding(saved) });
});
