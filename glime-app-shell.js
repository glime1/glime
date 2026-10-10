/* =========================================================
   GLIME APP SHELL
   ---------------------------------------------------------
   One shared client navigation for logged-in GLIME pages:
   desktop sidebar (collapsible) + mobile slide-in drawer.

   Usage on a page:
     <link rel="stylesheet" href="glime-app-shell.css">
     <script src="glime-app-shell.js" defer></script>
     <body data-gas-title="Page title">      (optional [data-gas-support])
       ... <main data-gas-content> ... </main>

   Navigation only. No authentication, data or RPC logic lives
   here; each page keeps its own session handling.
   Public marketing pages keep glime-global-nav.* untouched.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeAppShell) return;

  var PREF_KEY = 'glime_nav_collapsed';
  var MOBILE_QUERY = '(max-width: 900px)';

  var PATHS = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
    leads: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M18 8v6M15 11h6"/>',
    customers: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4.2-6 8-6s7 2 8 6"/>',
    orders: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2.5l2.2 11h10.6l2-8H6.2"/>',
    services: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
    assistant: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
    chart: '<path d="M5 20V11M11 20V5M17 20v-6"/><path d="M3 20h18"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>',
    whatsapp: '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z"/><path d="M9.5 9.5c.4 2.2 2.3 4.1 4.6 4.6"/>',
    followup: '<path d="M4 12a8 8 0 0 1 13.5-5.8L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.5 5.8L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
    box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    support: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>',
    logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5"/><path d="M15 8l4 4-4 4M19 12H9"/>',
    chevron: '<path d="M15 6l-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (PATHS[name] || '') + '</svg>';
  }

  /* Every href below is an existing page in the repository. */
  var MENU = [
    {
      title: 'Workspace',
      items: [
        { label: 'Overview', href: 'dashboard.html', icon: 'home' },
        { label: 'Leads', href: 'leads.html', icon: 'leads' },
        { label: 'Customers', href: 'customer.html', icon: 'customers' },
        { label: 'Orders', href: 'orders.html', icon: 'orders' },
        { label: 'Services', href: 'services.html', icon: 'services' }
      ]
    },
    {
      title: 'AI &amp; Intelligence',
      items: [
        { label: 'AI Assistant', href: 'client-assistant.html', icon: 'assistant' },
        { label: 'Business Intelligence', href: 'glime-intelligence-center.html', icon: 'chart' },
        { label: 'Instagram Sales', href: 'instagram-sales-specialist.html', icon: 'instagram' },
        { label: 'WhatsApp Sales', href: 'whatsapp-sales-specialist.html', icon: 'whatsapp' },
        { label: 'Follow-up', href: 'follow-up.html', icon: 'followup' },
        { label: 'Voice AI', href: 'voice-ai.html', icon: 'mic' }
      ]
    },
    {
      title: 'Manage',
      items: [
        { label: 'Connector', href: 'ai-connections.html', icon: 'link' },
        { label: 'Billing &amp; Plans', href: 'billing.html', icon: 'card' },
        { label: 'Packages', href: 'packages.html', icon: 'box' },
        { label: 'Settings', href: 'settings.html', icon: 'sliders' }
      ]
    }
  ];

  var SUPPORT_ITEM = {
    label: 'Support',
    href: '#',
    icon: 'support',
    id: 'gasSupportLink',
    external: true
  };

  var identity = { name: '', clientId: '' };
  var api = { setOpen: null };

  function currentPage() {
    var seg = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!seg) return 'index.html';
    return seg.indexOf('.') === -1 ? seg + '.html' : seg;
  }

  function linkHtml(item, page) {
    var current = item.href.toLowerCase() === page;
    return '<a class="gas-link"' +
      (item.id ? ' id="' + item.id + '"' : '') +
      ' href="' + item.href + '"' +
      (current ? ' aria-current="page"' : '') +
      (item.external ? ' target="_blank" rel="noopener noreferrer"' : '') +
      ' data-label="' + item.label + '">' +
      icon(item.icon) +
      '<span class="gas-label">' + item.label + '</span></a>';
  }

  function groupsHtml(page, withSupport) {
    return MENU.map(function (group) {
      var items = group.items.slice();
      if (withSupport && group.title === 'Manage') items.push(SUPPORT_ITEM);
      return '<div class="gas-group"><div class="gas-group-title">' + group.title + '</div>' +
        items.map(function (item) { return linkHtml(item, page); }).join('') +
        '</div>';
    }).join('');
  }

  function applyIdentity() {
    var card = document.getElementById('gasAccount');
    if (!card) return;
    if (!identity.name && !identity.clientId) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    var name = identity.name || 'GLIME workspace';
    document.getElementById('gasAccName').textContent = name;
    document.getElementById('gasAccId').textContent =
      identity.clientId ? 'ID: ' + identity.clientId : '';
    document.getElementById('gasAvatar').textContent =
      name.trim().charAt(0).toUpperCase() || 'G';
  }

  function logout() {
    /* Dashboard defines its own handleLogout(); reuse it untouched. */
    if (typeof window.handleLogout === 'function') {
      window.handleLogout();
      return;
    }
    var client = window.supabaseClient;
    var done = function () {
      try { localStorage.removeItem('glime_client_email'); } catch (e) { /* ignore */ }
      location.replace('login.html');
    };
    try {
      if (client && client.auth && client.auth.signOut) {
        Promise.resolve(client.auth.signOut({ scope: 'local' })).then(done, done);
        return;
      }
    } catch (e) { /* fall through */ }
    done();
  }

  function init() {
    if (document.getElementById('gasSidebar')) return;
    var content = document.querySelector('[data-gas-content]');
    if (!content || !content.parentNode) return;

    var body = document.body;
    var page = currentPage();
    var title = body.getAttribute('data-gas-title') ||
      document.title.split('|')[0].trim();
    var withSupport = body.hasAttribute('data-gas-support');
    var mq = window.matchMedia(MOBILE_QUERY);

    var sidebar = document.createElement('aside');
    sidebar.className = 'gas-sidebar';
    sidebar.id = 'gasSidebar';
    sidebar.setAttribute('aria-label', 'Main navigation');
    sidebar.innerHTML =
      '<div class="gas-sb-head">' +
        '<a class="gas-brand" href="dashboard.html" aria-label="GLIME overview">' +
          '<img src="glime_logo_clean.svg" alt="GLIME">' +
          '<small class="gas-label">AI BUSINESS<br>WORKSPACE</small>' +
        '</a>' +
        '<button type="button" class="gas-icon-btn gas-collapse-btn" id="gasCollapse" ' +
          'aria-label="Collapse sidebar" aria-pressed="false">' + icon('chevron', 18) + '</button>' +
        '<button type="button" class="gas-icon-btn gas-close" id="gasClose" ' +
          'aria-label="Close navigation menu">' + icon('close', 18) + '</button>' +
      '</div>' +
      '<nav class="gas-nav" aria-label="GLIME sections">' + groupsHtml(page, withSupport) + '</nav>' +
      '<div class="gas-sb-foot">' +
        '<div class="gas-account" id="gasAccount" hidden>' +
          '<span class="gas-avatar" id="gasAvatar" aria-hidden="true">G</span>' +
          '<span class="gas-acc-text"><span class="gas-acc-name" id="gasAccName"></span>' +
          '<span class="gas-acc-id" id="gasAccId"></span></span>' +
        '</div>' +
        '<button type="button" class="gas-logout" id="gasLogout">' + icon('logout') +
          '<span class="gas-label">Secure Logout</span></button>' +
      '</div>';

    var topbar = document.createElement('header');
    topbar.className = 'gas-topbar';
    topbar.innerHTML =
      '<button type="button" class="gas-burger" id="gasBurger" aria-controls="gasSidebar" ' +
        'aria-expanded="false" aria-label="Open navigation menu">' + icon('menu', 22) + '</button>' +
      '<p class="gas-title" id="gasTitle"></p>';
    topbar.querySelector('#gasTitle').textContent = title;

    var backdrop = document.createElement('div');
    backdrop.className = 'gas-backdrop';
    backdrop.id = 'gasBackdrop';

    var col = document.createElement('div');
    col.className = 'gas-col';
    content.parentNode.insertBefore(col, content);
    col.appendChild(topbar);
    col.appendChild(content);
    col.parentNode.insertBefore(sidebar, col);
    body.appendChild(backdrop);
    body.classList.add('gas-body');

    var burger = document.getElementById('gasBurger');
    var closeBtn = document.getElementById('gasClose');
    var collapseBtn = document.getElementById('gasCollapse');
    var links = sidebar.querySelectorAll('.gas-link');
    var collapsedPref = false;
    var lastFocus = null;

    try { collapsedPref = localStorage.getItem(PREF_KEY) === '1'; } catch (e) { /* ignore */ }

    function isOpen() { return body.classList.contains('gas-open'); }

    function syncInert() {
      var hidden = mq.matches && !isOpen();
      if ('inert' in sidebar) sidebar.inert = hidden;
      sidebar.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    }

    function applyCollapsed() {
      var on = collapsedPref && !mq.matches;
      body.classList.toggle('gas-collapsed', on);
      collapseBtn.setAttribute('aria-pressed', String(on));
      collapseBtn.setAttribute('aria-label', on ? 'Expand sidebar' : 'Collapse sidebar');
      Array.prototype.forEach.call(links, function (link) {
        if (on) link.setAttribute('title', link.getAttribute('data-label'));
        else link.removeAttribute('title');
      });
    }

    function setOpen(open, restoreFocus) {
      if (open && !mq.matches) return;
      body.classList.toggle('gas-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
      syncInert();
      if (open) {
        lastFocus = document.activeElement;
        closeBtn.focus();
      } else if (restoreFocus) {
        (lastFocus && lastFocus.focus ? lastFocus : burger).focus();
      }
    }
    api.setOpen = setOpen;

    burger.addEventListener('click', function () { setOpen(!isOpen(), true); });
    closeBtn.addEventListener('click', function () { setOpen(false, true); });
    backdrop.addEventListener('click', function () { setOpen(false, true); });
    document.getElementById('gasLogout').addEventListener('click', logout);

    collapseBtn.addEventListener('click', function () {
      collapsedPref = !collapsedPref;
      try { localStorage.setItem(PREF_KEY, collapsedPref ? '1' : '0'); } catch (e) { /* ignore */ }
      applyCollapsed();
    });

    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener('click', function () { setOpen(false, false); });
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false, true);
        return;
      }
      if (event.key !== 'Tab') return;
      var focusable = Array.prototype.filter.call(
        sidebar.querySelectorAll('a[href], button:not([disabled])'),
        function (el) { return el.offsetParent !== null; }
      );
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    function onViewportChange() {
      if (!mq.matches && isOpen()) {
        body.classList.remove('gas-open');
        burger.setAttribute('aria-expanded', 'false');
        burger.setAttribute('aria-label', 'Open navigation menu');
      }
      applyCollapsed();
      syncInert();
    }
    if (mq.addEventListener) mq.addEventListener('change', onViewportChange);
    else if (mq.addListener) mq.addListener(onViewportChange);

    applyCollapsed();
    syncInert();
    applyIdentity();
  }

  window.GlimeAppShell = {
    /* Display-only label for the sidebar account card. Never used for authorization. */
    setIdentity: function (next) {
      next = next || {};
      identity.name = String(next.name || '');
      identity.clientId = String(next.clientId || '');
      applyIdentity();
    },
    open: function () { if (api.setOpen) api.setOpen(true, false); },
    close: function () { if (api.setOpen) api.setOpen(false, false); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
