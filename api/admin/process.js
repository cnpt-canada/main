// GET   /api/admin/process                                   → every client's process, most recently moved first
// PATCH /api/admin/process {user_id, stage?, headline?}       → moves the work along, or says what is happening now
// PUT   /api/admin/process {user_id, type, data}              → the picture for this stage (base64), data: null removes it
import { db, run } from '../_lib/db.js';
import { fail, json, methodNotAllowed, readBody, route } from '../_lib/http.js';
import { loadProcess, PROCESS_COLUMNS } from '../_lib/process.js';
import { IMAGE_TYPES, MAX_HEADLINE, MAX_IMAGE_BYTES, PROCESS_STAGES, toId } from '../_lib/rules.js';
import { imageLink, removeImage, saveImage } from '../_lib/storage.js';
import { requireAdmin, withClients } from '../_lib/users.js';

// Makes sure the client has a process row, so an admin can start one from the first edit.
async function ensureProcess(userId) {
  const existing = await loadProcess(userId);
  if (existing) return existing;
  const enquiry = await run(db().from('enquiries').select('id').eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  return run(db().from('process').insert({ user_id: userId, enquiry_id: enquiry?.id ?? null })
    .select(PROCESS_COLUMNS).single());
}

export default route(async (req, res) => {
  if (!['GET', 'PATCH', 'PUT'].includes(req.method)) return methodNotAllowed(res, ['GET', 'PATCH', 'PUT']);
  if (!(await requireAdmin(req, res))) return;

  if (req.method === 'GET') {
    const rows = await run(db().from('process').select(PROCESS_COLUMNS).order('updated_at', { ascending: false }).limit(500));
    const withImages = await Promise.all((await withClients(rows)).map(async (r) => ({ ...r, image_url: await imageLink(r.image_path) })));
    return json(res, 200, { ok: true, process: withImages });
  }

  const body = readBody(req);
  const userId = toId(body.user_id);
  if (!userId) return fail(res, 400, 'invalid_id');
  const client = await run(db().from('users').select('id').eq('id', userId).maybeSingle());
  if (!client) return fail(res, 404, 'not_found');
  const current = await ensureProcess(userId);

  if (req.method === 'PUT') {
    if (body.data === null) {
      await removeImage(current.image_path);
      const cleared = await run(db().from('process').update({ image_path: null, updated_at: new Date().toISOString() })
        .eq('id', current.id).select(PROCESS_COLUMNS).single());
      return json(res, 200, { ok: true, process: cleared, image_url: null });
    }
    if (!IMAGE_TYPES[body.type]) return fail(res, 400, 'invalid_type');
    const bytes = Buffer.from(String(body.data ?? ''), 'base64');
    if (!bytes.length) return fail(res, 400, 'invalid_image');
    if (bytes.length > MAX_IMAGE_BYTES) return fail(res, 413, 'image_too_big');
    const path = await saveImage(userId, bytes, body.type);
    const saved = await run(db().from('process').update({ image_path: path, updated_at: new Date().toISOString() })
      .eq('id', current.id).select(PROCESS_COLUMNS).single());
    return json(res, 200, { ok: true, process: saved, image_url: await imageLink(path) });
  }

  const changes = {};
  if ('stage' in body) {
    if (!PROCESS_STAGES.includes(body.stage)) return fail(res, 400, 'invalid_stage');
    changes.stage = body.stage;
  }
  if ('headline' in body) {
    const headline = String(body.headline ?? '').trim();
    if (headline.length > MAX_HEADLINE) return fail(res, 400, 'invalid_headline');
    changes.headline = headline || null;
  }
  if (!Object.keys(changes).length) return fail(res, 400, 'nothing_to_change');
  const saved = await run(db().from('process').update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', current.id).select(PROCESS_COLUMNS).single());
  json(res, 200, { ok: true, process: saved, image_url: await imageLink(saved.image_path) });
});
