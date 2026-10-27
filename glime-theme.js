/* =========================================================
   GLIME THEME TOGGLE  (dark = default, light = optional)
   ---------------------------------------------------------
   Load this in the <head> of logged-in pages ONLY, with the
   matching glime-theme.css, like this:

     <link rel="stylesheet" href="glime-theme.css">
     <script src="glime-theme.js"></script>

   It does three things:
   1. Reads the saved choice (localStorage "glime_theme") and sets
      <html data-theme="light|dark"> before the page paints (no flash).
   2. Adds a small sun/moon button (in the sidebar when the page uses
      the shared GLIME app shell, otherwise a floating round button).
   3. Keeps all open tabs in sync.
   Dark stays the default. Nothing here touches login or data.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeTheme) return;

  var KEY = 'glime_theme';
  var root = document.documentElement;

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' ? 'light' : 'dark';
    } catch (e) { return 'dark'; }
  }

  function pageName() {
    var seg = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!seg) return 'index';
    return seg.replace(/\.html?$/, '');
  }

  var current = read();
  root.setAttribute('data-page', pageName());
  root.setAttribute('data-theme', current);

  var SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  var buttons = [];

  function paintButtons() {
    var light = current === 'light';
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(light));
      b.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      b.setAttribute('title', light ? 'Dark mode' : 'Light mode');
      var icon = b.querySelector('.gtheme-ic');
      if (icon) icon.innerHTML = light ? MOON : SUN;
      var label = b.querySelector('.gtheme-label');
      if (label) label.textContent = light ? 'Dark mode' : 'Light mode';
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#ffffff' : '#05080c');
  }

  function apply(theme, persist) {
    current = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', current);
    if (persist) {
      try { localStorage.setItem(KEY, current); } catch (e) { /* ignore */ }
    }
    paintButtons();
  }

  function toggle() { apply(current === 'light' ? 'dark' : 'light', true); }

  function makeButton(kind) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'gtheme-btn gtheme-' + kind;
    b.innerHTML = '<span class="gtheme-ic" aria-hidden="true"></span>' +
      (kind === 'row' ? '<span class="gtheme-label"></span>' : '');
    b.addEventListener('click', toggle);
    buttons.push(b);
    return b;
  }

  function mount() {
    if (document.querySelector('.gtheme-btn')) return true;
    var foot = document.querySelector('#gasSidebar .gas-sb-foot');
    if (foot) {
      /* shared GLIME app shell: sidebar row above "Secure Logout" */
      var row = makeButton('row');
      var logout = foot.querySelector('#gasLogout');
      foot.insertBefore(row, logout || null);
      var topbar = document.querySelector('.gas-topbar');
      if (topbar) topbar.appendChild(makeButton('top'));
      paintButtons();
      return true;
    }
    if (document.body) {
      /* every other logged-in page: small floating button */
      document.body.appendChild(makeButton('float'));
      paintButtons();
      return true;
    }
    return false;
  }

  function start() {
    mount();
    /* shell pages build the sidebar a moment later: if it appears, add the row too */
    if (!document.querySelector('.gtheme-row') && window.MutationObserver) {
      var mo = new MutationObserver(function () {
        var foot = document.querySelector('#gasSidebar .gas-sb-foot');
        if (foot && !document.querySelector('.gtheme-row')) {
          var fl = document.querySelector('.gtheme-float');
          if (fl) {
            fl.remove();
            buttons = buttons.filter(function (x) { return x !== fl; });
          }
          var row = makeButton('row');
          foot.insertBefore(row, foot.querySelector('#gasLogout') || null);
          var topbar = document.querySelector('.gas-topbar');
          if (topbar && !topbar.querySelector('.gtheme-top')) topbar.appendChild(makeButton('top'));
          paintButtons();
          mo.disconnect();
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 8000);
    }
  }

  window.addEventListener('storage', function (e) {
    if (e.key === KEY) apply(read(), false);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  window.GlimeTheme = {
    get: function () { return current; },
    set: function (t) { apply(t, true); },
    toggle: toggle
  };
})();
