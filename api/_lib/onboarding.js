// The step-by-step enquiry flow: one row per account holding the draft being filled in (saved at every
// step, cleared once it is sent) and when the account finished its first run (its onboarding).
import { db, run } from './db.js';

export const ONBOARDING_COLUMNS = 'id,user_id,step,stage,brief,enquiry_id,tags,focus,consultants,submitted_at,skipped_at,created_at,updated_at';
export const EMPTY_DRAFT = { step: 1, stage: null, brief: null, enquiry_id: null, tags: [], focus: null, consultants: [] };
export const LAST_STEP = 5; // company, field, focal, consultants, confirm

// Whether an account still owes us the welcome flow: it has never sent an enquiry and never chose to
// skip. Sign-in and the workspace both ask this, so the answer is the same wherever a client arrives.
export async function welcomePending(userId) {
  const row = await run(db().from('onboarding').select('submitted_at,skipped_at').eq('user_id', userId).maybeSingle());
  return !row?.submitted_at && !row?.skipped_at;
}

export function loadOnboarding(userId) {
  return run(db().from('onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle());
}

// What the browser sees.
export function toPublicOnboarding(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    step: row.step,
    stage: row.stage,
    brief: row.brief,
    enquiry_id: row.enquiry_id,
    tags: row.tags || [],
    focus: row.focus || null,
    consultants: row.consultants || [],
    submitted_at: row.submitted_at,
    skipped_at: row.skipped_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
