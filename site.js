/* cnpt site: shared behaviour for every public page. Each part checks for its own elements, so pages load only what they use. */

/* old single-page links (cnpt.ca/#team) go to the page that now holds that section */
(function () {
  var moved = { '#what': '/about', '#focus': '/about#focus', '#practices': '/about#practices', '#process': '/about#process', '#team': '/network#team', '#talent': '/network#talent', '#contact': '/signin' };
  if (location.pathname === '/' && moved[location.hash]) location.replace(moved[location.hash]);
})();

/* a picture that fails to load gets out of the way and leaves its placeholder showing (the team portraits).
   Kept here rather than in an onerror attribute so the pages need no inline script at all. */
window.addEventListener('error', function (e) {
  var el = e.target;
  if (el && el.tagName === 'IMG' && el.hasAttribute('data-drop-if-missing')) el.remove();
}, true); // capture: error events on elements do not bubble

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

/* dark or light: the switch beside "Start a project", remembered on this browser */
(function () {
  var button = document.querySelector('.theme-btn');
  if (!button) return;
  var root = document.documentElement;
  var meta = document.querySelector('meta[name="theme-color"]');

  function tell() {
    var light = root.getAttribute('data-theme') === 'light';
    button.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    if (meta) meta.setAttribute('content', light ? '#EDEDEA' : '#141414');
  }
  tell();

  var easing = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? null : 0;
  var settle;

  button.addEventListener('click', function () {
    var light = root.getAttribute('data-theme') !== 'light';
    if (easing !== null) {                       // let the colours travel, then stop transitioning
      root.classList.add('theming');
      clearTimeout(settle);
      settle = setTimeout(function () { root.classList.remove('theming'); }, 700);
    }
    if (light) root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('cnpt-theme', light ? 'light' : 'dark'); } catch (e) {}
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

/* Letters that change places.

   Every label you can click is rebuilt as one small box per character, each holding that character
   twice: the one you see, and the same one waiting underneath. Pointing at the label sends the first
   copy up out of its box and brings the second up behind it, each letter a few milliseconds after the
   one before, so the word rolls over from the left. Nothing about the label's own width or position
   changes, so nothing around it moves.

   The letters are scenery: each label keeps a plain copy of its text for screen readers and the split
   version is hidden from them. */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  // `count` carries the running character index. One counter is shared by everything that belongs to
  // the same label or heading, so a sentence rolls over left to right instead of all at once — even
  // where the sentence has been cut into separate pieces beforehand, as the headings have.
  function slot(node, count) {
    var text = node.textContent;
    if (!text.trim()) return;
    var frag = document.createDocumentFragment();
    var spoken = document.createElement('span');
    spoken.className = 'sr-only';
    spoken.textContent = text;
    frag.appendChild(spoken);

    var run = document.createElement('span');
    run.className = 'sl-run';
    run.setAttribute('aria-hidden', 'true');
    // A box per character, but the boxes of one word are held together: a line may break between
    // words, as it always could, and never inside one.
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { run.appendChild(document.createTextNode(' ')); count.i++; return; }
      var word = document.createElement('span');
      word.className = 'sl-word';
      part.split('').forEach(function (ch) {
        var box = document.createElement('span');
        box.className = 'sl';
        box.style.setProperty('--i', count.i++);
        var up = document.createElement('span');
        var next = document.createElement('span');
        up.textContent = next.textContent = ch;
        box.appendChild(up);
        box.appendChild(next);
        word.appendChild(box);
      });
      run.appendChild(word);
    });
    frag.appendChild(run);
    node.parentNode.replaceChild(frag, node);
  }

  // the text of a label, wherever it sits among the icons and arrows that keep it company
  function textIn(el) {
    var found = [];
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) { if (c.textContent.trim()) found.push(c); }
        else if (c.nodeType === 1 && c.tagName.toLowerCase() !== 'svg' && !c.classList.contains('sr-only')) walk(c);
      }
    })(el);
    return found;
  }

  // the labels you click, and the titles of the things you point at
  var labels = '.navlinks .nav-link, .nav-sheet a, .nav-actions .btn, .hero-cta .btn, .cta-row .btn,' +
    ' .link-out span, .fcol a, .acc-name .kor, .works-note a,' +
    ' .value h3, .focus-item h3, .pack h3, .step h3, .sum-list h3, .member h3, .work h3,' +
    ' .sec-head p';
  Array.prototype.forEach.call(document.querySelectorAll(labels), function (el) {
    var count = { i: 0 };
    textIn(el).forEach(function (node) { slot(node, count); });
  });

  // The section headings are split into words for their entrance; the letters go inside those words,
  // so this waits until that has happened. A heading counts as one sentence: the words share a
  // counter, and the space between them takes a place in it, so the wave crosses the whole line.
  window.cnptSlotHeadings = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.sec h2, .cta h2'), function (head) {
      var count = { i: 0 };
      Array.prototype.forEach.call(head.querySelectorAll('.wd > span'), function (el) {
        textIn(el).forEach(function (node) { slot(node, count); });
        count.i++;
      });
    });
  };
})();

/* motion — hero parallax and entrance reveals */
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

  // The hero film is the heaviest thing on the site, so the page ships its first frame as a picture and only
  // fetches the film itself when it is wanted: not under reduced motion, and not on a metered or slow connection,
  // where the still frame is what visitors get. Once it is loaded it plays only while it is on screen.
  var heroVideo = document.querySelector('.hero-video');
  if (heroVideo && heroVideo.getAttribute('data-film')) {
    var link = navigator.connection || {};
    var sparing = link.saveData === true || /(^|-)2g$/.test(link.effectiveType || '');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !sparing) {
      heroVideo.src = heroVideo.getAttribute('data-film');
      var roll = function () {
        var played = heroVideo.play();
        if (played && played.catch) played.catch(function () {});
      };
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (e) { e.isIntersecting ? roll() : heroVideo.pause(); });
        }, { threshold: 0.05 }).observe(heroVideo);
      } else roll();
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
    ['.hero-foot .ticker', 'up', 880],
    ['.eyebrow', 'clip'],
    ['.sec h2, .cta h2', 'split'],
    ['.sec-head p, .prac-note, .lede, .cta-grid > div > p, .cta-row, .cta-form, .works-note', 'up'],
    ['.acc, .fgrid > *, .work', 'up'],
    ['.value, .step, .dl, .focus-item, .member, .pack', 'rule'],
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
  if (window.cnptSlotHeadings) window.cnptSlotHeadings();

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

/* A phrase that can say a little more.

   Opening one makes the sentence longer, which can push the phrase itself onto the next line — out
   from under the pointer. Left to :hover that closes the note, which puts the phrase back under the
   pointer, which opens it again: it flickers as fast as the browser can lay the line out. So the open
   state is latched here instead. Arriving at a phrase opens it, and it stays open until the pointer
   leaves the whole sentence — a target that does not move out from under you — or another phrase
   takes over. A phone has no pointer, so a tap does the same and a tap outside shuts it. */
(function () {
  var kws = Array.prototype.slice.call(document.querySelectorAll('.kw'));
  if (!kws.length) return;
  var shut = function () { kws.forEach(function (k) { k.classList.remove('is-open'); }); };
  var open = function (kw) { shut(); kw.classList.add('is-open'); };

  kws.forEach(function (kw) {
    kw.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') open(kw); });
    kw.addEventListener('click', function (e) {
      e.stopPropagation();
      if (kw.classList.contains('is-open')) shut(); else open(kw);
    });
    var sentence = kw.parentNode;
    if (sentence && sentence.nodeType === 1 && !sentence.hasAttribute('data-kw-sentence')) {
      sentence.setAttribute('data-kw-sentence', '');
      sentence.addEventListener('pointerleave', shut);
    }
  });
  document.addEventListener('click', function (e) {
    if (!(e.target.closest && e.target.closest('.kw'))) shut();
  });
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

/* hero headline: with the mouse inside the headline's box, the headline eases from ExtraBold to Regular and the
   letters near the pointer stay heavy (the closest ones a little past ExtraBold), so the weight follows the pointer;
   leaving eases everything back to ExtraBold.
   A smooth change of weight needs a font with a weight axis: Geist carries one (100–900), so the headline keeps
   its font and only the weight moves, once the file has loaded.
   Mouse and trackpad only, and only with motion on. */
(function () {
  var h1 = document.querySelector('.hero h1');
  if (!h1 || !document.documentElement.classList.contains('motion')) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || !document.fonts || !document.fonts.load) return;

  // REST is the ladder's own weight, so a headline nobody is pointing at is simply the headline.
  var REST = 480, PEAK = 820;
  document.fonts.load(PEAK + ' 80px "Geist"').then(function (faces) { if (faces.length) start(); }, function () {});

  function start() {
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
          letters.push({ el: el, v: 0, shown: REST, cx: 0, cy: 0 });
        });
        node.replaceChild(frag, child);
      });
    })(h1);
    h1.classList.add('is-var');

    // Medium is narrower than the peak, so words would hop between lines while the weight changes,
    // and a locked line cannot wrap out of trouble: pin the breaks where they fall at the heaviest
    // the headline ever gets, and pin them again whenever the width changes.
    var words = Array.prototype.slice.call(h1.querySelectorAll('.wd'));
    function lockLines() {
      Array.prototype.forEach.call(h1.querySelectorAll('br.wl'), function (br) { br.remove(); });
      h1.classList.remove('lines-locked');
      var saved = letters.map(function (l) { var w = l.el.style.fontWeight; l.el.style.fontWeight = PEAK; return w; });
      var top = null;
      words.forEach(function (wd) {
        var t = Math.round(wd.getBoundingClientRect().top);
        if (top !== null && t > top + 2) {
          var br = document.createElement('br');
          br.className = 'wl';
          wd.parentNode.insertBefore(br, wd);
        }
        top = t;
      });
      letters.forEach(function (l, i) { l.el.style.fontWeight = saved[i]; });
      h1.classList.add('lines-locked');
    }
    lockLines();
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      fontSize = 0; // a narrower page means a smaller headline, so the reach around the pointer changes too
      lockLines();
    });

    var mouseX = -1e4, mouseY = -1e4, raf = 0, last = 0, fontSize = 0;
    function frame(now) {
      // Everything is measured first and only then written. Reading a letter's place right after changing
      // the one before it would make the browser lay the headline out again for every letter, forty times a frame.
      var box = h1.getBoundingClientRect();
      if (!fontSize) fontSize = parseFloat(getComputedStyle(h1).fontSize) || 80;
      var inside = mouseX >= box.left && mouseX <= box.right && mouseY >= box.top && mouseY <= box.bottom;
      var i, l;
      if (inside) {
        for (i = 0; i < letters.length; i++) {
          var r = letters[i].el.getBoundingClientRect();
          letters[i].cx = r.left + r.width / 2;
          letters[i].cy = r.top + r.height / 2;
        }
      }
      // and the same easing whatever the screen's refresh rate, so it settles in about half a second either way
      var step = last ? Math.min(now - last, 64) : 16.7;
      last = now;
      var k = 1 - Math.pow(1 - 0.09, step / 16.7);
      var core = fontSize * 0.35, reach = fontSize * 1.4, moving = false;
      for (i = 0; i < letters.length; i++) {
        l = letters[i];
        var target = 0; // the headline's own weight while the mouse is outside it
        if (inside) {
          var dx = l.cx - mouseX, dy = l.cy - mouseY;
          // heaviest within the core around the pointer, easing back to Medium further out
          var p = Math.max(0, 1 - Math.max(0, Math.sqrt(dx * dx + dy * dy) - core) / reach);
          target = p * p * (3 - 2 * p);
        }
        l.v += (target - l.v) * k;
        if (Math.abs(target - l.v) > 0.002) moving = true;
        else l.v = target;
        var w = Math.round(REST + (PEAK - REST) * l.v);
        if (w !== l.shown) {
          l.shown = w;
          l.el.style.fontWeight = w === REST ? '' : w;
        }
      }
      if (moving) raf = requestAnimationFrame(frame);
      else { raf = 0; last = 0; }
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }

    document.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      mouseX = e.clientX;
      mouseY = e.clientY;
      kick();
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () { mouseX = mouseY = -1e4; kick(); });
    window.addEventListener('scroll', kick, { passive: true }); // scrolling can carry the headline out from under the pointer
  }
})();
