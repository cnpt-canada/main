// POST /api/content — save the lines an editor changed on one page.
//
// Three things have to hold before anything is written: the request came from this site, it carries
// an id_token Google signed for an address that is one of the editors, and every line still sits in
// an element that holds words only. Then the page file is committed, and the deploy is the publish.
import { fail, json, methodNotAllowed, readBody, route } from './_lib/http.js';
import { adminConfig, editor } from './_lib/admin.js';
import { EditError, KEY_RE, applyEdits, pageFile } from './_lib/edit.js';
import { readFile, repoConfig, writeFile } from './_lib/github.js';

export default route(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  const config = adminConfig();
  if (!config) return fail(res, 503, 'not_configured');
  const email = await editor(req, config);
  if (!email) return fail(res, 401, 'not_signed_in');
  const repo = repoConfig();
  if (!repo) return fail(res, 503, 'no_repository');

  const body = readBody(req);
  const file = pageFile(body.page);
  if (!file) return fail(res, 400, 'unknown_page');
  const edits = Array.isArray(body.edits) ? body.edits : [];
  if (!edits.length || edits.length > 200) return fail(res, 400, 'invalid_edits');
  const keys = [];
  for (const edit of edits) {
    if (!edit || !KEY_RE.test(String(edit.key || ''))) return fail(res, 400, 'invalid_key');
    if (keys.includes(edit.key)) return fail(res, 400, 'repeated_key');
    keys.push(edit.key);
  }

  const current = await readFile(repo, file);
  let next;
  try {
    next = applyEdits(current.text, edits);
  } catch (err) {
    if (!(err instanceof EditError)) throw err;
    console.warn('admin edit refused:', err.message);
    return json(res, 400, { ok: false, error: err.code, key: err.key });
  }
  if (next === current.text) return json(res, 200, { ok: true, unchanged: true });

  const message = `${file}: ${edits.length === 1 ? 'one line' : edits.length + ' lines'} edited in admin mode\n\n${keys.join(', ')}\n`;
  let commit;
  try {
    commit = await writeFile(repo, file, next, current.sha, message);
  } catch (err) {
    // 409 means the file moved on under us; 404/403 means the token cannot write here
    if (err.status === 409) return fail(res, 409, 'out_of_date');
    if (err.status === 403 || err.status === 404) {
      console.error(err.message);
      return fail(res, 503, 'no_repository');
    }
    throw err;
  }
  console.log(`admin edit by ${email}: ${file} (${keys.join(', ')}) → ${commit}`);
  json(res, 200, { ok: true, commit });
});
