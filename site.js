/* cnpt site: shared behaviour for every public page. Each part checks for its own elements, so pages load only what they use. */

/* old single-page links (cnpt.ca/#team) go to the page that now holds that section */
(function () {
  var moved = { '#what': '/process', '#focus': '/process#focus', '#practices': '/practices', '#process': '/process', '#team': '/team', '#contact': '/contact' };
  if (location.pathname === '/' && moved[location.hash]) location.replace(moved[location.hash]);
})();

/* practices — one row open at a time */
(function () {
  var items = Array.prototype.slice.call(document.querySelectorAll('.acc'));
  items.forEach(function (item) {
    item.querySelector('.acc-row').addEventListener('click', function () {
      var willOpen = item.getAttribute('data-open') !== 'true';
      items.forEach(function (other) {
        var open = (other === item) && willOpen;
        other.setAttribute('data-open', open ? 'true' : 'false');
        other.querySelector('.acc-row').setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  });
})();

/* contact form — live character count, Send enabled only once the required fields are filled, sending through /api/contact */
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

  function checkedStage() { return form.querySelector('input[name="stage"]:checked'); }
  function isComplete() {
    return !!checkedStage() && !!message.value.trim() && !!email.value.trim() && email.checkValidity();
  }
  function sync() {
    var n = message.value.length;
    count.textContent = n + ' / ' + max;
    count.classList.toggle('is-near', n >= max - 50);
    button.disabled = sending || !isComplete();
  }
  function say(text) { status.textContent = text; }

  form.addEventListener('input', sync);
  form.addEventListener('change', sync);
  window.addEventListener('pageshow', sync); // browsers that restore typed values on back/reload
  sync();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sending || !isComplete()) return;
    var stage = checkedStage();

    sending = true;
    form.classList.add('is-sending');
    sync();
    say('Sending…');
    fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stage: stage.value,
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
        say('Thank you. We will reply within two working days.');
      })
      .catch(function () {
        say('Your message could not be sent. Please try again, or email info@cnpt.ca.');
      })
      .then(function () {
        sending = false;
        form.classList.remove('is-sending');
        sync();
      });
  });
})();

/* signed-in visitors: the nav shows their photo and "My Project", and the contact form knows their email */
(function () {
  var link = document.querySelector('.nav-account');
  if (!link || !window.fetch) return;
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var user = data && data.user;
      if (!user) return;
      link.href = '/account';
      link.textContent = 'My Project';
      if (user.picture && /^https:\/\//.test(user.picture)) {
        var img = document.createElement('img');
        img.src = user.picture;
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        link.prepend(img);
      }
      var email = document.getElementById('cf-email');
      if (email && !email.value) {
        email.value = user.email;
        email.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })
    .catch(function () {}); // no API (e.g. a static preview): keep "Sign in"
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

/* client works — filter the cards by practice */
(function () {
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.wf-btn'));
  var works = Array.prototype.slice.call(document.querySelectorAll('.work'));
  if (!buttons.length) return;
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var f = b.getAttribute('data-filter');
      buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      works.forEach(function (w) { w.hidden = !!f && w.getAttribute('data-practice') !== f; });
    });
  });
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

  var mouseX = -200, mouseY = -200, x = -200, y = -200, tx = -200, ty = -200, current = '', raf = 0;

  function labelFor(el) {
    if (!el || !el.closest || el.closest('input, textarea, select, [data-cursor-off]')) return '';
    var own = el.closest('[data-cursor]');
    if (!own) return '';
    if (own.classList.contains('acc-row')) return own.getAttribute('aria-expanded') === 'true' ? 'Close' : 'Open';
    return own.getAttribute('data-cursor');
  }
  function hide() { current = ''; tip.classList.remove('on'); }
  function place() {
    // sit below-right of the pointer; flip left near the right edge
    var w = pill.offsetWidth || 0;
    tx = mouseX + 18 + w > window.innerWidth - 8 ? mouseX - 12 - w : mouseX + 18;
    ty = Math.min(mouseY + 20, window.innerHeight - 38);
  }
  function frame() {
    var k = still ? 1 : 0.24;
    x += (tx - x) * k;
    y += (ty - y) * k;
    tip.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.2 ? requestAnimationFrame(frame) : 0;
  }
  function update(el) {
    var text = labelFor(el);
    if (text !== current) {
      current = text;
      if (text) pill.textContent = text;
      tip.classList.toggle('on', !!text);
    }
    place();
    if (!raf) raf = requestAnimationFrame(frame);
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

/* motion — scroll progress, hero parallax, entrance reveals */
(function () {
  var root = document.documentElement;
  var motion = root.classList.contains('motion');
  var nav = document.querySelector('nav');
  var hero = document.querySelector('.hero');
  var heroWrap = hero && hero.querySelector('.wrap');
  var ticking = false;
  var wrapTop = 0, wrapH = 0;

  // the headline block sits under the video, so it stays fully lit while it is on screen
  // and only fades (drifting slightly) once most of it has gone up under the nav
  function measureHero() {
    if (!heroWrap) return;
    var saved = heroWrap.style.transform;
    heroWrap.style.transform = '';
    wrapTop = heroWrap.getBoundingClientRect().top + window.pageYOffset;
    wrapH = heroWrap.offsetHeight;
    heroWrap.style.transform = saved;
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var y = window.pageYOffset;
      var max = root.scrollHeight - window.innerHeight;
      nav.style.setProperty('--progress', max > 0 ? Math.min(y / max, 1).toFixed(4) : 0);
      if (motion && hero && wrapH) {
        var gone = (y + nav.offsetHeight - wrapTop) / wrapH; // 0: its top is at the nav, 1: all of it has passed under
        var t = Math.min(Math.max((gone - 0.45) / 0.55, 0), 1);
        heroWrap.style.transform = t ? 'translate3d(0,' + (t * 48).toFixed(1) + 'px,0)' : '';
        heroWrap.style.opacity = t ? (1 - t).toFixed(3) : '';
      }
    });
  }
  measureHero();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { measureHero(); onScroll(); });
  window.addEventListener('load', function () { measureHero(); onScroll(); }); // the video's height is known by now
  onScroll();

  // the hero video plays only while it is on screen, and not at all under reduced motion
  var heroVideo = document.querySelector('.hero-video');
  if (heroVideo) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      heroVideo.removeAttribute('autoplay');
      heroVideo.pause();
    } else if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return heroVideo.pause();
          var played = heroVideo.play();
          if (played && played.catch) played.catch(function () {});
        });
      }, { threshold: 0.05 }).observe(heroVideo);
    }
  }

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
    ['.hero-video', 'up', 40],
    ['.hero h1', 'split', 120],
    ['.hero p', 'up', 480],
    ['.hero-cta .btn', 'up', 620, 80],
    ['.hero-foot', 'line', 760],
    ['.hero-foot .chip', 'up', 880, 80],
    ['.eyebrow', 'clip'],
    ['.sec h2, .cta h2', 'split'],
    ['.sec-head p, .prac-note, .lede, .cta-grid > div > p, .cta-row, .cta-form, .works-filter, .works-note', 'up'],
    ['.acc, .fgrid > *, .work', 'up'],
    ['.value, .step, .dl, .focus-item, .member, .ex-card', 'rule'],
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

/* hero headline: the letters near the mouse thicken, and thin back out as it moves on, as if the weight followed the pointer.
   Helvetica has no weight axis, so eight crisp text shadows in the text colour, just around each letter, do the thickening.
   (An outline would be simpler, but it leaves hairlines inside glyphs built from overlapping shapes, as Arial's are.)
   Mouse and trackpad only, and only with motion on. */
(function () {
  var h1 = document.querySelector('.hero h1');
  if (!h1 || !document.documentElement.classList.contains('motion')) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var THICK = 0.02; // how far the letter spreads at full strength, in em: any more and neighbouring letters run together
  var AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071]];
  function spread(v) {
    if (!v) return '';
    var r = v * THICK;
    return AROUND.map(function (o) { return (o[0] * r).toFixed(4) + 'em ' + (o[1] * r).toFixed(4) + 'em 0 currentColor'; }).join(',');
  }
  var letters = [];
  h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim()); // read as one sentence, not letter by letter
  (function walk(node) {
    Array.prototype.slice.call(node.childNodes).forEach(function (child) {
      if (child.nodeType === 1) return walk(child);
      if (child.nodeType !== 3 || !child.textContent.trim()) return;
      var frag = document.createDocumentFragment();
      Array.prototype.forEach.call(child.textContent, function (ch) {
        if (/\s/.test(ch)) return frag.appendChild(document.createTextNode(ch));
        var el = document.createElement('span');
        el.className = 'wt';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = ch;
        frag.appendChild(el);
        letters.push({ el: el, x: 0, y: 0, v: 0, shown: 0 });
      });
      node.replaceChild(frag, child);
    });
  })(h1);

  var mouseX = -1e4, mouseY = -1e4, box = null, fs = 80, raf = 0, stale = true;

  function measure() {
    var r = h1.getBoundingClientRect();
    box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    fs = parseFloat(getComputedStyle(h1).fontSize) || 80;
    letters.forEach(function (l) {
      var b = l.el.getBoundingClientRect();
      l.x = b.left + b.width / 2;
      l.y = b.top + b.height / 2;
    });
    stale = false;
  }
  function frame() {
    if (stale) measure();
    // how close the pointer is to the headline as a whole: the effect fades in as it approaches
    var dx = Math.max(box.left - mouseX, 0, mouseX - box.right);
    var dy = Math.max(box.top - mouseY, 0, mouseY - box.bottom);
    var near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / (fs * 1.5));
    var reach = fs * 1.3, moving = false;
    letters.forEach(function (l) {
      var d = Math.sqrt((l.x - mouseX) * (l.x - mouseX) + (l.y - mouseY) * (l.y - mouseY));
      var p = Math.max(0, 1 - d / reach);
      p = p * p * (3 - 2 * p); // smooth falloff
      var target = near * p; // 1: thickest, under the pointer
      l.v += (target - l.v) * 0.16;
      if (Math.abs(target - l.v) > 0.002) moving = true;
      var v = Math.round(l.v * 200) / 200;
      if (v === l.shown) return;
      l.shown = v;
      l.el.style.textShadow = spread(v);
    });
    raf = moving ? requestAnimationFrame(frame) : 0;
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  document.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    mouseX = e.clientX;
    mouseY = e.clientY;
    kick();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', function () { mouseX = mouseY = -1e4; kick(); });
  // letters move with scrolling, resizing and the entrance animation: measure again before the next frame
  function restale() { stale = true; kick(); }
  window.addEventListener('scroll', restale, { passive: true });
  window.addEventListener('resize', restale);
  setTimeout(restale, 2600);
})();
