// Allowed values and limits, used to validate every write. supabase/schema.sql enforces the same lists.

export const FUNDING_STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];
export const ENQUIRY_STATUSES = ['new', 'in_review', 'replied', 'closed'];
export const ROLES = ['user', 'admin'];
export const CONSULTANTS = ['michael', 'brandon', 'kenny'];

export const MAX_MESSAGE = 500;
export const MAX_TAGS = 5;
export const MAX_TAG = 24;
export const MAX_COST = 1_000_000;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TAG_RE = /^[\p{L}\p{N}][\p{L}\p{N} &+./-]*$/u;

export function isId(value) {
  return Number.isInteger(value) && value > 0;
}

// Accepts ids sent as numbers or numeric strings (query strings are always strings).
export function toId(value) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return isId(n) ? n : null;
}

// Consultants picked during onboarding: known keys only, no duplicates. Returns null when anything isn't allowed.
export function cleanConsultants(value) {
  if (!Array.isArray(value) || !value.every((c) => CONSULTANTS.includes(c))) return null;
  return [...new Set(value)];
}

// Field tags from onboarding: trimmed, single-spaced, at most MAX_TAGS, no duplicates (ignoring case).
// Returns the cleaned list, or null when anything in it isn't allowed.
export function cleanTags(value) {
  if (!Array.isArray(value) || value.length > MAX_TAGS) return null;
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const tag = raw.replace(/^#/, '').replace(/\s+/g, ' ').trim();
    if (!tag || tag.length > MAX_TAG || !TAG_RE.test(tag)) return null;
    if (!out.some((t) => t.toLowerCase() === tag.toLowerCase())) out.push(tag);
  }
  return out;
}
