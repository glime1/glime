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

   Navigation only, with ONE exception: the in-app Feedback form
   (see the FEEDBACK section). It sends through a single RPC,
   client_submit_feedback; the contract is in FEEDBACK_BACKEND_SPEC.md.
   Authentication is never handled here; each page keeps its own
   session handling.
   The owner photo in the account card comes from the shared photo
   system (glime-avatar.js), which this shell loads once per page.
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
    feedback: '<path d="M4 5h16v11H9.5L5 20v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
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
        { label: 'Business Growth Intelligence', href: 'glime-intelligence-center.html', icon: 'chart' },
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
        { label: 'Settings', href: 'settings.html', icon: 'sliders' },
        { label: 'Feedback', href: '#feedback', icon: 'feedback', id: 'gasFeedbackLink' }
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

  /* Owner photo / all profile photos: one shared system for every page. */
  function loadPhotoSystem() {
    if (window.GlimePhoto || document.querySelector('script[src*="glime-avatar.js"]')) return;
    var s = document.createElement('script');
    s.src = 'glime-avatar.js?v=20261013';
    s.defer = true;
    document.head.appendChild(s);
  }

  function loadPushSystem() {
    if (window.GlimePush || document.querySelector('script[src*="glime-push.js"]')) return;
    var s = document.createElement('script');
    s.src = 'glime-push.js?v=20261021';
    s.defer = true;
    document.head.appendChild(s);
  }

  /* "Download My Data" button: added to the sidebar by this addon. */
  function loadExportSystem() {
    if (window.GlimeDataExport || document.querySelector('script[src*="client-data-export-addon.js"]')) return;
    var s = document.createElement('script');
    s.src = 'client-data-export-addon.js?v=20261024';
    s.defer = true;
    document.head.appendChild(s);
  }

  /* App install (PWA): manifest, service worker and the install banner on the dashboard. */
  function loadPwaSystem() {
    if (window.GLIME_PWA || document.querySelector('script[src*="glime-pwa.js"]')) return;
    var s = document.createElement('script');
    s.src = 'glime-pwa.js?v=1';
    s.defer = true;
    document.head.appendChild(s);
  }

  /* Light / dark mode: loads the theme files once; the toggle button is added to the sidebar by glime-theme.js. */
  function loadThemeSystem() {
    if (!document.querySelector('link[href*="glime-theme.css"]')) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'glime-theme.css?v=1';
      document.head.appendChild(l);
    }
    if (window.GlimeTheme || document.querySelector('script[src*="glime-theme.js"]')) return;
    var s = document.createElement('script');
    s.src = 'glime-theme.js?v=1';
    document.head.appendChild(s);
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

  /* =========================================================
     FEEDBACK  (frontend only)
     ---------------------------------------------------------
     Sidebar > Manage > Feedback opens a form. One call only:
       supabase.rpc('client_submit_feedback', { p_payload: {...} })
     The client is NEVER sent from the browser; the backend finds
     it from the signed-in session. See FEEDBACK_BACKEND_SPEC.md.
     Unsent feedback (offline, or backend not ready yet) is kept on
     this device and sent automatically later; client_request_id
     makes sure it is never stored twice.
  ========================================================= */
  var FB = {
    SB_URL: 'https://ufoulgbiqgjriwapuopc.supabase.co',
    SB_KEY: 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA',
    RPC: 'client_submit_feedback',
    VERSION: '2026-10-27',
    MIN: 10,
    MAX: 2000,
    COOLDOWN_MS: 30000,
    DRAFT: 'glime_feedback_draft',
    PENDING: 'glime_feedback_pending',
    LAST: 'glime_feedback_last'
  };

  var FB_TYPES = [
    { key: 'bug', label: 'Problem', hint: 'What happened, and what did you expect to happen?' },
    { key: 'idea', label: 'Idea', hint: 'What would you like GLIME to do, or do better?' },
    { key: 'question', label: 'Question', hint: 'What would you like to know?' },
    { key: 'praise', label: 'Praise', hint: 'What is working well for you?' },
    { key: 'other', label: 'Other', hint: 'Tell us anything on your mind.' }
  ];

  var fbState = { type: 'idea', rating: 0, sending: false };
  var fbOv = null;
  var fbSbClient = null;
  var fbLastFocus = null;

  function fbStore(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* ignore */ }
    return null;
  }

  function fbUuid() {
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function fbPageName() {
    var t = document.body.getAttribute('data-gas-title') || document.title.split('|')[0] || '';
    return t.trim().slice(0, 120);
  }

  function fbClient() {
    if (window.supabaseClient && typeof window.supabaseClient.rpc === 'function') return window.supabaseClient;
    if (fbSbClient) return fbSbClient;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try { fbSbClient = window.supabase.createClient(FB.SB_URL, FB.SB_KEY); } catch (e) { fbSbClient = null; }
    }
    return fbSbClient;
  }

  function fbPayload(message) {
    var theme = '';
    try { theme = document.documentElement.getAttribute('data-theme') || ''; } catch (e) { /* ignore */ }
    return {
      client_request_id: fbUuid(),
      type: fbState.type,
      rating: fbState.rating || null,
      message: message,
      page: fbPageName(),
      page_url: location.href.split('#')[0].slice(0, 500),
      can_contact: !!document.getElementById('gfbContact').checked,
      metadata: {
        app_version: FB.VERSION,
        viewport: window.innerWidth + 'x' + window.innerHeight,
        language: navigator.language || '',
        theme: theme,
        user_agent: (navigator.userAgent || '').slice(0, 300),
        queued: false
      }
    };
  }

  /* Sends one payload. Resolves { ok, id, reference, error, queue, auth }. Never rejects. */
  function fbSend(payload) {
    var client = fbClient();
    if (!client) return Promise.resolve({ ok: false, queue: true, error: 'The connection is not ready yet.' });

    return client.auth.getSession().then(function (r) {
      if (!r || !r.data || !r.data.session) {
        return { ok: false, auth: true, error: 'Your session has expired. Please sign in again.' };
      }
      return client.rpc(FB.RPC, { p_payload: payload }).then(function (res) {
        if (res.error) {
          var msg = String(res.error.message || '');
          var missing = res.error.code === 'PGRST202' || /could not find the function|schema cache/i.test(msg);
          var offline = /failed to fetch|network|load failed/i.test(msg);
          return {
            ok: false,
            queue: missing || offline,
            error: missing ? 'Feedback is being set up on our side.' : (offline ? 'No internet connection.' : (msg || 'Feedback could not be sent.'))
          };
        }
        var d = res.data || {};
        if (d.ok === false) return { ok: false, error: d.error || 'Feedback could not be sent.' };
        return { ok: true, id: d.id || null, reference: d.reference || null };
      });
    }).catch(function () {
      return { ok: false, queue: true, error: 'No internet connection.' };
    });
  }

  function fbPendingList() {
    try { return JSON.parse(fbStore(FB.PENDING) || '[]') || []; } catch (e) { return []; }
  }

  function fbQueue(payload) {
    var list = fbPendingList();
    payload.metadata.queued = true;
    list.push(payload);
    fbStore(FB.PENDING, JSON.stringify(list.slice(-5)));
  }

  /* Sends anything saved earlier, one at a time, stopping at the first failure. */
  function fbFlushPending() {
    var list = fbPendingList();
    if (!list.length) return;

    var step = function (i) {
      if (i >= list.length) { fbStore(FB.PENDING, null); return; }
      fbSend(list[i]).then(function (res) {
        if (res.ok) { step(i + 1); return; }
        fbStore(FB.PENDING, JSON.stringify(list.slice(i)));
      });
    };
    step(0);
  }

  var FB_CSS =
    '.gfb-ov{position:fixed;inset:0;z-index:2147482000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,8,12,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);opacity:0;transition:opacity .16s ease}' +
    '.gfb-ov[hidden]{display:none}.gfb-ov.in{opacity:1}' +
    '.gfb-box{width:min(520px,100%);max-height:92vh;overflow-y:auto;background:#0f1a26;color:#f2f7fb;border:1px solid rgba(255,255,255,.13);border-radius:22px;padding:22px 20px 20px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Poppins,Manrope,Arial,sans-serif;transform:translateY(10px) scale(.98);transition:transform .16s ease}' +
    '.gfb-ov.in .gfb-box{transform:none}' +
    '.gfb-grab{display:none;width:40px;height:4px;border-radius:99px;background:rgba(255,255,255,.22);margin:-8px auto 14px}' +
    '.gfb-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;margin-bottom:16px}' +
    '.gfb-head h2{margin:0 0 4px;font-size:1.15rem;letter-spacing:-.01em}' +
    '.gfb-head p{margin:0;font-size:.82rem;line-height:1.55;color:#9db0c0}' +
    '.gfb-x{flex:0 0 36px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;display:grid;place-items:center;cursor:pointer}' +
    '.gfb-label{display:block;margin:16px 0 8px;font-size:.78rem;font-weight:600;color:#cfdce8}' +
    '.gfb-label span{font-weight:400;color:#7f93a5;margin-left:6px}' +
    '.gfb-types{display:flex;flex-wrap:wrap;gap:8px}' +
    '.gfb-chip{min-height:40px;padding:0 15px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.04);color:inherit;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer;transition:background .15s,border-color .15s}' +
    '.gfb-chip[aria-checked="true"]{background:linear-gradient(105deg,#00ff88,#00f0ff);border-color:transparent;color:#061016}' +
    '.gfb-stars{display:flex;gap:4px}' +
    '.gfb-star{width:44px;height:44px;border:0;background:transparent;color:#4a5b6b;cursor:pointer;display:grid;place-items:center;transition:color .12s,transform .12s}' +
    '.gfb-star svg{width:30px;height:30px;fill:currentColor}' +
    '.gfb-star.on{color:#ffc83d}.gfb-star:active{transform:scale(.9)}' +
    '.gfb-ta{width:100%;min-height:130px;resize:vertical;padding:13px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:#0b141d;color:#f2f7fb;font:inherit;font-size:16px;line-height:1.55;outline:0;transition:border-color .15s,box-shadow .15s}' +
    '.gfb-ta:focus{border-color:rgba(0,255,136,.55);box-shadow:0 0 0 3px rgba(0,255,136,.12)}' +
    '.gfb-meta{display:flex;justify-content:space-between;gap:10px;margin-top:6px;font-size:.74rem;color:#7f93a5}' +
    '.gfb-check{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:.84rem;color:#cfdce8;cursor:pointer}' +
    '.gfb-check input{width:20px;height:20px;accent-color:#00e68a}' +
    '.gfb-err{margin-top:14px;padding:11px 13px;border-radius:12px;border:1px solid rgba(255,93,115,.4);background:rgba(255,93,115,.09);color:#ff9aa8;font-size:.82rem;line-height:1.5}' +
    '.gfb-err[hidden]{display:none}' +
    '.gfb-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}' +
    '.gfb-btn{min-height:48px;padding:0 22px;border-radius:13px;font:inherit;font-size:.9rem;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.2);background:transparent;color:inherit}' +
    '.gfb-btn.send{border:0;background:linear-gradient(105deg,#00ff88,#00f0ff);color:#061016}' +
    '.gfb-btn:disabled{opacity:.55;cursor:default}' +
    '.gfb-done{text-align:center;padding:14px 4px 4px}' +
    '.gfb-done[hidden]{display:none}' +
    '.gfb-tick{width:64px;height:64px;margin:6px auto 14px;border-radius:50%;display:grid;place-items:center;background:rgba(0,255,136,.13);border:1px solid rgba(0,255,136,.45);color:#00ff88}' +
    '.gfb-tick svg{width:30px;height:30px}' +
    '.gfb-done h3{margin:0 0 6px;font-size:1.1rem}' +
    '.gfb-done p{margin:0 0 6px;color:#9db0c0;font-size:.86rem;line-height:1.6}' +
    '.gfb-ref{display:inline-block;margin-top:8px;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,.07);font-size:.78rem;font-weight:600;color:#cfdce8}' +
    '@media(max-width:600px){.gfb-ov{align-items:flex-end;padding:0}.gfb-box{border-radius:22px 22px 0 0;padding-bottom:calc(20px + env(safe-area-inset-bottom,0px));max-height:94vh}.gfb-grab{display:block}.gfb-actions{flex-direction:column-reverse}.gfb-btn{width:100%}}';

  function fbEnsureStyle() {
    if (document.getElementById('gasFeedbackStyle')) return;
    var s = document.createElement('style');
    s.id = 'gasFeedbackStyle';
    s.textContent = FB_CSS;
    document.head.appendChild(s);
  }

  function fbStarSvg() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.2L12 17l-5.6 3 1.1-6.2L2.9 9.4l6.3-.9z"/></svg>';
  }

  function fbBuild() {
    if (fbOv) return fbOv;
    fbEnsureStyle();

    var types = FB_TYPES.map(function (t) {
      return '<button type="button" class="gfb-chip" role="radio" data-type="' + t.key + '" aria-checked="false">' + t.label + '</button>';
    }).join('');

    var stars = '';
    for (var i = 1; i <= 5; i++) {
      stars += '<button type="button" class="gfb-star" role="radio" data-rate="' + i + '" aria-checked="false" aria-label="' + i + ' out of 5">' + fbStarSvg() + '</button>';
    }

    fbOv = document.createElement('div');
    fbOv.className = 'gfb-ov';
    fbOv.hidden = true;
    fbOv.innerHTML =
      '<div class="gfb-box" role="dialog" aria-modal="true" aria-labelledby="gfbTitle">' +
        '<div class="gfb-grab"></div>' +
        '<div class="gfb-head"><div><h2 id="gfbTitle">Send feedback</h2>' +
          '<p>Tell us what is working, what is not, or what you would like to see. A real person reads every message.</p></div>' +
          '<button type="button" class="gfb-x" data-close aria-label="Close">' + icon('close', 18) + '</button></div>' +
        '<form id="gfbForm" novalidate>' +
          '<div class="gfb-label" id="gfbTypeLbl">What is this about?</div>' +
          '<div class="gfb-types" role="radiogroup" aria-labelledby="gfbTypeLbl">' + types + '</div>' +
          '<div class="gfb-label" id="gfbRateLbl">How is your experience so far?<span>optional</span></div>' +
          '<div class="gfb-stars" role="radiogroup" aria-labelledby="gfbRateLbl">' + stars + '</div>' +
          '<label class="gfb-label" for="gfbMsg">Your message</label>' +
          '<textarea id="gfbMsg" class="gfb-ta" maxlength="' + FB.MAX + '" rows="5"></textarea>' +
          '<div class="gfb-meta"><span id="gfbAbout"></span><span id="gfbCount">0 / ' + FB.MAX + '</span></div>' +
          '<label class="gfb-check"><input type="checkbox" id="gfbContact" checked> You can contact me about this</label>' +
          '<div class="gfb-err" id="gfbErr" role="alert" hidden></div>' +
          '<div class="gfb-actions">' +
            '<button type="button" class="gfb-btn" data-close>Cancel</button>' +
            '<button type="submit" class="gfb-btn send" id="gfbSend">Send feedback</button>' +
          '</div>' +
        '</form>' +
        '<div class="gfb-done" id="gfbDone" hidden>' +
          '<div class="gfb-tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>' +
          '<h3 id="gfbDoneTitle">Thank you!</h3><p id="gfbDoneText"></p><span class="gfb-ref" id="gfbRef" hidden></span>' +
          '<div class="gfb-actions"><button type="button" class="gfb-btn send" data-close>Done</button></div>' +
        '</div>' +
      '</div>';

    document.body.appendChild(fbOv);

    var ta = fbOv.querySelector('#gfbMsg');

    fbOv.addEventListener('mousedown', function (e) { if (e.target === fbOv) fbClose(); });
    fbOv.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { fbClose(); return; }
      var chip = e.target.closest('[data-type]');
      if (chip) { fbSetType(chip.getAttribute('data-type')); return; }
      var star = e.target.closest('[data-rate]');
      if (star) {
        var n = Number(star.getAttribute('data-rate'));
        fbSetRating(fbState.rating === n ? 0 : n);
      }
    });

    ta.addEventListener('input', function () {
      document.getElementById('gfbCount').textContent = ta.value.length + ' / ' + FB.MAX;
      document.getElementById('gfbErr').hidden = true;
      fbStore(FB.DRAFT, ta.value ? ta.value : null);
    });

    fbOv.querySelector('#gfbForm').addEventListener('submit', function (e) {
      e.preventDefault();
      fbSubmit();
    });

    document.addEventListener('keydown', function (e) {
      if (fbOv.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); fbClose(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(
        fbOv.querySelectorAll('button, input, textarea'),
        function (el) { return !el.disabled && el.offsetParent !== null; }
      );
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    return fbOv;
  }

  function fbSetType(key) {
    var t = FB_TYPES.filter(function (x) { return x.key === key; })[0] || FB_TYPES[1];
    fbState.type = t.key;
    Array.prototype.forEach.call(fbOv.querySelectorAll('[data-type]'), function (b) {
      b.setAttribute('aria-checked', String(b.getAttribute('data-type') === t.key));
    });
    fbOv.querySelector('#gfbMsg').placeholder = t.hint;
  }

  function fbSetRating(n) {
    fbState.rating = n;
    Array.prototype.forEach.call(fbOv.querySelectorAll('[data-rate]'), function (b) {
      var v = Number(b.getAttribute('data-rate'));
      b.classList.toggle('on', v <= n);
      b.setAttribute('aria-checked', String(v === n));
    });
  }

  function fbShowError(text) {
    var el = document.getElementById('gfbErr');
    el.textContent = text;
    el.hidden = !text;
  }

  function fbSetSending(on) {
    fbState.sending = on;
    var btn = document.getElementById('gfbSend');
    btn.disabled = on;
    btn.textContent = on ? 'Sending\u2026' : 'Send feedback';
  }

  function fbShowDone(title, text, reference) {
    document.getElementById('gfbForm').hidden = true;
    document.getElementById('gfbDoneTitle').textContent = title;
    document.getElementById('gfbDoneText').textContent = text;
    var ref = document.getElementById('gfbRef');
    ref.hidden = !reference;
    ref.textContent = reference ? 'Reference: ' + reference : '';
    document.getElementById('gfbDone').hidden = false;
    var done = fbOv.querySelector('#gfbDone [data-close]');
    if (done) done.focus();
  }

  function fbSubmit() {
    if (fbState.sending) return;

    var message = document.getElementById('gfbMsg').value.trim();
    if (message.length < FB.MIN) {
      fbShowError('Please write at least ' + FB.MIN + ' characters so we can understand your feedback.');
      document.getElementById('gfbMsg').focus();
      return;
    }

    var last = Number(fbStore(FB.LAST) || 0);
    if (Date.now() - last < FB.COOLDOWN_MS) {
      fbShowError('Please wait a few seconds before sending another message.');
      return;
    }

    fbShowError('');
    fbSetSending(true);
    var payload = fbPayload(message);

    fbSend(payload).then(function (res) {
      fbSetSending(false);

      if (res.ok) {
        fbStore(FB.LAST, String(Date.now()));
        fbStore(FB.DRAFT, null);
        fbShowDone('Thank you!', 'Your feedback has been sent to the GLIME team.', res.reference);
        return;
      }

      if (res.queue) {
        fbQueue(payload);
        fbStore(FB.LAST, String(Date.now()));
        fbStore(FB.DRAFT, null);
        fbShowDone('Saved on this device', res.error + ' Your feedback is saved and will be sent automatically the next time you open GLIME.', null);
        return;
      }

      fbShowError(res.error || 'Feedback could not be sent. Please try again.');
    });
  }

  function fbOpen(opts) {
    opts = opts || {};
    fbBuild();
    fbLastFocus = document.activeElement;

    document.getElementById('gfbForm').hidden = false;
    document.getElementById('gfbDone').hidden = true;
    fbShowError('');
    fbSetSending(false);

    var ta = document.getElementById('gfbMsg');
    ta.value = fbStore(FB.DRAFT) || '';
    document.getElementById('gfbCount').textContent = ta.value.length + ' / ' + FB.MAX;
    document.getElementById('gfbAbout').textContent = fbPageName() ? 'About: ' + fbPageName() : '';

    fbSetType(opts.type || 'idea');
    fbSetRating(0);

    fbOv.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () { fbOv.classList.add('in'); });
    setTimeout(function () { try { ta.focus(); } catch (e) { /* ignore */ } }, 60);
  }

  function fbClose() {
    if (!fbOv || fbOv.hidden) return;
    fbOv.classList.remove('in');
    document.body.style.overflow = '';
    setTimeout(function () {
      fbOv.hidden = true;
      try { if (fbLastFocus && fbLastFocus.focus) fbLastFocus.focus(); } catch (e) { /* ignore */ }
    }, 150);
  }

  function initFeedback() {
    var link = document.getElementById('gasFeedbackLink');
    if (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        fbOpen();
      });
    }
    if (location.hash === '#feedback') fbOpen();
    setTimeout(fbFlushPending, 5000);
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
    loadPhotoSystem();
    loadPushSystem();
    loadExportSystem();
    loadPwaSystem();
    loadThemeSystem();
    initFeedback();
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

  /* Other pages can open the form, for example: GlimeFeedback.open({ type: 'bug' }) */
  window.GlimeFeedback = {
    open: function (opts) { fbOpen(opts); },
    close: fbClose
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
