/*
 * GLIME — Instagram Mobile / Responsive Add-on (single file)
 *
 * Layer 1: mobile navigation (drawer menu, chat <-> inbox panes) and the
 *          customer-details sheet. Visual styling lives in
 *          instagram-sales-specialist.css; this file only injects the
 *          drawer styles and wires behaviour.
 * Layer 2: small realtime watcher that clicks the page's own refresh
 *          button when a new message / conversation arrives.
 */

/* ============================================================
   LAYER 1 — NAVIGATION
   ============================================================ */
(function () {
  'use strict';

  var BP = 720;
  var CSS_ID = 'glime-instagram-mobile-ui-css-v4';
  var MENU_ID = 'glime-instagram-mobile-menu-v2';

  function isMobile() {
    return window.innerWidth <= BP;
  }

  function addStyles() {
    if (document.getElementById(CSS_ID)) return;

    var style = document.createElement('style');
    style.id = CSS_ID;

    style.textContent = `
.ig-mob-menu-btn{display:none}
@media (max-width:720px){
  .ig-mob-menu-btn{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;padding:0;border:0;border-radius:50%;background:#1a1a1a;color:#f5f5f5;font-size:22px;line-height:1}
  body.ig-mobile-lock{overflow:hidden}
  .ig-mobile-drawer-overlay{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.6);opacity:0;visibility:hidden;transition:opacity .2s ease}
  .ig-mobile-drawer{position:fixed;left:0;top:0;bottom:0;z-index:9001;width:min(310px,86vw);padding:16px 11px 12px;background:#000;color:#f5f5f5;border-right:1px solid #262626;transform:translateX(-105%);transition:transform .22s ease;display:flex;flex-direction:column}
  body.ig-menu-open .ig-mobile-drawer-overlay{opacity:1;visibility:visible}
  body.ig-menu-open .ig-mobile-drawer{transform:translateX(0)}
  .ig-drawer-head{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid #262626}
  .ig-drawer-head img{width:82px;height:42px;object-fit:contain}
  .ig-drawer-close{display:grid;place-items:center;width:38px;height:38px;border:0;border-radius:50%;background:#1a1a1a;color:#f5f5f5;font-size:24px}
  .ig-drawer-label{padding:12px 8px 7px;color:#a8a8a8;font-size:10px;letter-spacing:1.5px;font-weight:700}
  .ig-drawer-nav{display:grid;gap:2px;overflow:auto}
  .ig-drawer-nav a{display:flex;align-items:center;gap:14px;min-height:48px;padding:8px 12px;border-radius:12px;color:#f5f5f5;font-size:15px;text-decoration:none}
  .ig-drawer-nav a.active{background:#161616;font-weight:700}
  .ig-drawer-bottom{margin-top:auto;padding-top:9px;border-top:1px solid #262626}
  .ig-drawer-workspace{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:#121212}
  .ig-drawer-dot{width:8px;height:8px;border-radius:50%;background:#31d159}
  .ig-drawer-workspace b,.ig-drawer-workspace small{display:block}
  .ig-drawer-workspace b{font-size:13px}
  .ig-drawer-workspace small{font-size:11px;color:#a8a8a8;margin-top:2px}
  .ig-drawer-logout{width:100%;margin-top:8px;min-height:40px;border:0;border-radius:10px;background:#3a1217;color:#ff8a94;font-size:13px;font-weight:700}
}
`;

    document.head.appendChild(style);
  }

  function closeMenu() {
    document.body.classList.remove('ig-menu-open', 'ig-mobile-lock');
  }

  function openMenu() {
    document.body.classList.add('ig-menu-open', 'ig-mobile-lock');
  }

  function addMenu() {
    if (document.getElementById(MENU_ID)) return;

    var overlay = document.createElement('div');
    overlay.id = 'glimeInstagramMobileOverlay';
    overlay.className = 'ig-mobile-drawer-overlay';
    overlay.addEventListener('click', closeMenu);

    var drawer = document.createElement('aside');
    drawer.id = MENU_ID;
    drawer.className = 'ig-mobile-drawer';
    drawer.setAttribute('aria-label', 'GLIME menu');

    var sidebar = document.querySelector('.sidebar');
    var links = sidebar ? sidebar.querySelectorAll('nav a') : [];
    var navHtml = '';

    Array.prototype.forEach.call(links, function (a) {
      navHtml +=
        '<a href="' + (a.getAttribute('href') || '#') + '"' +
        (a.classList.contains('active') ? ' class="active"' : '') + '>' +
        a.innerHTML + '</a>';
    });

    drawer.innerHTML =
      '<div class="ig-drawer-head">' +
        '<img src="glime_logo_clean.svg" alt="GLIME">' +
        '<button type="button" class="ig-drawer-close" aria-label="Close menu">×</button>' +
      '</div>' +
      '<div class="ig-drawer-label">GLIME BUSINESS WORKSPACE</div>' +
      '<nav class="ig-drawer-nav">' + navHtml + '</nav>' +
      '<div class="ig-drawer-bottom">' +
        '<div class="ig-drawer-workspace">' +
          '<span class="ig-drawer-dot"></span>' +
          '<div><b id="igMobileBusiness">Business</b><small id="igMobileClient">Loading…</small></div>' +
        '</div>' +
        '<button type="button" class="ig-drawer-logout">Secure Logout</button>' +
      '</div>';

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    drawer.querySelector('.ig-drawer-close').addEventListener('click', closeMenu);

    drawer.querySelector('.ig-drawer-logout').addEventListener('click', function () {
      var logout = document.getElementById('logout');
      if (logout) logout.click();
    });

    Array.prototype.forEach.call(drawer.querySelectorAll('a'), function (a) {
      a.addEventListener('click', closeMenu);
    });
  }

  function addMenuButton() {
    if (document.getElementById('glimeInstagramMobileMenuButton')) return;

    var topbar = document.querySelector('.topbar');
    if (!topbar) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'glimeInstagramMobileMenuButton';
    button.className = 'ig-mob-menu-btn';
    button.setAttribute('aria-label', 'Open menu');
    button.innerHTML = '<span>☰</span>';
    button.addEventListener('click', openMenu);

    topbar.insertBefore(button, topbar.firstElementChild);
  }

  /* The page fills #businessName / #clientId after login finishes. */
  function syncIdentity() {
    var business = document.getElementById('businessName');
    var client = document.getElementById('clientId');
    var b = document.getElementById('igMobileBusiness');
    var c = document.getElementById('igMobileClient');

    if (business && b) b.textContent = business.textContent;
    if (client && c) c.textContent = client.textContent;
  }

  function showInbox() {
    var workspace = document.querySelector('.workspace');
    if (workspace) workspace.classList.remove('ig-chat-open');
    if (isMobile()) closeMenu();
  }

  function showChat() {
    var workspace = document.querySelector('.workspace');
    if (workspace && isMobile()) workspace.classList.add('ig-chat-open');
  }

  /* Back chevron lives in the page HTML; just wire it once. */
  function bindBackButton() {
    var button = document.getElementById('glimeInstagramMobileBack');

    if (!button || button.getAttribute('data-bound') === '1') return;

    button.setAttribute('data-bound', '1');
    button.addEventListener('click', function (e) {
      e.preventDefault();
      showInbox();
    });
  }

  /* Customer details sheet (tablet + mobile). */
  function setSheet(open) {
    var ctx = document.querySelector('aside.context');
    if (!ctx) return;

    ctx.classList.toggle('ig-sheet-open', !!open);
    document.body.classList.toggle('ig-mobile-lock', !!open);
  }

  function bindInfoSheet() {
    var info = document.getElementById('infoBtn');
    var close = document.getElementById('ctxClose');

    if (info && info.getAttribute('data-bound') !== '1') {
      info.setAttribute('data-bound', '1');
      info.addEventListener('click', function () { setSheet(true); });
    }

    if (close && close.getAttribute('data-bound') !== '1') {
      close.setAttribute('data-bound', '1');
      close.addEventListener('click', function () { setSheet(false); });
    }
  }

  function bindConversationList() {
    var list = document.getElementById('list');

    if (!list || list.getAttribute('data-glime-ig-mobile') === '1') return;

    list.setAttribute('data-glime-ig-mobile', '1');

    list.addEventListener('click', function (event) {
      if (!event.target.closest('.conversation-item')) return;

      setTimeout(function () {
        var view = document.getElementById('view');
        var empty = document.getElementById('empty');

        if (
          isMobile() && view && !view.classList.contains('hidden') &&
          (!empty || empty.classList.contains('hidden'))
        ) {
          showChat();
        }
      }, 30);
    });
  }

  function bindBackBehavior() {
    var close = document.getElementById('closeConversation');

    if (close && close.getAttribute('data-glime-mobile-bound') !== '1') {
      close.setAttribute('data-glime-mobile-bound', '1');
      close.addEventListener('click', function () {
        if (isMobile()) showInbox();
      });
    }
  }

  function observeView() {
    var view = document.getElementById('view');

    if (!view || window.__glimeIgMobileObserver) return;

    window.__glimeIgMobileObserver = new MutationObserver(function () {
      if (!isMobile()) return;

      if (!view.classList.contains('hidden')) {
        showChat();
      } else {
        showInbox();
      }
    });

    window.__glimeIgMobileObserver.observe(view, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  function start() {
    addStyles();
    addMenu();
    addMenuButton();
    syncIdentity();
    bindBackButton();
    bindInfoSheet();
    bindConversationList();
    bindBackBehavior();
    observeView();

    var tries = 0;
    var identityTimer = setInterval(function () {
      syncIdentity();
      tries++;
      if (tries > 30) clearInterval(identityTimer);
    }, 1000);

    window.addEventListener('resize', function () {
      if (!isMobile()) {
        showInbox();
        closeMenu();
      }
    }, { passive: true });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMenu();
        setSheet(false);
        if (isMobile()) showInbox();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();


/* ============================================================
   LAYER 2 — REALTIME WATCHER

   Listens to instagram_messages (INSERT) and instagram_conversations
   for this client and clicks the page's own refresh button (debounced).
   Waits for the real client id: #clientId shows "Loading…" until login
   finishes, and must never be used as a realtime filter.
   ============================================================ */
(function () {
  'use strict';

  var URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  var client = null;
  var channel = null;
  var subscribedFor = '';
  var debounce = null;

  function realClientId() {
    var el = document.getElementById('clientId');
    if (!el) return '';

    var value = String(el.textContent || '').trim();

    return !value || /^loading/i.test(value) ? '' : value;
  }

  function scheduleRefresh() {
    clearTimeout(debounce);

    debounce = setTimeout(function () {
      var button = document.getElementById('refresh');

      try {
        if (button) button.click();
      } catch (_) {
        /* A failed UI refresh must never break realtime. */
      }
    }, 1500);
  }

  function ensureSubscribed() {
    if (!window.supabase || typeof window.supabase.createClient !== 'function') return;

    var id = realClientId();

    if (!id || id === subscribedFor) return;

    try {
      if (!client) client = window.supabase.createClient(URL, KEY);

      if (channel) {
        client.removeChannel(channel);
        channel = null;
      }

      channel = client
        .channel('glime-instagram-live-' + id)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'instagram_conversations', filter: 'client_id=eq.' + id },
          scheduleRefresh
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'instagram_messages', filter: 'client_id=eq.' + id },
          scheduleRefresh
        )
        .subscribe();

      subscribedFor = id;
    } catch (error) {
      console.warn('[GLIME Instagram Realtime]', error);
    }
  }

  function init() {
    ensureSubscribed();
    setInterval(ensureSubscribed, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
