// Allowed values and limits for the two forms the site still carries: the note on the home page
// and the talent pool on /network. Nothing here is written to a database — both forms end in email.

// The talent pool on /network#talent: who is writing in, so the subject line says so at a glance.
export const TALENT_CATEGORIES = [
  { key: 'consultant', label: 'Consultant' },
  { key: 'designer', label: 'Designer' },
  { key: 'engineer', label: 'Engineer' },
  { key: 'commerce', label: 'Commerce & Management' }
];
export const MAX_TALENT_NAME = 120;
export const MAX_TALENT_LINKS = 300;
export const MAX_TALENT_MESSAGE = 1000;

// the short note on the home page: a question, not a brief
export const MAX_CONTACT_MESSAGE = 1200;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
