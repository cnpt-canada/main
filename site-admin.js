/* cnpt admin mode: the words on the page, edited in the page.
   Fetched only when a signed-in editor asks for it, so a visitor never loads this file.

   Every line the page offers carries a data-ed key. A line is read out as runs — its words, and
   which of them are emphasised — rather than as markup, so nothing that goes to the server is ever
   parsed as HTML there; ⌘B and ⌘I work because a bold or italic run comes back as one. Saving
   commits the page file to the repository the site is built from, and the deploy is the publish. */
(function () {
  var EDITABLE = { '/': 1, '/work': 1, '/network': 1 };
  var SAID = {
    not_signed_in: 'That session has expired. Reload the page and sign in again.',
    not_configured: 'Admin mode is not set up on this deployment.',
    no_repository: 'The editor cannot write to the repository: check GITHUB_REPO and GITHUB_TOKEN.',
    out_of_date: 'This page changed in the repository since you opened it. Reload, then edit again.',
    empty_line: 'A line cannot be saved empty.',
    line_too_long: 'That line is too long to save.',
    not_a_text_element: 'That line holds more than words now, so nothing was saved.',
    unknown_key: 'That line is no longer in the page. Reload, then edit again.',
    unknown_page: 'Admin mode cannot edit this page.'
  };

  var fields = [];
  var before = {};
  var page = '';
  var bar, status, saveButton, revertButton;
  var busy = false;
  var on = false;

  function pageKey() {
    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (path.slice(-5) === '.html') path = path.slice(0, -5);
    if (path === '/index') path = '/';
    return EDITABLE[path] ? path : '';
  }

  /* ── a line, as the file will hold it ──
     The same tidying the server does, so "changed" means changed and not merely re-wrapped. */

  function add(list, text, em, strong) {
    var last = list[list.length - 1];
    if (last && last.em === em && last.strong === strong) last.text += text;
    else list.push({ text: text, em: em, strong: strong });
  }

  function runs(el) {
    var list = [];
    (function walk(node, em, strong) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 3) {
          if (child.data) add(list, child.data, em, strong);
          continue;
        }
        if (child.nodeType !== 1) continue;
        var tag = child.tagName.toLowerCase();
        // anything else — a word wrapper the reveal left behind, something pasted in — is walked
        // through for its words and dropped
        if (tag === 'br') add(list, ' ', em, strong);
        else walk(child, em || tag === 'em' || tag === 'i', strong || tag === 'strong' || tag === 'b');
      }
    })(el, false, false);

    var out = [];
    var all = '';
    list.forEach(function (run) {
      var text = run.text.replace(/\s+/g, ' ');
      if (!all || / $/.test(all)) text = text.replace(/^ /, '');
      if (!text) return;
      if (!text.trim()) {
        if (!out.length) return;
        out[out.length - 1].text += ' ';
        all += ' ';
        return;
      }
      all += text;
      out.push({ text: text, em: run.em, strong: run.strong });
    });
    while (out.length) {
      var last = out[out.length - 1];
      last.text = last.text.replace(/ $/, '');
      if (last.text) break;
      out.pop();
    }
    return out;
  }

  function render(el, list) {
    while (el.firstChild) el.removeChild(el.firstChild);
    list.forEach(function (run) {
      var node = document.createTextNode(run.text);
      if (run.em) node = wrap('em', node);
      if (run.strong) node = wrap('strong', node);
      el.appendChild(node);
    });
  }

  function wrap(tag, node) {
    var el = document.createElement(tag);
    el.appendChild(node);
    return el;
  }

  function changed() {
    return fields.filter(function (el) {
      return JSON.stringify(runs(el)) !== JSON.stringify(before[el.getAttribute('data-ed')]);
    });
  }

  /* ── the bar along the bottom ── */

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function button(label, click) {
    var node = make('button', 'admin-btn', label);
    node.type = 'button';
    node.addEventListener('click', click);
    return node;
  }

  // the bar's rows wrap on a phone, so the page is told how much room to keep under the footer
  function measure() {
    if (bar) document.documentElement.style.setProperty('--admin-h', Math.ceil(bar.offsetHeight) + 'px');
  }

  function say(text, trouble) {
    status.textContent = text;
    status.classList.toggle('is-trouble', trouble === true);
    measure();
  }

  function build(email) {
    if (bar) return;
    bar = make('div', 'admin-bar');
    bar.setAttribute('data-cursor-off', '');
    status = make('span', 'admin-status');
    status.setAttribute('role', 'status');
    saveButton = button('Save', save);
    saveButton.classList.add('admin-btn-go');
    revertButton = button('Revert', revert);
    bar.appendChild(make('span', 'admin-mode', 'Admin mode'));
    bar.appendChild(make('span', 'admin-who', email));
    bar.appendChild(status);
    bar.appendChild(revertButton);
    bar.appendChild(saveButton);
    bar.appendChild(button('Sign out', signOut));
    bar.appendChild(button('Exit', close));
    document.body.appendChild(bar);
    measure();
    window.addEventListener('resize', measure);
  }

  function sync() {
    var list = changed();
    fields.forEach(function (el) { el.classList.toggle('is-changed', list.indexOf(el) >= 0); });
    saveButton.disabled = busy || !list.length;
    revertButton.disabled = busy || !list.length;
    if (busy) return;
    say(!list.length ? 'Nothing changed yet.' : list.length === 1 ? 'One line changed.' : list.length + ' lines changed.');
  }

  /* ── editing ── */

  function noLines(e) {
    if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') e.preventDefault();
  }

  function pasteText(e) {
    var text = e.clipboardData && e.clipboardData.getData('text/plain');
    if (text == null) return;
    e.preventDefault();
    try {
      document.execCommand('insertText', false, text.replace(/\s+/g, ' '));
    } catch (err) {
      // whatever lands is read for its words only, so a browser without this still behaves
    }
  }

  function tidyField() {
    render(this, runs(this));
    sync();
  }

  function dress(el) {
    // the reveal hides anything not scrolled to yet and splits headings word by word: admin mode
    // takes the page out of that state, so every line is there, whole, to be read and edited
    el.removeAttribute('data-rv');
    el.removeAttribute('data-delay');
    el.classList.remove('in');
    el.style.removeProperty('--d');
    before[el.getAttribute('data-ed')] = runs(el);
    render(el, before[el.getAttribute('data-ed')]);
    el.contentEditable = 'true';
    el.spellcheck = true;
    el.addEventListener('beforeinput', noLines);
    el.addEventListener('paste', pasteText);
    el.addEventListener('input', sync);
    el.addEventListener('blur', tidyField);
  }

  function undress(el) {
    el.removeAttribute('contenteditable');
    el.removeAttribute('spellcheck');
    el.classList.remove('is-changed');
    el.removeEventListener('beforeinput', noLines);
    el.removeEventListener('paste', pasteText);
    el.removeEventListener('input', sync);
    el.removeEventListener('blur', tidyField);
  }

  // clicking into a line to edit it must not follow the link that line is, or sits in
  function stopLinks(e) {
    var target = e.target;
    if (!target || !target.closest) return;
    if (target.closest('[data-ed]') && target.closest('a')) e.preventDefault();
  }

  function keys(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      save();
    }
  }

  function warn(e) {
    if (!changed().length) return;
    e.preventDefault();
    e.returnValue = '';
  }

  /* ── saving ── */

  function save() {
    var list = changed();
    if (busy || !list.length) return;
    busy = true;
    saveButton.disabled = revertButton.disabled = true;
    say('Saving…');
    fetch('/api/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: page,
        edits: list.map(function (el) { return { key: el.getAttribute('data-ed'), runs: runs(el) }; })
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || !data.ok) throw new Error(data.error || 'HTTP ' + r.status);
          return data;
        });
      })
      .then(function (data) {
        list.forEach(function (el) { before[el.getAttribute('data-ed')] = runs(el); });
        busy = false;
        sync();
        say(data.unchanged ? 'Nothing to save.'
          : 'Saved as ' + data.commit + '. The site rebuilds, and in about a minute this is the page.');
      })
      .catch(function (err) {
        busy = false;
        sync();
        say(SAID[err.message] || 'That could not be saved (' + err.message + ').', true);
      });
  }

  function revert() {
    if (busy) return;
    fields.forEach(function (el) { render(el, before[el.getAttribute('data-ed')]); });
    sync();
  }

  function signOut() {
    if (busy) return;
    fetch('/api/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logout' })
    })
      .catch(function () {})
      .then(function () { close(true); });
  }

  function close(force) {
    if (busy) return;
    if (!force && changed().length
      && !window.confirm('Leave admin mode? The lines you changed go back to what the page says.')) return;
    fields.forEach(function (el) {
      render(el, before[el.getAttribute('data-ed')]);
      undress(el);
    });
    document.removeEventListener('click', stopLinks, true);
    document.removeEventListener('keydown', keys, true);
    window.removeEventListener('beforeunload', warn);
    window.removeEventListener('resize', measure);
    document.documentElement.classList.remove('admin-editing');
    document.documentElement.style.removeProperty('--admin-h');
    if (bar) bar.remove();
    bar = status = saveButton = revertButton = null;
    fields = [];
    before = {};
    on = false;
  }

  function open(email) {
    if (on) return;
    on = true;
    page = pageKey();
    fields = page ? Array.prototype.slice.call(document.querySelectorAll('[data-ed]')) : [];
    build(email);
    document.documentElement.classList.add('admin-editing');
    fields.forEach(dress);
    document.addEventListener('click', stopLinks, true);
    document.addEventListener('keydown', keys, true);
    window.addEventListener('beforeunload', warn);
    sync();
    if (!page) say('Admin mode edits the home page, Client works and Network. This is not one of them.', true);
    else if (!fields.length) say('Nothing on this page is marked editable.', true);
  }

  window.cnptAdmin = { open: open };
})();
