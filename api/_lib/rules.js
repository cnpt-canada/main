// Allowed values and limits, used to validate every write. supabase/schema.sql enforces the same lists.

export const FUNDING_STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];
export const ENQUIRY_STATUSES = ['new', 'in_review', 'replied', 'closed'];
export const PROJECT_STAGES = ['frame', 'concept', 'system', 'entry'];
export const PROJECT_STATUSES = ['active', 'paused', 'complete'];
export const ROLES = ['user', 'admin'];

export const MAX_MESSAGE = 500;
export const MAX_TITLE = 120;
export const MAX_NOTE = 2000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isId(value) {
  return Number.isInteger(value) && value > 0;
}

// Accepts ids sent as numbers or numeric strings (query strings are always strings).
export function toId(value) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return isId(n) ? n : null;
}
