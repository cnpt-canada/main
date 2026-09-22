// The work after an enquiry: which stage it is in, the picture the cnpt team shares for it, the thread
// beside it, and the meetings the client booked. One process per client account.
import { db, run } from './db.js';
import { isAdmin } from './users.js';

export const PROCESS_COLUMNS = 'id,user_id,enquiry_id,stage,headline,image_path,created_at,updated_at';
export const COMMENT_COLUMNS = 'id,owner_id,author_id,body,created_at';
export const MEETING_COLUMNS = 'id,user_id,starts_at,minutes,status,note,created_at,updated_at';

export function loadProcess(userId) {
  return run(db().from('process').select(PROCESS_COLUMNS).eq('user_id', userId).maybeSingle());
}

export function loadComments(ownerId) {
  return run(db().from('comments').select(COMMENT_COLUMNS).eq('owner_id', ownerId)
    .order('created_at', { ascending: true }).limit(500));
}

export function loadMeetings(userId) {
  return run(db().from('meetings').select(MEETING_COLUMNS).eq('user_id', userId)
    .order('starts_at', { ascending: true }).limit(200));
}

// Adds each comment's author as the thread shows them: the cnpt team write as Consultant,
// the client whose process it is writes as Project Owner.
export async function withAuthors(comments) {
  const ids = [...new Set(comments.map((c) => c.author_id).filter(Boolean))];
  const people = ids.length ? await run(db().from('users').select('id,name,email,picture,role').in('id', ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return comments.map((c) => {
    const who = byId.get(c.author_id);
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      author: who
        ? { id: who.id, name: who.name, email: who.email, picture: who.picture, title: isAdmin(who) ? 'Consultant' : 'Project Owner' }
        : null
    };
  });
}
