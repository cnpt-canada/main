// The first-time onboarding record: one row per client, saved step by step, then submitted.
import { db, run } from './db.js';

export const ONBOARDING_COLUMNS =
  'id,user_id,step,stage,brief,enquiry_id,tags,consultant,estimated_cost,submitted_at,created_at,updated_at';

export function loadOnboarding(userId) {
  return run(db().from('onboarding').select(ONBOARDING_COLUMNS).eq('user_id', userId).maybeSingle());
}

// What the browser sees. The estimate stays null until an admin sets it.
export function toPublicOnboarding(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    step: row.step,
    stage: row.stage,
    brief: row.brief,
    enquiry_id: row.enquiry_id,
    tags: row.tags || [],
    consultant: row.consultant,
    estimated_cost: row.estimated_cost,
    submitted_at: row.submitted_at,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}
