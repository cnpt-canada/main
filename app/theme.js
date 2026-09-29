/* The dark / light switch, for the signed-in pages. The theme itself is put on the page before it
   paints by /site-head.js, which reads the same 'cnpt-theme' the public pages write, so a person who
   set the site light finds the workspace light too.

   The colours travel while the class is on the page, and only then, so nothing else has to carry a
   transition it does not want. */
const SUN = 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41';

export function themeButton() {
  const root = document.documentElement;
  const btn = document.createElement('button');
  btn.className = 'theme-btn';
  btn.type = 'button';
  btn.innerHTML =
    '<svg class="th-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/>' +
    SUN.split('M').filter(Boolean).map((d) => '<path d="M' + d + '"/>').join('') + '</svg>' +
    '<svg class="th-eclipse" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/>' +
    '<path d="M12 2a7 7 0 1 0 10 10"/></svg>';

  const tell = () => {
    const light = root.getAttribute('data-theme') === 'light';
    btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    btn.setAttribute('title', btn.getAttribute('aria-label'));
  };
  tell();

  const eases = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let settle;
  btn.addEventListener('click', () => {
    const light = root.getAttribute('data-theme') !== 'light';
    if (eases) {
      root.classList.add('theming');
      clearTimeout(settle);
      settle = setTimeout(() => root.classList.remove('theming'), 700);
    }
    if (light) root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    try { localStorage.setItem('cnpt-theme', light ? 'light' : 'dark'); } catch (e) {}
    tell();
  });
  return btn;
}
