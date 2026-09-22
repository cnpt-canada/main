// The step-by-step enquiry flow (/onboarding): the first thing a new client does, and how anyone signed in
// sends a new enquiry afterwards.
// GET  /api/onboarding → my draft so far; on the first run also the enquiry I sent from the website (to continue it)
// PUT  /api/onboarding {step?, stage?, brief?, enquiry_id?, tags?, focus?, consultants?} → saves the draft
// POST /api/onboarding → sends it: completes the website enquiry it continues, or creates a new one, with the
//                        fields, focal split and consultants on it. The draft is then cleared for next time.
import { db, run } from './_lib/db.js';
import { emailStudio } from './_lib/notify.js';
import { EMPTY_DRAFT, LAST_STEP, loadOnboarding, ONBOARDING_COLUMNS, toPublicOnboarding } from './_lib/onboarding.js';
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { cleanConsultants, cleanFocus, cleanTags, FOCUS_AREAS, FUNDING_STAGES, MAX_MESSAGE, toId } from './_lib/rules.js';
import { requireUser } from './_lib/users.js';

const CONSULTANT_NAMES = { michael: 'Michael (Joongmin) Park', brandon: 'Brandon Siow', kenny: 'Kenny' };
const FOCUS_NAMES = { research: 'Research', branding: 'Branding', product: 'Product Developing', advertising: 'Advertising' };
const focusText = (focus) => FOCUS_AREAS.map((a, i) => `${FOCUS_NAMES[a]} ${focus[i]}%`).join(' · ');

// A plain enquiry from the website form (no fields yet) that the first run can pick up.
async function websiteEnquiry(userId) {
  const rows = await run(db().from('enquiries').select('id,stage,message,created_at,consultants')
    .eq('user_id', userId).order('created_at', { ascending: false }).limit(1));
  const e = rows[0];
  return e && !e.consultants?.length ? { id: e.id, stage: e.stage, message: e.message, created_at: e.created_at } : null;
}

// Checks the fields that were sent and returns them ready to save, or an error code.
async function readChanges(body, user) {
  const changes = {};
  if ('step' in body) {
    if (!(Number.isInteger(body.step) && body.step >= 1 && body.step <= LAST_STEP)) return { error: 'invalid_step' };
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
  if ('focus' in body) {
    const focus = cleanFocus(body.focus);
    if (!focus) return { error: 'invalid_focus' };
    changes.focus = focus;
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
    const firstRun = !row?.submitted_at;
    return json(res, 200, { ok: true, onboarding: toPublicOnboarding(row), draft: firstRun ? await websiteEnquiry(user.id) : null });
  }

  if (req.method === 'PUT') {
    const { changes, error } = await readChanges(readBody(req), user);
    if (error) return fail(res, 400, error);
    const values = { ...changes, updated_at: new Date().toISOString() };
    const saved = row
      ? await run(db().from('onboarding').update(values).eq('id', row.id).select(ONBOARDING_COLUMNS).single())
      : await run(db().from('onboarding').insert({ user_id: user.id, ...values }).select(ONBOARDING_COLUMNS).single());
    return json(res, 200, { ok: true, onboarding: toPublicOnboarding(saved) });
  }

  // POST: send
  if (!row || !row.stage || !row.brief || !row.tags?.length || !row.focus || !row.consultants?.length) return fail(res, 400, 'incomplete');
  const now = new Date().toISOString();
  const fields = { stage: row.stage, message: row.brief, tags: row.tags, focus: row.focus, consultants: row.consultants };
  const continued = row.enquiry_id && await run(db().from('enquiries')
    .update({ ...fields, updated_at: now }).eq('id', row.enquiry_id).eq('user_id', user.id).select('id').maybeSingle());
  const enquiry = continued || await run(db().from('enquiries')
    .insert({ user_id: user.id, email: user.email, ...fields }).select('id').single());
  const firstRun = !row.submitted_at;
  const saved = await run(db().from('onboarding')
    .update({ ...EMPTY_DRAFT, submitted_at: row.submitted_at || now, updated_at: now })
    .eq('id', row.id).select(ONBOARDING_COLUMNS).single());

  await emailStudio({
    subject: `${firstRun ? 'Onboarding finished' : 'New enquiry'}: ${user.name || user.email} (${row.stage})`,
    text: [
      `Client: ${user.name || '—'} <${user.email}>`,
      `Stage: ${row.stage}`,
      `Fields: ${row.tags.map((t) => `#${t}`).join(' ')}`,
      `Focal: ${focusText(row.focus)}`,
      `Consultants: ${row.consultants.map((c) => CONSULTANT_NAMES[c]).join(', ')}`,
      '', row.brief, '',
      `Add the estimated cost on /admin → Enquiries → #${enquiry.id}.`
    ].join('\n'),
    replyTo: user.email
  });
  json(res, 200, { ok: true, onboarding: toPublicOnboarding(saved), enquiry_id: enquiry.id, first_run: firstRun });
});
