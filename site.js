/* cnpt site: shared behaviour for every public page. Each part checks for its own elements, so pages load only what they use. */

/* old single-page links (cnpt.ca/#team) go to the page that now holds that section */
(function () {
  var moved = { '#practices': '/#what', '#process': '/#process', '#top': '/', '#team': '/network#team', '#talent': '/network#talent' };
  if (location.pathname === '/' && moved[location.hash]) location.replace(moved[location.hash]);
})();

/* a picture that fails to load gets out of the way and leaves its placeholder showing (the team portraits).
   Kept here rather than in an onerror attribute so the pages need no inline script at all. */
window.addEventListener('error', function (e) {
  var el = e.target;
  if (el && el.tagName === 'IMG' && el.hasAttribute('data-drop-if-missing')) el.remove();
}, true); // capture: error events on elements do not bubble

/* talent pool form — the same shape as the enquiry form: pick what you are, write a note, send it to talent@cnpt.ca */
(function () {
  var form = document.getElementById('talent-form');
  if (!form) return;
  var message = form.elements.message;
  var count = form.querySelector('.count');
  var status = form.querySelector('.form-status');
  var button = form.querySelector('.btn-send');
  var max = +message.getAttribute('maxlength');
  var sending = false;

  function isComplete() {
    return Boolean(form.querySelector('input[name="category"]:checked')) && message.value.trim()
      && form.elements.name.value.trim() && form.elements.email.value.trim() && form.elements.email.checkValidity();
  }
  function sync() {
    count.textContent = message.value.length + ' / ' + max;
    count.classList.toggle('is-near', message.value.length >= max - 100);
    button.disabled = sending || !isComplete();
  }
  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  window.addEventListener('pageshow', sync);
  sync();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending || !isComplete()) return;
    sending = true;
    form.classList.add('is-sending');
    sync();
    status.textContent = 'Sending…';
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: form.querySelector('input[name="category"]:checked').value,
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        links: form.elements.links.value.trim(),
        message: message.value.trim(),
        company_website: form.elements.company_website.value
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || !data.ok) throw new Error(data.error || 'HTTP ' + r.status);
        });
      })
      .then(function () {
        form.reset();
        status.textContent = 'Thank you. We will be in touch as the pool opens.';
      })
      .catch(function () {
        status.textContent = 'That could not be sent. Please try again, or email talent@cnpt.ca.';
      })
      .then(function () {
        sending = false;
        form.classList.remove('is-sending');
        sync();
      });
  });
})();

/* the short note under the contact heading: an address and a line, no account */
(function () {
  var form = document.getElementById('contact-form');
  if (!form) return;
  var message = form.elements.message;
  var email = form.elements.email;
  var count = form.querySelector('.count');
  var status = form.querySelector('.form-status');
  var button = form.querySelector('.btn-send');
  var max = +message.getAttribute('maxlength');
  var sending = false;

  function isComplete() {
    return Boolean(message.value.trim()) && Boolean(email.value.trim()) && email.checkValidity();
  }
  function sync() {
    count.textContent = message.value.length + ' / ' + max;
    count.classList.toggle('is-near', message.value.length >= max - 120);
    button.disabled = sending || !isComplete();
  }
  form.addEventListener('input', sync);
  window.addEventListener('pageshow', sync);
  sync();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending || !isComplete()) return;
    sending = true;
    form.classList.add('is-sending');
    sync();
    status.textContent = 'Sending…';
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.value.trim(),
        message: message.value.trim(),
        company_website: form.elements.company_website.value
      })
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok || !data.ok) throw new Error(data.error || 'HTTP ' + r.status);
        });
      })
      .then(function () {
        form.reset();
        status.textContent = 'Thank you. We will come back to you within two working days.';
      })
      .catch(function () {
        // nothing is stored behind this form, so a failure has to say where else to write
        status.textContent = 'That could not be sent. Please email info@cnpt.ca instead.';
      })
      .then(function () {
        sending = false;
        form.classList.remove('is-sending');
        sync();
      });
  });
})();

/* dark or light: the switch beside "Start a project", remembered on this browser */
(function () {
  var button = document.querySelector('.theme-btn');
  if (!button) return;
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');

  function tell() {
    var dark = root.getAttribute('data-theme') === 'dark';
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (meta) meta.setAttribute('content', dark ? '#0E0E0D' : '#F2F2F0');
  }
  tell();

  var easing = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : 0;
  var settle;

  button.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') !== 'dark';
    if (easing !== null) {                       // let the colours travel, then stop transitioning
      root.classList.add('theming');
      clearTimeout(settle);
      settle = setTimeout(function () { root.classList.remove('theming'); }, 700);
    }
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('cnpt-theme', dark ? 'dark' : 'light'); } catch (e) {}
    tell();
  });
})();

/* phone menu — the section links open in a sheet under the nav */
(function () {
  var button = document.querySelector('.nav-menu');
  var sheet = document.getElementById('nav-sheet');
  if (!button || !sheet) return;
  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    sheet.hidden = !open;
  }
  button.addEventListener('click', function () { setOpen(button.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !sheet.hidden) { setOpen(false); button.focus(); }
  });
  window.matchMedia('(min-width: 901px)').addEventListener('change', function (e) { if (e.matches) setOpen(false); });
})();

/* a rounded label beside the mouse, only while it hovers something with data-cursor: what clicking does.
   Mouse and trackpad only; it is decorative, so screen readers never see it. */
(function () {
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var tip = document.createElement('div');
  var pill = document.createElement('span');
  tip.className = 'cursor-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.appendChild(pill);
  document.body.appendChild(tip);

  var mouseX = -200, mouseY = -200, x = -200, y = -200, tx = -200, ty = -200, current = '', raf = 0, last = 0, pillW = 0;

  function labelFor(el) {
    if (!el || !el.closest || el.closest('input, textarea, select, [data-cursor-off]')) return '';
    var own = el.closest('[data-cursor]');
    if (!own) return '';
    if (own.classList.contains('acc-row')) return own.getAttribute('aria-expanded') === 'true' ? 'Close' : 'What it covers';
    return own.getAttribute('data-cursor');
  }
  function hide() { current = ''; tip.classList.remove('on'); }
  function place() {
    // sit below-right of the pointer; flip left near the right edge.
    // The width is measured when the wording changes, not on every move: reading it mid-move would
    // make the browser lay the page out again for each step of the pointer.
    tx = mouseX + 18 + pillW > window.innerWidth - 8 ? mouseX - 12 - pillW : mouseX + 18;
    ty = Math.min(mouseY + 20, window.innerHeight - 38);
  }
  function frame(now) {
    // the same easing whatever the screen's refresh rate: 60Hz and 120Hz settle in the same time
    var step = last ? Math.min(now - last, 64) : 16.7;
    last = now;
    var k = still ? 1 : 1 - Math.pow(1 - 0.24, step / 16.7);
    x += (tx - x) * k;
    y += (ty - y) * k;
    tip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.2) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; }
  }
  function update(el) {
    var text = labelFor(el);
    if (text !== current) {
      current = text;
      if (text) { pill.textContent = text; pillW = pill.offsetWidth || 0; }
      tip.classList.toggle('on', !!text);
    }
    place();
    if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
  }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var wasHidden = !current;
    mouseX = e.clientX;
    mouseY = e.clientY;
    update(e.target);
    if (wasHidden) { x = tx; y = ty; } // appear where the pointer is instead of flying in
  }, { passive: true });
  // scrolling slides things under a still pointer without the visitor hovering them: hide until the mouse moves again
  window.addEventListener('scroll', hide, { passive: true });
  // a click can change the label under the pointer (Open → Close)
  document.addEventListener('click', function () {
    requestAnimationFrame(function () { if (current) update(document.elementFromPoint(mouseX, mouseY)); });
  });
  document.documentElement.addEventListener('mouseleave', hide);
})();

/* the entrance reveals */
(function () {
  var root = document.documentElement;
  var motion = root.classList.contains('motion');

  if (!motion) return;

  // wrap every word in a mask span so headings can rise word by word
  function splitWords(el) {
    var n = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 1) return walk(child);
        if (child.nodeType !== 3) return;
        var frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) return frag.appendChild(document.createTextNode(part));
          var mask = document.createElement('span');
          var word = document.createElement('span');
          mask.className = 'wd';
          word.textContent = part;
          word.style.setProperty('--i', n++);
          mask.appendChild(word);
          frag.appendChild(mask);
        });
        node.replaceChild(frag, child);
      });
    })(el);
  }

  // [selector, reveal type, fixed delay ms, extra delay per match]
  // Targets without a fixed delay are staggered in the order they enter the viewport.
  var plan = [
    ['.eyebrow', 'clip'],
    ['.sec h1, .sec h2, .cta h1, .cta h2', 'split'],
    ['.sec-head p, .prac-note, .lede, .split, .cta-grid > div > p, .cta-row, .cta-form, .works-note', 'up'],
    ['.fgrid > *, .sum-list li', 'up'],
    ['.step-card', 'up', 0, 80],
    ['.value, .member, .pack', 'rule'],
    ['.cta', 'cta'],
    ['.fbottom', 'fade']
  ];
  var targets = [];
  plan.forEach(function (p) {
    Array.prototype.forEach.call(document.querySelectorAll(p[0]), function (el, i) {
      if (p[1] === 'split') splitWords(el);
      el.setAttribute('data-rv', p[1]);
      if (p[2] != null) el.setAttribute('data-delay', p[2] + i * (p[3] || 0));
      targets.push(el);
    });
  });

  var io = new IntersectionObserver(function (entries) {
    var batch = [];
    entries.forEach(function (e) {
      // anything already scrolled past (e.g. restored scroll position) is revealed too
      if (!e.isIntersecting && e.boundingClientRect.bottom >= 0) return;
      io.unobserve(e.target);
      batch.push.apply(batch, e.target.rvTargets);
    });
    batch
      .sort(function (a, b) { return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1; })
      .forEach(function (el, n) {
        var d = el.hasAttribute('data-delay') ? +el.getAttribute('data-delay') : Math.min(n, 6) * 90;
        el.style.setProperty('--d', d + 'ms');
        el.classList.add('in');
        // hand the element back to its own (hover) transitions once the reveal is over
        setTimeout(function () {
          el.removeAttribute('data-rv');
          el.removeAttribute('data-delay');
          el.classList.remove('in');
          el.style.removeProperty('--d');
        }, d + 2200);
      });
  }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });

  void document.body.offsetWidth; // commit the hidden states while transitions are still off
  targets.forEach(function (el) {
    // a fully clip-pathed element never counts as intersecting, so clip reveals watch their parent
    var watch = el.getAttribute('data-rv') === 'clip' ? el.parentNode : el;
    (watch.rvTargets = watch.rvTargets || []).push(el);
    io.observe(watch);
  });
  root.classList.add('motion-ready');
})();

/* the mark in the footer opens admin mode: a bar along the bottom with Google's sign-in button in
   it, and once an editor is in, the same bar saves. The page never goes anywhere.
   site-admin.js carries all of that and is fetched only when the mark is pressed, so a visitor
   loads neither it nor anything of Google's. */
(function () {
  var mark = document.querySelector('footer .foot-home');
  if (!mark) return;
  var loading = false;

  mark.setAttribute('role', 'button');
  mark.setAttribute('tabindex', '0');
  mark.setAttribute('aria-label', 'Admin sign-in');

  function open() {
    if (window.cnptAdmin) return window.cnptAdmin.open();
    if (loading) return;
    loading = true;
    var script = document.createElement('script');
    script.src = '/site-admin.js';
    script.onload = function () { loading = false; window.cnptAdmin.open(); };
    script.onerror = function () {
      loading = false;
      var note = document.createElement('p');
      note.className = 'admin-note';
      note.setAttribute('role', 'status');
      note.textContent = 'The editor could not be loaded.';
      mark.parentNode.appendChild(note);
      setTimeout(function () { note.remove(); }, 8000);
    };
    document.head.appendChild(script);
  }

  mark.addEventListener('click', open);
  mark.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  });

  // cnpt.ca/admin redirects to /#admin, which is the same as pressing the mark
  if (location.hash === '#admin') {
    history.replaceState(null, '', location.pathname + location.search);
    open();
  }
})();

/* Publish the classic-scrollbar width, so a row that has to know the page's real content width can
   subtract it. Overlay scrollbars (macOS, touch) measure 0, which is the right answer there. */
(function () {
  function measure() {
    var w = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.style.setProperty('--sbw', (w > 0 ? w : 0) + 'px');
  }
  measure();
  window.addEventListener('resize', measure);
})();

