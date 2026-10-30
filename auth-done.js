/* The last step of the sign-in popup: hand the token to the page that opened it, and close.
   Google puts the id_token in the fragment, which no server ever sees, so this is the only place it
   is read. It is sent to this origin alone, and if there is no opener — the popup was blocked and
   Google came back in the tab itself — it is left for the page to pick up on the way back. */
(function () {
  var hash = String(location.hash || '').replace(/^#/, '');
  var token = '';
  hash.split('&').forEach(function (part) {
    var eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq) === 'id_token') token = decodeURIComponent(part.slice(eq + 1));
  });
  history.replaceState(null, '', location.pathname); // keep it out of the address bar and history

  if (!token) {
    location.replace('/');
    return;
  }
  if (window.opener) {
    window.opener.postMessage({ cnptIdToken: token }, location.origin);
    window.close();
    return;
  }
  try { sessionStorage.setItem('cnpt-admin-token', token); } catch (e) {}
  location.replace('/#admin');
})();
