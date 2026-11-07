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

   Navigation only, with TWO exceptions:
   1. the in-app Feedback form (see the FEEDBACK section). It sends
      through a single RPC, client_submit_feedback; the contract is in
      FEEDBACK_BACKEND_SPEC.md.
   2. the live number badges next to Leads, Customers and Orders, and the
      green "connected" dot next to the Instagram and WhatsApp specialists.
      They are READ-ONLY (row counts, and the channel status from
      client_channel_connections) for the signed-in client; RLS already
      limits every table to the client's own rows.
   Authentication is never handled here; each page keeps its own
   session handling.
   The owner photo in the account card comes from the shared photo
   system (glime-avatar.js), which this shell loads once per page.
   The agent photos, robot squad and the Services / Calendar number
   badges come from glime-agent-nav-addon.js, loaded below.
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
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    chevron: '<path d="M15 6l-6 6 6 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    rocket: '<path d="M12 3c3.2 2.1 5 5.2 5 9l-2.4 3.2H9.4L7 12c0-3.8 1.8-6.9 5-9z"/><circle cx="12" cy="10" r="1.7"/><path d="M9.2 15.2 6.5 18.6M14.8 15.2l2.7 3.4M12 17.2V21"/>'
  };

  function icon(name, size) {
    var s = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' +
      (PATHS[name] || '') + '</svg>';
  }

  /* Instagram and WhatsApp use their real brand look (brand colours + glyph).
     The AI Assistant uses the Anaya avatar from glime-library/.
     Every other icon is a line icon painted with the GLIME green-to-cyan gradient. */
  var BRAND = {
    instagram:
      '<rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" fill="none" stroke="#fff" stroke-width="1.9"/>' +
      '<circle cx="12" cy="12" r="4.1" fill="none" stroke="#fff" stroke-width="1.9"/>' +
      '<circle cx="17.2" cy="6.8" r="1.2" fill="#fff" stroke="none"/>',
    whatsapp:
      '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z" fill="none" stroke="#fff" stroke-width="1.9" stroke-linejoin="round"/>' +
      '<path transform="translate(6.3 5.9) scale(.48)" fill="#fff" stroke="none" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>'
  };

  var ANAYA_SRC = 'glime-library/anaya-avatar-primary.webp';

  function iconTile(name) {
    if (name === 'assistant') {
      return '<span class="gas-ico gas-ico-anaya" aria-hidden="true">' +
        '<img class="gas-anaya" src="' + ANAYA_SRC + '" alt="" width="36" height="36" decoding="async"></span>';
    }
    var brand = BRAND[name];
    return '<span class="gas-ico' + (brand ? ' gas-ico-brand gas-ico-' + name : '') + '" aria-hidden="true">' +
      (brand
        ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' + brand + '</svg>'
        : icon(name, 22)) +
      '</span>';
  }

  var GAS_CSS = [
    /* palette: dark (default) and light */
    '.gas-sidebar{--s-g1:#00ff88;--s-g2:#00f0ff;--s-text:#eaf3f8;--s-muted:#9fb0bf;--s-line:rgba(255,255,255,.09);--s-glass:rgba(255,255,255,.055)}',
    'html[data-theme="light"] .gas-sidebar{--s-g1:#00b86e;--s-g2:#0098c8;--s-text:#0b1a24;--s-muted:#4b5b68;--s-line:#e2e8ee;--s-glass:rgba(0,0,0,.045)}',

    /* surface: soft GLIME glow on a deep background */
    'html body.gas-body .gas-sidebar{background:radial-gradient(130% 55% at 100% 0%,rgba(0,240,255,.17),transparent 58%),radial-gradient(100% 45% at 0% 100%,rgba(0,255,136,.13),transparent 60%),linear-gradient(180deg,#07121b,#050a10) !important;border-right:1px solid var(--s-line) !important}',
    'html[data-theme="light"] body.gas-body .gas-sidebar{background:radial-gradient(130% 50% at 100% 0%,rgba(0,184,220,.11),transparent 58%),radial-gradient(100% 40% at 0% 100%,rgba(0,200,120,.10),transparent 60%),linear-gradient(180deg,#ffffff,#f3fbf8) !important}',

    /* header */
    '.gas-sidebar .gas-brand small{font-size:.8rem;letter-spacing:.01em;text-transform:none;font-weight:600;line-height:1.3;color:var(--s-muted)}',
    '.gas-sidebar .gas-brand img{filter:drop-shadow(0 0 10px rgba(0,255,136,.35))}',

    /* group titles */
    '.gas-sidebar .gas-group-title{display:flex;align-items:center;gap:8px;padding:6px 12px 8px;font-size:.7rem;letter-spacing:.14em;color:var(--s-muted);opacity:1}',
    '.gas-sidebar .gas-group-title::after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--s-line),transparent)}',
    '.gas-sidebar .gas-gt-ico{display:inline-grid;color:var(--s-g2)}',
    '.gas-sidebar .gas-gt-ico svg{width:16px;height:16px;display:block}',

    /* links */
    '.gas-sidebar .gas-link{gap:12px;min-height:46px;padding:5px 12px;margin-bottom:3px;border-radius:14px;color:var(--s-text);font-size:.92rem;transition:background .22s ease,box-shadow .22s ease}',
    '.gas-sidebar .gas-link .gas-label{flex:1 1 auto;min-width:0;transition:transform .22s ease}',
    '.gas-sidebar .gas-link:hover .gas-label{transform:translateX(2px)}',
    'html body.gas-body .gas-sidebar .gas-link:hover{background:var(--s-glass) !important;color:var(--s-text)}',
    'html body.gas-body .gas-sidebar .gas-link[aria-current="page"]{color:var(--s-text) !important;background:linear-gradient(100deg,rgba(0,255,136,.18),rgba(0,240,255,.12)) !important;box-shadow:0 0 0 1px rgba(0,255,136,.5),0 10px 26px -12px rgba(0,255,136,.6) !important}',
    'html body.gas-body .gas-sidebar .gas-link[aria-current="page"]::before{display:none !important}',
    '.gas-sidebar .gas-link[aria-current="page"]:not(.gas-has-badge)::after{content:"";flex:0 0 auto;width:18px;height:18px;margin-right:2px;border-radius:2px;background:linear-gradient(var(--s-g2),var(--s-g2)) 0 100%/4px 40% no-repeat,linear-gradient(var(--s-g2),var(--s-g2)) 7px 100%/4px 70% no-repeat,linear-gradient(var(--s-g1),var(--s-g1)) 14px 100%/4px 100% no-repeat}',

    /* icons */
    '.gas-sidebar .gas-ico{position:relative;flex:0 0 auto;width:36px;height:36px;display:inline-grid;place-items:center;border-radius:11px;isolation:isolate;transition:transform .28s cubic-bezier(.34,1.56,.64,1),filter .25s ease}',
    '.gas-sidebar .gas-ico svg{width:22px;height:22px;display:block;stroke:url(#gasGrad);stroke-width:1.7}',
    '.gas-sidebar .gas-link:hover .gas-ico,.gas-sidebar .gas-logout:hover .gas-ico{transform:scale(1.1) rotate(-4deg);filter:drop-shadow(0 0 7px rgba(0,255,136,.55))}',
    '.gas-sidebar .gas-link[aria-current="page"] .gas-ico{filter:drop-shadow(0 0 8px rgba(0,255,136,.6))}',

    /* brand tiles (Instagram, WhatsApp) */
    '.gas-sidebar .gas-ico-brand{box-shadow:0 4px 12px -5px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.3)}',
    '.gas-sidebar .gas-ico-brand::before{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1}',
    '.gas-sidebar .gas-ico-brand svg{width:20px;height:20px;stroke-width:1.9}',
    '.gas-sidebar .gas-ico-instagram::before{background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285aeb 90%)}',
    '.gas-sidebar .gas-ico-whatsapp::before{background:linear-gradient(145deg,#3ee67d 0%,#25d366 45%,#128c7e 100%)}',
    '.gas-sidebar .gas-link:hover .gas-ico-brand{filter:none;box-shadow:0 8px 18px -6px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.35)}',

    /* Anaya avatar (AI Assistant) */
    '.gas-sidebar .gas-ico-anaya{border-radius:50%;padding:2px;background:linear-gradient(135deg,var(--s-g1),var(--s-g2));box-shadow:0 0 14px -2px rgba(0,255,136,.5)}',
    '.gas-sidebar .gas-ico-anaya img{width:100%;height:100%;display:block;border-radius:50%;object-fit:cover;background:#0a141c;animation:gasFloat 3.2s ease-in-out infinite}',

    /* live number badges + AI pill */
    '.gas-sidebar .gas-badge{flex:0 0 auto;min-width:30px;height:26px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;border-radius:999px;font-size:.78rem;font-weight:800;color:var(--s-text);background:rgba(0,255,136,.14);border:1px solid rgba(0,255,136,.38);font-variant-numeric:tabular-nums}',
    '.gas-sidebar .gas-badge[hidden]{display:none}',
    '.gas-sidebar .gas-badge[data-gas-count="customers"]{background:rgba(0,240,255,.13);border-color:rgba(0,240,255,.38)}',
    '.gas-sidebar .gas-badge[data-gas-count="orders"]{background:linear-gradient(100deg,rgba(0,255,136,.14),rgba(0,240,255,.14))}',
    '.gas-sidebar .gas-pill{flex:0 0 auto;padding:3px 10px;border-radius:999px;font-size:.7rem;font-weight:800;letter-spacing:.04em;color:#04110a;background:linear-gradient(105deg,var(--s-g1),var(--s-g2))}',

    /* footer */
    '.gas-sidebar .gas-account{padding:10px 12px;border-radius:16px;border:1px solid var(--s-line);background:var(--s-glass) !important}',
    'html body.gas-body .gas-sidebar .gas-logout{min-height:48px;border-radius:14px;background:linear-gradient(100deg,rgba(255,71,87,.20),rgba(255,71,87,.08)) !important;border:1px solid rgba(255,71,87,.35) !important}',
    '.gas-sidebar .gas-logout .gas-label{flex:1 1 auto;text-align:left}',
    '.gas-sidebar .gas-logout .gas-ico{border-radius:50%;background:rgba(255,71,87,.18)}',
    '.gas-sidebar .gas-logout .gas-ico svg{stroke:#ff6b78}',
    'html[data-theme="light"] .gas-sidebar .gas-logout .gas-ico svg{stroke:#c62828}',
    '.gas-sidebar .gas-shield{flex:0 0 auto;display:inline-grid;color:var(--s-muted)}',
    '.gas-sidebar .gas-shield svg{width:20px;height:20px;display:block}',

    /* connected dot (Instagram / WhatsApp): shown only when the channel is really connected */
    '.gas-sidebar .gas-dot{flex:0 0 auto;position:relative;width:10px;height:10px;margin:0 8px 0 2px;border-radius:50%;background:#19e68c;box-shadow:0 0 0 3px rgba(25,230,140,.18),0 0 10px rgba(25,230,140,.8)}',
    '.gas-sidebar .gas-dot[hidden]{display:none}',
    '.gas-sidebar .gas-dot::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:2px solid #19e68c;opacity:0;animation:gasPing 2.2s ease-out infinite}',

    /* Voice AI waveform */
    '.gas-sidebar .gas-wave{flex:0 0 auto;display:inline-flex;align-items:center;gap:2px;height:22px;margin-right:2px}',
    '.gas-sidebar .gas-wave i{display:block;width:3px;height:100%;border-radius:3px;background:linear-gradient(180deg,var(--s-g2),var(--s-g1));transform:scaleY(.3);transform-origin:center;animation:gasWave 1.15s ease-in-out infinite}',
    '.gas-sidebar .gas-wave i:nth-child(1){animation-delay:-1.1s}.gas-sidebar .gas-wave i:nth-child(2){animation-delay:-.95s}.gas-sidebar .gas-wave i:nth-child(3){animation-delay:-.8s}.gas-sidebar .gas-wave i:nth-child(4){animation-delay:-.65s}.gas-sidebar .gas-wave i:nth-child(5){animation-delay:-.5s}.gas-sidebar .gas-wave i:nth-child(6){animation-delay:-.38s}.gas-sidebar .gas-wave i:nth-child(7){animation-delay:-.26s}.gas-sidebar .gas-wave i:nth-child(8){animation-delay:-.15s}.gas-sidebar .gas-wave i:nth-child(9){animation-delay:-.05s}',

    /* Billing crown */
    '.gas-sidebar .gas-crown{position:relative;flex:0 0 auto;width:30px;height:30px;display:inline-grid;place-items:center;border-radius:50%;overflow:hidden;background:radial-gradient(circle at 30% 25%,rgba(255,226,122,.35),rgba(245,163,0,.16));border:1px solid rgba(245,163,0,.55);box-shadow:0 0 12px -2px rgba(245,163,0,.55)}',
    '.gas-sidebar .gas-crown svg{display:block;animation:gasCrown 2.6s ease-in-out infinite}',
    '.gas-sidebar .gas-crown::after{content:"";position:absolute;top:-30%;bottom:-30%;left:-60%;width:40%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.7),transparent);transform:rotate(20deg);animation:gasShine 3.6s ease-in-out infinite}',

    /* GLIME AI chip */
    '.gas-sidebar .gas-chip{display:block;width:100%;max-width:200px;margin:10px auto 4px;pointer-events:none;user-select:none}',
    '.gas-sidebar .gas-chip svg{display:block;width:100%;height:auto;overflow:visible}',
    '.gas-sidebar .gas-chip-float{animation:gasChip 4.2s ease-in-out infinite}',
    '.gas-sidebar .gas-chip-shine{animation:gasShineChip 3.8s ease-in-out infinite}',
    '.gas-sidebar .gas-chip-pins{animation:gasPins 2.4s ease-in-out infinite}',
    '.gas-sidebar .gas-chip-glow{transform-box:fill-box;transform-origin:center;animation:gasGlow 4.2s ease-in-out infinite}',
    'html[data-theme="light"] .gas-sidebar .gas-chip{filter:drop-shadow(0 10px 14px rgba(0,152,200,.25))}',

    /* avatar: bigger ring, sharper photo, smaller camera badge */
    'html body.gas-body .gas-sidebar .gas-avatar{width:46px !important;height:46px !important;flex:0 0 46px !important;border-radius:50% !important;border:2px solid transparent !important;background-origin:border-box !important;background-clip:padding-box,border-box !important;box-shadow:0 0 0 2px rgba(0,255,136,.45),0 6px 16px -6px rgba(0,255,136,.6);font-size:1.05rem;image-rendering:auto;-webkit-backface-visibility:hidden;backface-visibility:hidden}',
    'html body.gas-body .gas-sidebar .gas-avatar.gp-img{border-color:rgba(255,255,255,.9) !important}',
    'html[data-theme="light"] body.gas-body .gas-sidebar .gas-avatar.gp-img{border-color:#fff !important}',
    '.gas-sidebar .gas-avatar.gp-edit::after{width:18px !important;height:18px !important;min-width:0 !important;min-height:0 !important;max-width:none !important;max-height:none !important;right:-4px !important;bottom:-4px !important;border-width:2px !important}',
    '.gas-sidebar .gas-account{gap:12px}',
    '.gas-sidebar .gas-acc-name{font-size:.88rem}',

    /* collapsed desktop rail */
    'body.gas-collapsed .gas-sidebar .gas-chip,body.gas-collapsed .gas-sidebar .gas-dot,body.gas-collapsed .gas-sidebar .gas-wave,body.gas-collapsed .gas-sidebar .gas-crown{display:none}',
    'body.gas-collapsed .gas-sidebar .gas-badge,body.gas-collapsed .gas-sidebar .gas-pill,body.gas-collapsed .gas-sidebar .gas-shield{display:none}',
    'body.gas-collapsed .gas-sidebar .gas-avatar{width:40px !important;height:40px !important;flex-basis:40px !important}',
    'body.gas-collapsed .gas-sidebar .gas-link::after{display:none}',

    /* Launchpad (client onboarding): gold, so it stands out at the top */
    '.gas-sidebar .gas-link.gas-gold{background:linear-gradient(100deg,rgba(255,200,61,.14),rgba(245,163,0,.05));box-shadow:inset 0 0 0 1px rgba(245,163,0,.4)}',
    '.gas-sidebar .gas-link.gas-gold .gas-label{color:#ffd978;font-weight:800;letter-spacing:.01em}',
    '.gas-sidebar .gas-link.gas-gold .gas-ico svg{stroke:#f5b82e;stroke-width:1.8}',
    '.gas-sidebar .gas-link.gas-gold .gas-pill{background:linear-gradient(105deg,#ffe27a,#f5a300);color:#2a1a00}',
    'html body.gas-body .gas-sidebar .gas-link.gas-gold:hover{background:linear-gradient(100deg,rgba(255,200,61,.26),rgba(245,163,0,.11)) !important}',
    '.gas-sidebar .gas-link.gas-gold:hover .gas-ico{filter:drop-shadow(0 0 7px rgba(245,163,0,.65))}',
    'html body.gas-body .gas-sidebar .gas-link.gas-gold[aria-current="page"]{background:linear-gradient(100deg,rgba(255,200,61,.28),rgba(245,163,0,.13)) !important;box-shadow:0 0 0 1px rgba(245,163,0,.75),0 10px 26px -12px rgba(245,163,0,.65) !important}',
    '.gas-sidebar .gas-link.gas-gold[aria-current="page"]:not(.gas-has-badge)::after{display:none}',
    'html[data-theme="light"] .gas-sidebar .gas-link.gas-gold .gas-label{color:#8a5a00 !important}',
    'html[data-theme="light"] .gas-sidebar .gas-link.gas-gold .gas-ico svg{stroke:#c98a00}',
    'html[data-theme="light"] .gas-sidebar .gas-link.gas-gold{background:linear-gradient(100deg,rgba(255,200,61,.22),rgba(245,163,0,.08));box-shadow:inset 0 0 0 1px rgba(201,138,0,.45)}',

    /* motion */
    '@keyframes gasIn{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:none}}',
    '@keyframes gasFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}',
    '@keyframes gasPing{0%{transform:scale(.8);opacity:.7}70%,100%{transform:scale(1.7);opacity:0}}',
    '@keyframes gasWave{0%,100%{transform:scaleY(.25)}50%{transform:scaleY(1)}}',
    '@keyframes gasCrown{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-1.5px) rotate(-5deg)}}',
    '@keyframes gasShine{0%,55%{left:-60%}100%{left:140%}}',
    '@keyframes gasChip{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}',
    '@keyframes gasShineChip{0%,45%{transform:translateX(0) rotate(18deg)}100%{transform:translateX(150px) rotate(18deg)}}',
    '@keyframes gasPins{0%,100%{opacity:.55}50%{opacity:1}}',
    '@keyframes gasGlow{0%,100%{opacity:.55;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}',
    '@media(min-width:901px){.gas-sidebar .gas-link{animation:gasIn .45s cubic-bezier(.22,1,.36,1) backwards;animation-delay:calc(var(--i,0)*35ms)}}',
    '@media(max-width:900px){.gas-open .gas-sidebar .gas-link{animation:gasIn .4s cubic-bezier(.22,1,.36,1) backwards;animation-delay:calc(var(--i,0)*30ms + 80ms)}}',

    /* mobile drawer: theme + download side by side */
    '@media(max-width:900px){.gas-sidebar .gas-sb-foot{display:grid;grid-template-columns:1fr 1fr;gap:8px}.gas-sidebar .gas-sb-foot>.gas-account,.gas-sidebar .gas-sb-foot>.gas-logout{grid-column:1/-1}.gas-sidebar .gas-sb-foot .gtheme-row,.gas-sidebar .gas-sb-foot .gas-download{margin:0;min-width:0;padding:8px 10px;gap:8px;font-size:.76rem;justify-content:center;border-radius:14px}}',

    '@media(prefers-reduced-motion:reduce){.gas-sidebar .gas-link,.gas-sidebar .gas-ico,.gas-sidebar .gas-ico img,.gas-sidebar .gas-label,.gas-sidebar .gas-wave i,.gas-sidebar .gas-crown svg,.gas-sidebar .gas-crown::after,.gas-sidebar .gas-chip-float,.gas-sidebar .gas-chip-glow,.gas-sidebar .gas-chip-shine,.gas-sidebar .gas-chip-pins,.gas-sidebar .gas-dot::after{animation:none!important;transition:none!important}.gas-sidebar .gas-wave i{transform:scaleY(.65)}}'
  ].join('');

  function gasEnsureStyle() {
    if (document.getElementById('gasPremiumStyle')) return;
    var s = document.createElement('style');
    s.id = 'gasPremiumStyle';
    s.textContent = GAS_CSS;
    document.head.appendChild(s);
  }

  /* Hidden SVG defs: the GLIME green-to-cyan gradient used to paint line icons. */
  var GAS_DEFS =
    '<svg class="gas-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">' +
    '<defs><linearGradient id="gasGrad" gradientUnits="userSpaceOnUse" x1="2" y1="22" x2="22" y2="2">' +
    '<stop offset="0" style="stop-color:var(--s-g1)"/><stop offset="1" style="stop-color:var(--s-g2)"/>' +
    '</linearGradient>' +
    '<linearGradient id="gasGold" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f5a300"/>' +
    '</linearGradient></defs></svg>';

  /* Small live details: animated waveform (Voice AI), gold crown (Billing). */
  var GAS_WAVE = '<span class="gas-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
  var GAS_CROWN =
    '<span class="gas-crown" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" focusable="false">' +
    '<path d="M3 8l4.6 4.2L12 5l4.4 7.2L21 8l-1.8 10H4.8z" fill="url(#gasGold)" stroke="#a86a00" stroke-width="1" stroke-linejoin="round"/>' +
    '<path d="M5.2 20.4h13.6" stroke="#ffc83d" stroke-width="1.7" stroke-linecap="round" fill="none"/></svg></span>';

  /* GLIME AI chip: isometric chip drawn in GLIME green/cyan with pins, circuit lines and a moving shine; floats and glows. */
  var GAS_CHIP =
    '<div class="gas-chip" aria-hidden="true"><svg viewBox="0 0 240 150" focusable="false">' +
    '<defs>' +
    '<linearGradient id="gcTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#173a57"/><stop offset=".55" stop-color="#0b2236"/><stop offset="1" stop-color="#06131f"/></linearGradient>' +
    '<linearGradient id="gcEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00ff88"/><stop offset="1" stop-color="#00f0ff"/></linearGradient>' +
    '<linearGradient id="gcSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a2a3a"/><stop offset="1" stop-color="#03090f"/></linearGradient>' +
    '<linearGradient id="gcShine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="gcGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#00ff88" stop-opacity=".6"/><stop offset=".55" stop-color="#00f0ff" stop-opacity=".18"/><stop offset="1" stop-color="#00f0ff" stop-opacity="0"/></radialGradient>' +
    '<clipPath id="gcClip"><rect x="-38" y="-38" width="76" height="76" rx="12"/></clipPath>' +
    '</defs>' +
    '<ellipse class="gas-chip-glow" cx="120" cy="112" rx="96" ry="26" fill="url(#gcGlow)"/>' +
    '<ellipse cx="120" cy="116" rx="70" ry="15" fill="none" stroke="url(#gcEdge)" stroke-width="1.2" opacity=".5"/>' +
    '<ellipse cx="120" cy="116" rx="92" ry="21" fill="none" stroke="#00f0ff" stroke-width="1" stroke-dasharray="3 7" opacity=".4"/>' +
    '<g class="gas-chip-float">' +
    '<g transform="translate(120 96) matrix(.866 .5 -.866 .5 0 0)"><rect x="-41" y="-41" width="82" height="82" rx="14" fill="url(#gcSide)" stroke="url(#gcEdge)" stroke-width="1.6" opacity=".95"/></g>' +
    '<g transform="translate(120 82) matrix(.866 .5 -.866 .5 0 0)">' +
    '<g class="gas-chip-pins" stroke="#00f0ff" stroke-width="3" stroke-linecap="round">' +
    '<path d="M-26 -42v-9M-13 -42v-9M0 -42v-9M13 -42v-9M26 -42v-9"/>' +
    '<path d="M-26 42v9M-13 42v9M0 42v9M13 42v9M26 42v9"/>' +
    '<path d="M-42 -26h-9M-42 -13h-9M-42 0h-9M-42 13h-9M-42 26h-9"/>' +
    '<path d="M42 -26h9M42 -13h9M42 0h9M42 13h9M42 26h9"/>' +
    '</g>' +
    '<rect x="-38" y="-38" width="76" height="76" rx="12" fill="url(#gcTop)" stroke="url(#gcEdge)" stroke-width="2.4"/>' +
    '<g clip-path="url(#gcClip)">' +
    '<g class="gas-chip-circuit" fill="none" stroke="url(#gcEdge)" stroke-width="1.1" opacity=".6">' +
    '<path d="M-38 -22h14l6 6h12M38 22H24l-6-6h-10M-38 22h10l8-8M38 -22h-10l-8 8"/>' +
    '<circle cx="-12" cy="-16" r="1.6" fill="#00ff88" stroke="none"/><circle cx="-8" cy="16" r="1.6" fill="#00f0ff" stroke="none"/><circle cx="12" cy="16" r="1.6" fill="#00ff88" stroke="none"/><circle cx="8" cy="-16" r="1.6" fill="#00f0ff" stroke="none"/>' +
    '</g>' +
    '<rect class="gas-chip-shine" x="-70" y="-60" width="26" height="130" fill="url(#gcShine)" transform="rotate(18)"/>' +
    '</g>' +
    '<rect x="-27" y="-27" width="54" height="54" rx="9" fill="rgba(0,10,18,.55)" stroke="url(#gcEdge)" stroke-width="1" opacity=".9"/>' +
    '<text x="0" y="6" text-anchor="middle" font-family="Poppins,Manrope,Arial,sans-serif" font-size="25" font-weight="800" letter-spacing="1" fill="url(#gcEdge)">AI</text>' +
    '<text x="0" y="19" text-anchor="middle" font-family="Poppins,Manrope,Arial,sans-serif" font-size="6.4" font-weight="700" letter-spacing="2.4" fill="#9fe9ff">GLIME</text>' +
    '</g></g></svg></div>';

  /* Every href below is an existing page in the repository. */
  var MENU = [
    {
      title: 'Start here',
      icon: 'rocket',
      items: [
        { label: 'Launchpad', href: 'client-onboarding.html', icon: 'rocket', pill: 'SETUP', gold: true }
      ]
    },
    {
      title: 'Workspace',
      items: [
        { label: 'Overview', href: 'dashboard.html', icon: 'home' },
        { label: 'Leads', href: 'leads.html', icon: 'leads', badge: 'leads' },
        { label: 'Customers', href: 'customer.html', icon: 'customers', badge: 'customers' },
        { label: 'Orders', href: 'orders.html', icon: 'orders', badge: 'orders' },
        { label: 'Services', href: 'services.html', icon: 'services' }
      ]
    },
    {
      title: 'AI &amp; Intelligence',
      icon: 'bolt',
      items: [
        { label: 'AI Assistant', href: 'client-assistant.html', icon: 'assistant', pill: 'AI' },
        { label: 'Business Growth Intelligence', href: 'glime-intelligence-center.html', icon: 'chart' },
        { label: 'Instagram Sales Specialist', href: 'instagram-sales-specialist.html', icon: 'instagram', status: 'instagram' },
        { label: 'WhatsApp Sales Specialist', href: 'whatsapp-sales-specialist.html', icon: 'whatsapp', status: 'whatsapp' },
        { label: 'Follow-up', href: 'follow-up.html', icon: 'followup' },
        { label: 'Voice AI', href: 'voice-ai.html', icon: 'mic', extra: 'wave' }
      ]
    },
    {
      title: 'Manage',
      icon: 'sliders',
      items: [
        { label: 'Connector', href: 'ai-connections.html', icon: 'link' },
        { label: 'Billing &amp; Plans', href: 'billing.html', icon: 'card', extra: 'crown' },
        { label: 'Packages', href: 'packages.html', icon: 'box' },
        { label: 'Settings', href: 'settings.html', icon: 'sliders' },
        { label: 'Feedback', href: 'feedback.html', icon: 'feedback', id: 'gasFeedbackLink' }
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

  function linkHtml(item, page, index) {
    var current = item.href.toLowerCase() === page;
    return '<a class="gas-link' + (item.gold ? ' gas-gold' : '') + '"' +
      (item.id ? ' id="' + item.id + '"' : '') +
      ' href="' + item.href + '"' +
      ' style="--i:' + index + '"' +
      (current ? ' aria-current="page"' : '') +
      (item.external ? ' target="_blank" rel="noopener noreferrer"' : '') +
      ' data-label="' + item.label + '">' +
      iconTile(item.icon) +
      '<span class="gas-label">' + item.label + '</span>' +
      (item.badge ? '<span class="gas-badge" data-gas-count="' + item.badge + '" hidden></span>' : '') +
      (item.pill ? '<span class="gas-pill">' + item.pill + '</span>' : '') +
      (item.status ? '<span class="gas-dot" data-gas-status="' + item.status + '" hidden></span>' : '') +
      (item.extra === 'wave' ? GAS_WAVE : '') +
      (item.extra === 'crown' ? GAS_CROWN : '') +
      '</a>';
  }

  function groupsHtml(page, withSupport) {
    var counter = 0;
    return MENU.map(function (group) {
      var items = group.items.slice();
      if (withSupport && group.title === 'Manage') items.push(SUPPORT_ITEM);
      return '<div class="gas-group"><div class="gas-group-title">' +
        (group.icon ? '<span class="gas-gt-ico">' + icon(group.icon, 16) + '</span>' : '') +
        group.title + '</div>' +
        items.map(function (item) { return linkHtml(item, page, counter++); }).join('') +
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

  /* Agent photos, robot squad and the Services / Calendar number badges.
     Loaded after the theme so its styles win. Bump ?v= when the file changes. */
  function loadAgentNavSystem() {
    if (window.GlimeAgentNav || document.querySelector('script[src*="glime-agent-nav-addon.js"]')) return;
    var s = document.createElement('script');
    s.src = 'glime-agent-nav-addon.js?v=1';
    s.defer = true;
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
      /* Pages that do not expose window.supabaseClient: clear the saved Supabase login so logout is real. */
      try {
        Object.keys(localStorage).forEach(function (k) {
          if (/^sb-.*-auth-token/.test(k)) localStorage.removeItem(k);
        });
      } catch (e) { /* ignore */ }
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
     LIVE COUNTS  (read-only)
     ---------------------------------------------------------
     Number badges for Leads, Customers and Orders. Only row counts
     (select id, count exact, head) for the signed-in client. Shown
     only when the real number is known; hidden otherwise. Cached for
     a minute per browser tab so page changes do not flicker.
  ========================================================= */
  var COUNT_KEY = 'glime_nav_counts';
  var COUNT_TTL = 60000;
  var countsBusy = false;

  function paintCounts(counts) {
    ['leads', 'customers', 'orders'].forEach(function (key) {
      var els = document.querySelectorAll('[data-gas-count="' + key + '"]');
      Array.prototype.forEach.call(els, function (el) {
        var n = counts ? counts[key] : null;
        var ok = typeof n === 'number' && n >= 0;
        if (ok) el.textContent = n > 99999 ? '99,999+' : n.toLocaleString('en-IN');
        el.hidden = !ok;
        if (el.parentNode) el.parentNode.classList.toggle('gas-has-badge', ok);
      });
    });
    /* green dot only while the channel is really connected */
    ['instagram', 'whatsapp'].forEach(function (ch) {
      var dots = document.querySelectorAll('[data-gas-status="' + ch + '"]');
      Array.prototype.forEach.call(dots, function (el) {
        var on = !!(counts && counts[ch] === true);
        el.hidden = !on;
        if (el.parentNode) el.parentNode.classList.toggle('gas-has-badge', on);
      });
    });
  }

  function loadCounts(force) {
    var cached = null;
    try {
      var raw = sessionStorage.getItem(COUNT_KEY);
      if (raw) cached = JSON.parse(raw);
    } catch (e) { cached = null; }
    if (cached && cached.v) paintCounts(cached.v);
    if (!force && cached && Date.now() - cached.t < COUNT_TTL) return;
    if (countsBusy) return;
    countsBusy = true;

    var tries = 0;
    (function attempt() {
      var client = fbClient();
      if (!client) {
        if (++tries < 20) { setTimeout(attempt, 400); return; }
        countsBusy = false;
        return;
      }
      client.auth.getSession().then(function (r) {
        var session = r && r.data && r.data.session;
        if (!session) return null;
        return client.from('client_data').select('client_id').eq('auth_user_id', session.user.id).maybeSingle()
          .then(function (res) {
            var cid = res && res.data && res.data.client_id;
            if (!cid) return null;
            var count = function (table) {
              return client.from(table).select('id', { count: 'exact', head: true }).eq('client_id', cid)
                .then(function (x) {
                  return x && !x.error && typeof x.count === 'number' ? x.count : null;
                }, function () { return null; });
            };
            var channels = client.from('client_channel_connections').select('channel,status,can_send')
              .eq('client_id', cid).in('channel', ['instagram', 'whatsapp'])
              .then(function (x) {
                if (!x || x.error || !Array.isArray(x.data)) return null;
                var on = { instagram: false, whatsapp: false };
                x.data.forEach(function (row) {
                  if (row && row.status === 'connected' && row.can_send !== false && row.channel in on) on[row.channel] = true;
                });
                return on;
              }, function () { return null; });
            return Promise.all([count('leads'), count('customers'), count('orders'), channels]).then(function (a) {
              return {
                leads: a[0], customers: a[1], orders: a[2],
                instagram: a[3] ? a[3].instagram : null,
                whatsapp: a[3] ? a[3].whatsapp : null
              };
            });
          });
      }).then(function (v) {
        if (!v) return;
        paintCounts(v);
        try { sessionStorage.setItem(COUNT_KEY, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* ignore */ }
      }).catch(function () { /* keep whatever is shown */ })
        .then(function () { countsBusy = false; });
    })();
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
    btn.textContent = on ? 'Sending…' : 'Send feedback';
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
    /* Feedback now has its own page (feedback.html). The sidebar link opens it and
       tells it which page the client came from. Unsent feedback saved earlier is
       still sent from here. */
    var link = document.getElementById('gasFeedbackLink');
    if (link) {
      link.addEventListener('click', function (e) {
        if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        e.preventDefault();
        var from = '';
        if (currentPage() !== 'feedback.html') from = fbPageName();
        location.href = 'feedback.html' + (from ? '?from=' + encodeURIComponent(from) : '');
      });
    }
    if (location.hash === '#feedback') location.replace('feedback.html');
    setTimeout(fbFlushPending, 5000);
  }

  function init() {
    if (document.getElementById('gasSidebar')) return;
    var content = document.querySelector('[data-gas-content]');
    if (!content || !content.parentNode) return;

    gasEnsureStyle();

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
      GAS_DEFS +
      '<div class="gas-sb-head">' +
        '<a class="gas-brand" href="dashboard.html" aria-label="GLIME overview">' +
          '<img src="glime_logo_clean.svg" alt="GLIME">' +
          '<small class="gas-label">AI Business<br>Workspace</small>' +
        '</a>' +
        '<button type="button" class="gas-icon-btn gas-collapse-btn" id="gasCollapse" ' +
          'aria-label="Collapse sidebar" aria-pressed="false">' + icon('chevron', 18) + '</button>' +
        '<button type="button" class="gas-icon-btn gas-close" id="gasClose" ' +
          'aria-label="Close navigation menu">' + icon('close', 18) + '</button>' +
      '</div>' +
      '<nav class="gas-nav" aria-label="GLIME sections">' + groupsHtml(page, withSupport) + GAS_CHIP + '</nav>' +
      '<div class="gas-sb-foot">' +
        '<div class="gas-account" id="gasAccount" hidden>' +
          '<span class="gas-avatar" id="gasAvatar" aria-hidden="true">G</span>' +
          '<span class="gas-acc-text"><span class="gas-acc-name" id="gasAccName"></span>' +
          '<span class="gas-acc-id" id="gasAccId"></span></span>' +
        '</div>' +
        '<button type="button" class="gas-logout" id="gasLogout">' + iconTile('logout') +
          '<span class="gas-label">Secure Logout</span>' +
          '<span class="gas-shield" aria-hidden="true">' + icon('shield', 20) + '</span></button>' +
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

    /* If the Anaya picture cannot load, fall back to the sparkle line icon. */
    Array.prototype.forEach.call(sidebar.querySelectorAll('img.gas-anaya'), function (img) {
      img.addEventListener('error', function () {
        var holder = img.parentNode;
        if (!holder) return;
        holder.classList.remove('gas-ico-anaya');
        holder.innerHTML = icon('assistant', 22);
      });
    });

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
    loadAgentNavSystem();
    initFeedback();

    /* Real numbers next to Leads, Customers, Orders: now, then every 90 s while the tab is visible. */
    loadCounts(false);
    setInterval(function () { if (!document.hidden) loadCounts(true); }, 90000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) loadCounts(false);
    });
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
