// Allowed values and limits, used to validate every write. supabase/schema.sql enforces the same lists.

export const FUNDING_STAGES = ['Pre-Seed', 'Seed Level', 'Series A', 'Series B'];
export const ENQUIRY_STATUSES = ['new', 'in_review', 'replied', 'closed'];
export const ROLES = ['user', 'admin'];
export const CONSULTANTS = ['michael', 'brandon', 'kenny'];
// Focal: how a client splits the work, in this order, in tens that add up to 100.
export const FOCUS_AREAS = ['research', 'branding', 'product', 'advertising'];
export const FOCUS_STEP = 10;

// The work after an enquiry: the four stages from the website, and the thread beside them.
export const PROCESS_STAGES = ['frame', 'concept', 'system', 'entry'];
export const MAX_HEADLINE = 120;
export const MAX_COMMENT = 2000;
export const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

// Meetings the client books. The cnpt team is in Toronto, so the hours below are Toronto hours.
export const MEETING_TZ = 'America/Toronto';
export const MEETING_MINUTES = [30, 60];
export const MEETING_STATUSES = ['requested', 'confirmed', 'declined', 'cancelled'];
export const MEETING_OPEN_HOUR = 9;   // first slot starts at 09:00
export const MEETING_CLOSE_HOUR = 18; // last slot ends by 18:00
export const MEETING_DAYS_AHEAD = 60;
export const MAX_MEETING_NOTE = 500;

// The talent pool on /talent: who is writing in, so the message says so at a glance.
export const TALENT_CATEGORIES = [
  { key: 'consultant', label: 'Consultant' },
  { key: 'designer', label: 'Designer' },
  { key: 'engineer', label: 'Engineer' },
  { key: 'commerce', label: 'Commerce & Management' }
];
export const MAX_TALENT_NAME = 120;
export const MAX_TALENT_LINKS = 300;
export const MAX_TALENT_MESSAGE = 1000;

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

// A meeting slot: on the half hour, in the future, on a weekday inside the studio's hours, not too far ahead.
// Returns the start as an ISO string, or an error code.
export function checkSlot(startsAt, minutes, now = new Date()) {
  if (!MEETING_MINUTES.includes(minutes)) return { error: 'invalid_minutes' };
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return { error: 'invalid_slot' };
  if (start.getTime() % (30 * 60 * 1000) !== 0) return { error: 'invalid_slot' };      // half-hour boundaries only
  if (start.getTime() < now.getTime()) return { error: 'past_slot' };
  if (start.getTime() > now.getTime() + MEETING_DAYS_AHEAD * 86400000) return { error: 'too_far' };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MEETING_TZ, weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
    .formatToParts(start).reduce((a, p) => ({ ...a, [p.type]: p.value }), {});
  if (['Sat', 'Sun'].includes(parts.weekday)) return { error: 'closed_day' };
  const from = Number(parts.hour) + Number(parts.minute) / 60;
  if (from < MEETING_OPEN_HOUR || from + minutes / 60 > MEETING_CLOSE_HOUR) return { error: 'closed_hour' };
  return { startsAt: start.toISOString() };
}

// A focal split: one whole number per area (FOCUS_AREAS order), each a multiple of FOCUS_STEP, adding up to 100.
// Returns a copy, or null when it isn't one.
export function cleanFocus(value) {
  if (!Array.isArray(value) || value.length !== FOCUS_AREAS.length) return null;
  if (!value.every((n) => Number.isInteger(n) && n >= 0 && n <= 100 && n % FOCUS_STEP === 0)) return null;
  return value.reduce((a, b) => a + b, 0) === 100 ? [...value] : null;
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
