/* =========================================================
   GLIME PWA
   ---------------------------------------------------------
   Makes glime.online installable as an app.

   - adds the web app manifest link and theme colour
   - registers the service worker (/sw.js)
   - adds a permanent "Install App" item to the client sidebar
     (Android/desktop Chrome: opens the real install prompt;
     iPhone/iPad: Share > Add to Home Screen instructions;
     other browsers: browser-menu instructions). Hidden once the
     app is installed / opened as an app.
   - on dashboard.html only: shows a small "Install the GLIME app"
     banner
   - when the app is open in standalone mode, adds the class
     "glime-standalone" to <html>

   Loaded by glime-global-nav.js (public pages) and
   glime-app-shell.js (client pages). No login, data or payment
   logic lives here.

   Public API:  GLIME_PWA.install()  GLIME_PWA.isStandalone()
   ========================================================= */
(function () {
  'use strict';
  if (window.GLIME_PWA) return;

  var THEME = '#071016';
  /* v2 key: older builds stored a 365-day "installed" flag under the
     previous key, which hid the banner after the app was uninstalled. */
  var DISMISS_KEY = 'glime_pwa_install_dismissed_v2';
  var DAY = 24 * 60 * 60 * 1000;
  var STYLE_ID = 'glimePwaStyle';
  var MENU_ID = 'gasInstallApp';
  var deferred = null;
  var bar = null;

  /* ---- helpers ------------------------------------------------ */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function isStandalone() {
    try {
      if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return window.navigator.standalone === true;
  }

  function isDashboard() {
    return /\/dashboard(\.html)?$/i.test(location.pathname);
  }

  function hasSidebar() {
    return !!document.getElementById('gasSidebar');
  }

  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function dismissed() {
    var until = Number(lsGet(DISMISS_KEY));
    return !!until && Date.now() < until;
  }

  function dismissFor(days) { lsSet(DISMISS_KEY, String(Date.now() + days * DAY)); }

  function whenBody(fn) {
    if (document.body) { fn(); return; }
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  /* ---- manifest, colours, service worker ---------------------- */
  function addMeta(name, content) {
    if (document.querySelector('meta[name="' + name + '"]')) return;
    var m = document.createElement('meta');
    m.name = name;
    m.content = content;
    (document.head || document.documentElement).appendChild(m);
  }

  function setupHead() {
    if (!document.querySelector('link[rel="manifest"]')) {
      var l = document.createElement('link');
      l.rel = 'manifest';
      l.href = '/manifest.json';
      (document.head || document.documentElement).appendChild(l);
    }
    addMeta('theme-color', THEME);
    addMeta('mobile-web-app-capable', 'yes');
    addMeta('apple-mobile-web-app-capable', 'yes');
    addMeta('apple-mobile-web-app-title', 'GLIME');
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    var go = function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  /* ---- install banner / help ---------------------------------- */
  var CSS = [
    '.gpw{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom,0px));transform:translate(-50%,24px);width:min(520px,calc(100% - 24px));z-index:2147481000;box-sizing:border-box;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#101b29;color:#f4fbfd;border:1px solid rgba(184,222,234,.16);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);font-family:Manrope,Arial,sans-serif;opacity:0;transition:opacity .22s ease,transform .22s ease}',
    '.gpw.in{opacity:1;transform:translate(-50%,0)}',
    '.gpw-ico{flex:none;width:42px;height:42px;border-radius:11px}',
    '.gpw-body{flex:1;min-width:0}',
    '.gpw-t{font-size:.88rem;font-weight:800;letter-spacing:-.01em;margin-bottom:2px}',
    '.gpw-m{color:#9cabb9;font-size:.76rem;line-height:1.45}',
    '.gpw-act{display:flex;gap:8px;flex:none}',
    '.gpw-btn{min-height:40px;border:1px solid rgba(184,222,234,.16);background:transparent;color:#f4fbfd;border-radius:10px;padding:8px 13px;font:inherit;font-size:.76rem;font-weight:800;cursor:pointer;white-space:nowrap}',
    '.gpw-btn:focus-visible{outline:2px solid #52e8ff;outline-offset:2px}',
    '.gpw-btn.ok{background:linear-gradient(105deg,#50f5a8,#52e8ff);color:#031014;border:0}',
    '@media(max-width:480px){.gpw{flex-wrap:wrap}.gpw-act{width:100%}.gpw-btn{flex:1}}',
    '@media(prefers-reduced-motion:reduce){.gpw{transition:none}}'
  ].join('');

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function hideBar() {
    if (!bar) return;
    var b = bar;
    bar = null;
    b.classList.remove('in');
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 240);
  }

  function install() {
    if (!deferred) return Promise.resolve(false);
    var d = deferred;
    deferred = null;
    try { d.prompt(); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(d.userChoice)
      .then(function (c) { return !!(c && c.outcome === 'accepted'); })
      .catch(function () { return false; });
  }

  /* mode: 'install' (real Install button), 'ios' or 'manual' (instructions only).
     force: opened by the sidebar item, so ignore the dashboard-only and
     "Not now" rules. */
  function showBar(mode, force) {
    if (!document.body || isStandalone()) return;
    if (!force && (!isDashboard() || dismissed())) return;
    if (bar) hideBar();

    ensureStyle();

    bar = el('div', 'gpw');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Install the GLIME app');

    var ico = el('img', 'gpw-ico');
    ico.src = '/icons/icon.svg';
    ico.alt = '';
    ico.width = 42;
    ico.height = 42;
    bar.appendChild(ico);

    var msg = 'Open GLIME from your home screen like any other app.';
    if (mode === 'ios') msg = 'Tap the Share button, then choose Add to Home Screen.';
    if (mode === 'manual') msg = 'Open your browser menu (\u22EE) and tap Install app or Add to Home screen.';

    var body = el('div', 'gpw-body');
    body.appendChild(el('div', 'gpw-t', 'Install the GLIME app'));
    body.appendChild(el('div', 'gpw-m', msg));
    bar.appendChild(body);

    var act = el('div', 'gpw-act');
    var later = el('button', 'gpw-btn', mode === 'install' ? 'Not now' : 'Got it');
    later.type = 'button';
    later.addEventListener('click', function () {
      if (!force) dismissFor(mode === 'install' ? 7 : 30);
      hideBar();
    });
    act.appendChild(later);

    if (mode === 'install') {
      var go = el('button', 'gpw-btn ok', 'Install');
      go.type = 'button';
      go.addEventListener('click', function () {
        install().then(function (accepted) {
          if (!accepted && !force) dismissFor(7);
          hideBar();
        });
      });
      act.appendChild(go);
    }
    bar.appendChild(act);

    document.body.appendChild(bar);
    requestAnimationFrame(function () { if (bar) bar.classList.add('in'); });
  }

  /* ---- permanent sidebar item ---------------------------------- */
  var DL_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 4v11"/><path d="M7.5 11 12 15.5 16.5 11"/><path d="M5 20h14"/></svg>';

  function removeMenuItem() {
    var n = document.getElementById(MENU_ID);
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  function onMenuClick(e) {
    e.preventDefault();
    if (window.GlimeAppShell && window.GlimeAppShell.close) window.GlimeAppShell.close();
    if (isStandalone()) { removeMenuItem(); return; }
    if (deferred) {
      install().then(function (accepted) { if (accepted) removeMenuItem(); });
      return;
    }
    showBar(isIOS() ? 'ios' : 'manual', true);
  }

  function addMenuItem() {
    if (isStandalone() || document.getElementById(MENU_ID)) return;
    var nav = document.querySelector('#gasSidebar .gas-nav');
    if (!nav) return;
    var groups = nav.querySelectorAll('.gas-group');
    var group = groups.length ? groups[groups.length - 1] : nav;

    var a = document.createElement('a');
    a.className = 'gas-link';
    a.id = MENU_ID;
    a.href = '#';
    a.setAttribute('data-label', 'Install App');
    a.innerHTML = DL_ICON + '<span class="gas-label">Install App</span>';
    a.addEventListener('click', onMenuClick);
    group.appendChild(a);
  }

  /* ---- start -------------------------------------------------- */
  window.GLIME_PWA = { install: install, isStandalone: isStandalone };

  if (isStandalone()) document.documentElement.classList.add('glime-standalone');

  setupHead();
  registerWorker();

  window.addEventListener('beforeinstallprompt', function (e) {
    /* Keep the prompt on the dashboard and on client pages (sidebar item).
       Public pages keep Chrome's default behaviour. */
    if (!isDashboard() && !hasSidebar()) return;
    e.preventDefault();
    deferred = e;
    if (isDashboard()) whenBody(function () { showBar('install'); });
  });

  window.addEventListener('appinstalled', function () {
    deferred = null;
    hideBar();
    removeMenuItem();
  });

  whenBody(addMenuItem);

  if (isIOS() && !isStandalone() && isDashboard()) {
    whenBody(function () { setTimeout(function () { showBar('ios'); }, 2500); });
  }
})();
