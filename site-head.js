/* theme: the choice this browser made last time, otherwise the dark the site is drawn in.
   This runs before the page is painted, so the page never flashes the other one. */
(function (root) {
  try {
    var saved = localStorage.getItem('cnpt-theme');
    if (saved === 'light') root.setAttribute('data-theme', 'light');
  } catch (e) {}   // a browser with storage turned off keeps the dark one
})(document.documentElement);

/* motion gate: reveals run only with IntersectionObserver and without reduced-motion.
   If the main script never marks the page ready, fall back to the static page. */
(function (root) {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.classList.add('motion');
  setTimeout(function () {
    if (!root.classList.contains('motion-ready')) root.classList.remove('motion');
  }, 2500);
})(document.documentElement);
