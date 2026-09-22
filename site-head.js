/* motion gate: reveals run only with IntersectionObserver and without reduced-motion.
   If the main script never marks the page ready, fall back to the static page. */
(function (root) {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.classList.add('motion');
  setTimeout(function () {
    if (!root.classList.contains('motion-ready')) root.classList.remove('motion');
  }, 2500);
})(document.documentElement);
