/* =========================================================
   GLIME AGENT NAV ADDON
   ---------------------------------------------------------
   Loaded by glime-app-shell.js. Works on top of the sidebar the shell
   builds and never changes the shell's own behaviour.

   1. Agent photos (from glime-library/) with a deep-tech look:
      rotating gradient ring, scan line, small agent tag, and the
      Instagram / WhatsApp brand badge on the photo.
   2. "LIVE" pill instead of the plain green dot (the shell still
      decides when it is shown: only when the channel is connected).
   3. Live number badges, read-only, for the signed-in client:
        Services = offers with status 'active'  (draft count in tooltip)
        Calendar = upcoming, not cancelled rows of gcal_bookings
   4. Five tiny robot agents next to the "AI & Intelligence" title.
      They blink, bob, and pass little chat bubbles and a data pulse
      to each other, as if the agents are talking. Decoration only.
   If a photo cannot load, the original line icon comes back.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeAgentNav) return;
  window.GlimeAgentNav = true;

  var SB_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var SB_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var LIB = 'glime-library/';
  var CACHE_KEY = 'glime_nav_gna';
  var CACHE_TTL = 60000;

  var AGENTS = {
    'client-assistant.html': { img: 'anaya-avatar-primary.webp', tag: 'Assistant agent' },
    'glime-intelligence-center.html': { img: 'glime-business-growth-intelligence-1.webp', tag: 'Analytics agent' },
    'instagram-sales-specialist.html': { img: 'glime-instagram-sales-specialist-1.webp', tag: 'Sales agent', brand: 'instagram' },
    'whatsapp-sales-specialist.html': { img: 'glime-whatsapp-sales-specialist-1.webp', tag: 'Sales agent', brand: 'whatsapp' },
    'follow-up.html': { img: 'glime-follow-up-specialist-1.webp', tag: 'Follow-up agent' }
  };

  var BRAND = {
    instagram:
      '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" focusable="false">' +
      '<rect x="4" y="4" width="16" height="16" rx="4.6" fill="none" stroke="#fff" stroke-width="2.2"/>' +
      '<circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff" stroke-width="2.2"/>' +
      '<circle cx="17" cy="7" r="1.2" fill="#fff"/></svg>',
    whatsapp:
      '<svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" focusable="false">' +
      '<path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<path d="M9.5 9.5c.4 2.2 2.3 4.1 4.6 4.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>'
  };

  var MONO = 'ui-monospace,SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace';

  var CSS = [
    '.gas-sidebar{--gna-bg:#07121b}',
    'html[data-theme="light"] .gas-sidebar{--gna-bg:#ffffff}',

    /* agent photo tile */
    'html body.gas-body .gas-sidebar .gna-ico{width:42px;height:42px;border-radius:50%;background:none !important;box-shadow:none !important;filter:none}',
    '.gas-sidebar .gna-ico::before{display:none !important}',
    '.gna-agent{position:relative;display:block;width:40px;height:40px}',
    '.gna-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from 0deg,var(--s-g1),var(--s-g2),#7a5cff,var(--s-g1));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2.6px),#000 calc(100% - 2px));mask:radial-gradient(farthest-side,transparent calc(100% - 2.6px),#000 calc(100% - 2px));animation:gnaSpin 7s linear infinite;filter:drop-shadow(0 0 5px rgba(0,255,136,.45))}',
    '.gna-face{position:absolute;inset:4px;border-radius:50%;overflow:hidden;background:#0a141c}',
    '.gna-face img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 18%}',
    '.gna-scan{position:absolute;left:0;right:0;top:-40%;height:40%;background:linear-gradient(180deg,transparent,rgba(0,255,220,.38),transparent);animation:gnaScan 3.4s ease-in-out infinite;pointer-events:none}',
    '.gna-brand{position:absolute;right:-4px;bottom:-4px;width:19px;height:19px;border-radius:50%;display:grid;place-items:center;box-shadow:0 0 0 2.5px var(--gna-bg),0 3px 8px -2px rgba(0,0,0,.5)}',
    '.gna-brand svg{width:11px;height:11px;display:block;stroke:none}',
    '.gna-b-instagram{background:radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285aeb 90%)}',
    '.gna-b-whatsapp{background:linear-gradient(145deg,#3ee67d,#25d366 45%,#128c7e)}',

    /* small mono agent tag under the name */
    '.gas-sidebar .gna-sub{display:block;margin-top:3px;font:600 .56rem/1 ' + MONO + ';letter-spacing:.16em;text-transform:uppercase;color:var(--s-g2);opacity:.92}',
    '.gas-sidebar .gna-sub::after{content:"_";margin-left:2px;animation:gnaBlink 1.1s steps(1) infinite}',

    /* LIVE pill (replaces the plain dot; the shell still toggles [hidden]) */
    'html body.gas-body .gas-sidebar .gas-dot{position:relative;width:auto;height:22px;margin:0;padding:0 9px 0 20px;border-radius:999px;display:inline-flex;align-items:center;background:rgba(25,230,140,.10);border:1px solid rgba(25,230,140,.42);box-shadow:none;font:700 .6rem/1 ' + MONO + ';letter-spacing:.14em;color:#19e68c}',
    'html body.gas-body .gas-sidebar .gas-dot[hidden]{display:none}',
    'html body.gas-body .gas-sidebar .gas-dot::before{content:"LIVE"}',
    'html body.gas-body .gas-sidebar .gas-dot::after{content:"";position:absolute;inset:auto;left:8px;top:50%;width:6px;height:6px;margin-top:-3px;border:0;border-radius:50%;background:#19e68c;opacity:1;animation:gnaPulse 1.8s ease-out infinite}',
    'html[data-theme="light"] body.gas-body .gas-sidebar .gas-dot{color:#0a9e63}',

    /* count badges added by this addon */
    '.gas-sidebar .gas-badge[data-gna-count="services"]{background:linear-gradient(100deg,rgba(0,255,136,.14),rgba(0,240,255,.14))}',
    '.gas-sidebar .gas-badge[data-gna-count="calendar"]{background:rgba(122,92,255,.14);border-color:rgba(122,92,255,.42)}',

    /* robot squad next to the AI & Intelligence title */
    '.gas-sidebar{--gna-bot:#0b1a26}',
    'html[data-theme="light"] .gas-sidebar{--gna-bot:#ffffff}',
    '.gas-sidebar .gas-group-title{white-space:nowrap}',
    '.gas-sidebar .gna-squad{position:relative;flex:0 0 auto;display:inline-flex;align-items:flex-end;gap:4px;height:20px;margin-left:2px;padding:0 5px;border-radius:12px;background:linear-gradient(180deg,var(--s-glass),transparent);box-shadow:inset 0 0 0 1px var(--s-line)}',
    '.gna-line{position:absolute;left:6px;right:6px;top:9px;height:1px;background:linear-gradient(90deg,transparent,rgba(0,240,255,.55),transparent);pointer-events:none}',
    '.gna-pkt{position:absolute;top:7px;left:0;width:5px;height:5px;margin-left:-2px;border-radius:50%;background:#fff;box-shadow:0 0 6px 2px var(--s-g2);animation:gnaPkt 7.5s linear infinite;pointer-events:none}',
    '.gna-bot{position:relative;display:block;width:15px;height:20px;flex:0 0 auto}',
    '.gna-bot svg{display:block;width:15px;height:19px;overflow:visible;animation:gnaBob 3s ease-in-out infinite;animation-delay:var(--d)}',
    '.gna-hd{fill:var(--gna-bot);stroke:var(--c);stroke-width:1.5}',
    '.gna-vz{fill:#03090f}',
    '.gna-fc{fill:var(--c)}',
    '.gna-st{fill:none;stroke:var(--c);stroke-width:1.5;stroke-linecap:round}',
    '.gna-eye{transform-box:fill-box;transform-origin:center;animation:gnaEye 4.6s infinite;animation-delay:var(--d)}',
    '.gna-tip{transform-box:fill-box;transform-origin:center;opacity:.55;animation:gnaTip 7.5s ease-out infinite;animation-delay:var(--t);filter:drop-shadow(0 0 2px var(--c))}',
    '.gna-bub{position:absolute;left:50%;top:-8px;display:flex;gap:1.5px;align-items:center;justify-content:center;padding:2px 3px;border-radius:5px;background:var(--c);opacity:0;transform:translate(-50%,3px) scale(.6);animation:gnaBub 7.5s ease-out infinite;animation-delay:var(--t);pointer-events:none;z-index:2}',
    '.gna-bub::after{content:"";position:absolute;left:50%;bottom:-2px;width:4px;height:4px;margin-left:-2px;background:var(--c);transform:rotate(45deg);border-radius:0 0 1px 0}',
    '.gna-bub i{display:block;width:2px;height:2px;border-radius:50%;background:#03090f;animation:gnaDot .9s ease-in-out infinite}',
    '.gna-bub i:nth-child(2){animation-delay:.15s}.gna-bub i:nth-child(3){animation-delay:.3s}',

    /* collapsed rail */
    'body.gas-collapsed .gas-sidebar .gna-sub,body.gas-collapsed .gas-sidebar .gna-squad{display:none}',

    '@keyframes gnaSpin{to{transform:rotate(360deg)}}',
    '@keyframes gnaScan{0%{top:-40%}100%{top:100%}}',
    '@keyframes gnaBlink{0%,100%{opacity:1}50%{opacity:0}}',
    '@keyframes gnaPkt{0%{left:6px;opacity:0}8%{opacity:1}92%{opacity:1}100%{left:calc(100% - 6px);opacity:0}}',
    '@keyframes gnaBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}',
    '@keyframes gnaEye{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}',
    '@keyframes gnaTip{0%{transform:scale(1);opacity:.55}4%{transform:scale(1.9);opacity:1}14%{transform:scale(1);opacity:.55}100%{transform:scale(1);opacity:.55}}',
    '@keyframes gnaBub{0%{opacity:0;transform:translate(-50%,3px) scale(.6)}3%,13%{opacity:1;transform:translate(-50%,0) scale(1)}18%,100%{opacity:0;transform:translate(-50%,-2px) scale(.8)}}',
    '@keyframes gnaDot{0%,100%{opacity:.25}50%{opacity:1}}',
    '@keyframes gnaPulse{0%{box-shadow:0 0 0 0 rgba(25,230,140,.7)}100%{box-shadow:0 0 0 7px rgba(25,230,140,0)}}',
    '@media(prefers-reduced-motion:reduce){.gna-ring,.gna-scan,.gna-pkt,.gna-bub,.gna-tip,.gna-eye,.gna-bot svg,.gas-sidebar .gna-sub::after,html body.gas-body .gas-sidebar .gas-dot::after{animation:none !important}}'
  ].join('');

  function ensureStyle() {
    if (document.getElementById('gnaStyle')) return;
    var s = document.createElement('style');
    s.id = 'gnaStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ---------- agent photo tiles ---------- */
  function agentize(link, a) {
    var ico = link.querySelector('.gas-ico');
    if (!ico) return;
    var original = ico.outerHTML;
    ico.className = 'gas-ico gna-ico';
    ico.innerHTML =
      '<span class="gna-agent"><i class="gna-ring"></i>' +
      '<span class="gna-face"><img src="' + LIB + a.img + '" alt="" width="40" height="40" decoding="async"><i class="gna-scan"></i></span>' +
      (a.brand ? '<span class="gna-brand gna-b-' + a.brand + '">' + BRAND[a.brand] + '</span>' : '') +
      '</span>';
    var img = ico.querySelector('img');
    img.addEventListener('error', function () { ico.outerHTML = original; });
    var label = link.querySelector('.gas-label');
    if (label && !label.querySelector('.gna-sub')) {
      label.insertAdjacentHTML('beforeend', '<small class="gna-sub">' + a.tag + '</small>');
    }
  }

  /* ---------- live counts ---------- */
  var last = null;
  var needPaint = false;
  var busy = false;
  var sb = null;

  function addBadge(link, key) {
    if (link.querySelector('[data-gna-count]')) return;
    link.insertAdjacentHTML('beforeend', '<span class="gas-badge" data-gna-count="' + key + '" hidden></span>');
    needPaint = true;
  }

  function paint(c) {
    var els = document.querySelectorAll('[data-gna-count]');
    Array.prototype.forEach.call(els, function (el) {
      var key = el.getAttribute('data-gna-count');
      var n = c ? (key === 'services' ? c.live : c.appts) : null;
      var ok = typeof n === 'number' && n >= 0;
      if (ok) {
        var txt = n > 999 ? '999+' : String(n);
        if (el.textContent !== txt) el.textContent = txt;
        el.title = key === 'services'
          ? n + ' live · ' + (c.draft || 0) + ' draft'
          : n + ' upcoming appointment' + (n === 1 ? '' : 's');
      }
      if (el.hidden === ok) el.hidden = !ok;
      if (el.parentNode) el.parentNode.classList.toggle('gas-has-badge', ok);
    });
  }

  function client() {
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (sb) return sb;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
      try { sb = window.supabase.createClient(SB_URL, SB_KEY); } catch (e) { sb = null; }
    }
    return sb;
  }

  function loadCounts(force) {
    var cached = null;
    try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch (e) { cached = null; }
    if (cached && cached.v) { last = cached.v; paint(last); }
    if (!force && cached && Date.now() - cached.t < CACHE_TTL) return;
    if (busy) return;
    busy = true;

    var tries = 0;
    (function attempt() {
      var c = client();
      if (!c) {
        if (++tries < 20) { setTimeout(attempt, 400); return; }
        busy = false;
        return;
      }
      var count = function (q) {
        return q.then(function (x) {
          return x && !x.error && typeof x.count === 'number' ? x.count : null;
        }, function () { return null; });
      };
      c.auth.getSession().then(function (r) {
        var session = r && r.data && r.data.session;
        if (!session) return null;
        return c.from('client_data').select('client_id').eq('auth_user_id', session.user.id).maybeSingle()
          .then(function (res) {
            var cid = res && res.data && res.data.client_id;
            if (!cid) return null;
            var head = { count: 'exact', head: true };
            return Promise.all([
              count(c.from('offers').select('id', head).eq('client_id', cid).eq('status', 'active')),
              count(c.from('offers').select('id', head).eq('client_id', cid).eq('status', 'draft')),
              count(c.from('gcal_bookings').select('id', head).eq('client_id', cid)
                .not('status', 'in', '(cancelled,canceled)').gte('end_at', new Date().toISOString()))
            ]).then(function (a) { return { live: a[0], draft: a[1], appts: a[2] }; });
          });
      }).then(function (v) {
        if (!v) return;
        last = v;
        paint(v);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* ignore */ }
      }).catch(function () { /* keep whatever is shown */ })
        .then(function () { busy = false; });
    })();
  }

  /* ---------- robot squad next to the AI & Intelligence title ---------- */
  var BOT_COLORS = ['#19e6a0', '#00d4ff', '#ff5aa5', '#2fe36f', '#9a7bff'];

  function botHtml(i) {
    return '<span class="gna-bot" style="--c:' + BOT_COLORS[i] + ';--d:' + (i * 0.6).toFixed(1) + 's;--t:' + (i * 1.5 + 0.35).toFixed(2) + 's">' +
      '<span class="gna-bub"><i></i><i></i><i></i></span>' +
      '<svg viewBox="0 0 24 30" aria-hidden="true" focusable="false">' +
      '<path class="gna-st" d="M12 7V3.4"/>' +
      '<circle class="gna-fc gna-tip" cx="12" cy="2.4" r="2"/>' +
      '<rect class="gna-fc" x="0.9" y="11" width="2" height="5" rx="1" opacity=".75"/>' +
      '<rect class="gna-fc" x="21.1" y="11" width="2" height="5" rx="1" opacity=".75"/>' +
      '<rect class="gna-hd" x="3" y="7" width="18" height="13" rx="5"/>' +
      '<rect class="gna-vz" x="6" y="10" width="12" height="7" rx="3"/>' +
      '<circle class="gna-fc gna-eye" cx="9.6" cy="13.5" r="1.5"/>' +
      '<circle class="gna-fc gna-eye" cx="14.4" cy="13.5" r="1.5"/>' +
      '<path class="gna-st" d="M6 29c0-3.6 2.7-6.2 6-6.2s6 2.6 6 6.2" opacity=".85"/>' +
      '</svg></span>';
  }

  function squad(nav) {
    var title = null;
    Array.prototype.forEach.call(nav.querySelectorAll('.gas-group-title'), function (t) {
      if (/^\s*AI\b/i.test(t.textContent)) title = t;
    });
    if (!title || title.querySelector('.gna-squad')) return;
    var html = '<span class="gna-squad" aria-hidden="true" title="5 AI agents working together"><i class="gna-line"></i><i class="gna-pkt"></i>';
    for (var i = 0; i < 5; i++) html += botHtml(i);
    html += '</span>';
    title.insertAdjacentHTML('beforeend', html);
  }

  /* ---------- main pass (safe to run many times) ---------- */
  function decorate() {
    var nav = document.getElementById('gasSidebar');
    if (!nav) return;
    Array.prototype.forEach.call(nav.querySelectorAll('.gas-link'), function (link) {
      if (link.getAttribute('data-gna')) return;
      var href = (link.getAttribute('href') || '').toLowerCase();
      var a = AGENTS[href];
      if (a) { link.setAttribute('data-gna', 'agent'); agentize(link, a); return; }
      if (href === 'services.html') { link.setAttribute('data-gna', 'count'); addBadge(link, 'services'); return; }
      if (href === 'calendar.html') { link.setAttribute('data-gna', 'count'); addBadge(link, 'calendar'); return; }
      link.setAttribute('data-gna', 'x');
    });
    squad(nav);
    if (needPaint) { needPaint = false; paint(last); }
  }

  function start() {
    var nav = document.getElementById('gasSidebar');
    if (!nav) return;
    ensureStyle();
    decorate();

    /* other add-ons (Calendar, Telegram) add menu items later: decorate them too */
    var queued = false;
    var obs = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; decorate(); });
    });
    obs.observe(nav, { childList: true, subtree: true });

    loadCounts(false);
    setInterval(function () { if (!document.hidden) loadCounts(true); }, 90000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) loadCounts(false); });
  }

  if (document.getElementById('gasSidebar')) start();
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else setTimeout(start, 0);
})();
