// The words on the page, edited in the page they live in.
//
// There is no content table and no overlay fetched at load: the HTML file *is* the content. Every
// line admin mode can change carries a data-ed key, and a save rewrites exactly what sits between
// that element's tags. So what the editor types is what the file holds, the page needs no extra
// request, and `git log` is the history.
//
// A line arrives as runs — [{ text, em, strong }] — rather than as markup, so nothing the browser
// sends is ever parsed as HTML. This file writes the tags itself, which is why an edit cannot carry
// anything in but words and emphasis.

export const PAGES = { '/': 'index.html', '/work': 'work.html', '/network': 'network.html' };
export const MAX_TEXT = 2000;
export const MAX_RUNS = 40;
export const KEY_RE = /^[a-z][a-z0-9-]{0,63}$/;

// the only tags an editable line may hold, and the only ones a save may write
const INLINE = /^<\/?(?:em|strong|b|i)\s*>$/;

export class EditError extends Error {
  constructor(code, key) {
    super(key ? code + ': ' + key : code);
    this.code = code;
    this.key = key;
  }
}

// '/work', '/work/', '/work.html' and '/index.html' are all the same page: cleanUrls serves one path
// but a browser can be sitting on any of them.
export function pageFile(pathname) {
  let path = String(pathname || '/').split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  if (path.endsWith('.html')) path = path.slice(0, -5);
  if (path === '/index' || path === '') path = '/';
  return Object.prototype.hasOwnProperty.call(PAGES, path) ? PAGES[path] : '';
}

const escapeText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One line, as the file will hold it: whitespace collapsed, the ends trimmed, empty runs dropped.
export function renderRuns(runs, key) {
  if (!Array.isArray(runs) || !runs.length || runs.length > MAX_RUNS) throw new EditError('invalid_runs', key);
  let text = '';
  const parts = [];
  for (const run of runs) {
    if (!run || typeof run.text !== 'string') throw new EditError('invalid_runs', key);
    // a line is a line: no newlines, no control characters, nothing invisible
    let value = run.text.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ');
    if (text.endsWith(' ')) value = value.replace(/^ /, '');
    if (!text) value = value.replace(/^ /, '');
    if (!value) continue;
    // a run of nothing but space belongs to the words before it, not in emphasis of its own
    if (!value.trim()) {
      if (!parts.length) continue;
      parts[parts.length - 1].text += ' ';
      text += ' ';
      continue;
    }
    text += value;
    parts.push({ text: value, em: run.em === true, strong: run.strong === true });
  }
  while (parts.length && / $/.test(parts[parts.length - 1].text)) {
    const last = parts[parts.length - 1];
    last.text = last.text.replace(/ $/, '');
    if (!last.text) parts.pop();
  }
  const length = parts.reduce((n, part) => n + part.text.length, 0);
  if (!length) throw new EditError('empty_line', key);
  if (length > MAX_TEXT) throw new EditError('line_too_long', key);
  return parts
    .map((part) => {
      let html = escapeText(part.text);
      if (part.em) html = '<em>' + html + '</em>';
      if (part.strong) html = '<strong>' + html + '</strong>';
      return html;
    })
    .join('');
}

// Where the opening tag that carries this key ends, honouring quoted attribute values.
function endOfOpenTag(html, start, key) {
  let quote = '';
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = '';
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      if (html[i - 1] === '/') throw new EditError('not_a_text_element', key);
      return i + 1;
    }
  }
  throw new EditError('bad_markup', key);
}

export function replaceLine(html, key, runs) {
  const needle = 'data-ed="' + key + '"';
  const at = html.indexOf(needle);
  if (at < 0) throw new EditError('unknown_key', key);
  if (html.indexOf(needle, at + needle.length) >= 0) throw new EditError('duplicate_key', key);

  const open = html.lastIndexOf('<', at);
  const name = (html.slice(open + 1, at).match(/^([a-zA-Z][a-zA-Z0-9-]*)[\s]/) || [])[1];
  if (!name) throw new EditError('bad_markup', key);
  const from = endOfOpenTag(html, open, key);

  // the element's own closing tag, counting any same-named tag nested inside it
  let to = from;
  let depth = 0;
  for (;;) {
    const next = html.slice(to).search(new RegExp('</?' + name + '[\\s/>]', 'i'));
    if (next < 0) throw new EditError('bad_markup', key);
    const tag = to + next;
    if (html[tag + 1] === '/') {
      if (!depth) {
        to = tag;
        break;
      }
      depth--;
    } else {
      depth++;
    }
    to = endOfOpenTag(html, tag, key);
  }

  // whatever is in there now must be words and emphasis only — never an icon, a card or a control.
  // If the markup has grown since the key was written, the save stops instead of flattening it.
  const inner = html.slice(from, to);
  for (const tag of inner.match(/<[^>]*>/g) || []) {
    if (!INLINE.test(tag)) throw new EditError('not_a_text_element', key);
  }
  return html.slice(0, from) + renderRuns(runs, key) + html.slice(to);
}

export function applyEdits(html, edits) {
  let next = html;
  for (const edit of edits) next = replaceLine(next, edit.key, edit.runs);
  return next;
}
