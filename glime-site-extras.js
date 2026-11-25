/* =========================================================
   GLIME SITE PREMIUM ADD-ON  (glime-site-extras.js)
   ---------------------------------------------------------
   Loaded right after glime-site-render.js (editor preview and the public site.html).
   It wraps GlimeSite.buildDocument and adds, without touching the renderer:
     - 4 new colour themes: chocolate, noir, mocha, obsidian
     - Share button in the top bar + share sheet (WhatsApp, Telegram, Facebook, X, Email, copy link,
       native share when the phone supports it) + a Share button inside every product popup
     - Product deep links: <site link>&p=<product id> opens that product directly
     - Quick action strip under the hero: Call, WhatsApp, Directions, Instagram, Save contact, Share
     - "Open now / Closed now" badge calculated from the opening hours (India time)
     - Product search, price sort and Saved (heart) products
     - Smooth reveal animation while scrolling
   Every extra is built only from the client's own details. Nothing is invented.
   If anything fails, the original page from the renderer is returned unchanged.
========================================================= */
(function (root) {
  'use strict';
  var GS = root.GlimeSite;
  if (!GS || GS.__extras) return;
  GS.__extras = true;
  var esc = GS.esc;

  /* ---------- new themes ---------- */
  GS.THEMES.chocolate = { n: { en: 'Chocolate' }, p: '#d9a066', p2: '#f1cf9e', bg: '#150d09', sf: '#22150f', tx: '#f6ebe0', mu: '#b9a291', on: '#1a0f08', dark: true };
  GS.THEMES.noir = { n: { en: 'Noir Gold' }, p: '#d4af37', p2: '#f3dc8a', bg: '#080808', sf: '#131313', tx: '#f5f0e6', mu: '#a69f90', on: '#0a0a0a', dark: true };
  GS.THEMES.mocha = { n: { en: 'Mocha' }, p: '#4a2a1b', p2: '#a0704a', bg: '#f6efe6', sf: '#fffcf7', tx: '#26170f', mu: '#7d6858', on: '#fff7ee', dark: false };
  GS.THEMES.obsidian = { n: { en: 'Obsidian' }, p: '#ffffff', p2: '#cfcfd4', bg: '#0b0b0c', sf: '#151517', tx: '#f4f4f5', mu: '#9a9aa1', on: '#0b0b0c', dark: true };

  var PREMIUM = { 'noir-maison': 1, 'chocolate-atelier': 1, 'mocha-boutique': 1, 'obsidian-grid': 1, 'cocoa-rose': 1 };
  var PREM_FONT = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500&family=Jost:wght@400;500;600&display=swap';

  /* ---------- icons ---------- */
  var SVG = function (inner) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; };
  var IC = {
    phone: SVG('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>'),
    chat: SVG('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.4-8.5h.5A8.5 8.5 0 0 1 21 11z"/>'),
    pin: SVG('<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>'),
    insta: SVG('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6"/>'),
    user: SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
    share: SVG('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>'),
    heart: SVG('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
    search: SVG('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
  };

  /* ---------- css ---------- */
  var CSS =
    '.nav-act{display:flex;align-items:center;gap:8px;flex:none}' +
    '.shr{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--bd);background:transparent;color:var(--tx);display:grid;place-items:center;cursor:pointer;flex:none;transition:.2s}.shr:hover{border-color:var(--p);color:var(--p)}' +
    '.shr svg,.qa svg,.fv svg,.gx-fvb svg{width:18px;height:18px}' +
    '.L-luxury .nav-in>.nav-act{grid-column:3;grid-row:1;justify-self:end}' +
    '.qa-row{padding:16px 0 4px}.qa-in{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 8px}.qa-in::-webkit-scrollbar{display:none}@media(min-width:700px){.qa-in{justify-content:center}}' +
    '.qa{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:999px;border:1px solid var(--bd);background:var(--sf);color:var(--tx);font:inherit;font-size:.86rem;font-weight:600;cursor:pointer;white-space:nowrap;transition:.2s}' +
    '.qa svg{color:var(--p)}.qa:hover{border-color:var(--p);transform:translateY(-1px)}' +
    '.opn{display:inline-flex;align-items:center;gap:6px;margin:0 0 12px 8px;padding:5px 12px;border-radius:999px;font-size:.74rem;font-weight:700;letter-spacing:.04em;background:rgba(37,211,102,.14);color:#22b35e;vertical-align:top}.opn.off{background:rgba(225,29,72,.12);color:#e5484d}.opn[hidden]{display:none}' +
    '.gx-tb{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 18px}.gx-q{flex:1 1 200px;position:relative}' +
    '.gx-q input{width:100%;font:inherit;color:var(--tx);background:var(--sf);border:1px solid var(--bd);border-radius:999px;padding:11px 16px 11px 42px;outline:none}.gx-q input:focus{border-color:var(--p)}' +
    '.gx-q svg{position:absolute;left:15px;top:50%;transform:translateY(-50%);width:17px;height:17px;color:var(--mu)}' +
    '.gx-o{font:inherit;color:var(--tx);background:var(--sf);border:1px solid var(--bd);border-radius:999px;padding:10px 14px;outline:none}' +
    '.gx-fvb{display:inline-flex;align-items:center;gap:7px;font:inherit;font-weight:600;font-size:.86rem;color:var(--tx);background:var(--sf);border:1px solid var(--bd);border-radius:999px;padding:10px 16px;cursor:pointer}.gx-fvb.on{border-color:var(--p);color:var(--p)}.gx-fvb svg{width:16px;height:16px}' +
    '.gx-h{display:none!important}.gx-empty{text-align:center;color:var(--mu);padding:28px 0}.gx-empty[hidden]{display:none}' +
    '.card{position:relative;transition:transform .35s ease,box-shadow .35s ease}@media(hover:hover){.card:hover{transform:translateY(-4px);box-shadow:0 18px 38px var(--sh)}}' +
    '.fv{position:absolute;top:10px;right:10px;z-index:2;width:36px;height:36px;border-radius:50%;border:0;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;display:grid;place-items:center;cursor:pointer;transition:.2s}' +
    '.fv.on{background:#fff;color:#e11d48}.fv.on svg{fill:currentColor}' +
    '.gx-sh{flex:0 0 52px!important;padding:0!important}.gx-sh svg{width:18px;height:18px}' +
    '.gxs{position:fixed;inset:0;z-index:140;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}' +
    '.gxs-b{background:var(--bg);color:var(--tx);width:min(460px,100%);border-radius:24px 24px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));position:relative;border:1px solid var(--bd)}@media(min-width:700px){.gxs{align-items:center}.gxs-b{border-radius:24px}}' +
    '.gxs-b h4{font-family:var(--hf),serif;font-size:1.2rem}.gxs-t{color:var(--mu);font-size:.88rem;margin:2px 44px 16px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.gxs-x{position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:50%;border:0;background:var(--sf);color:var(--tx);font-size:1.3rem;cursor:pointer}' +
    '.gxs-g{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}.gxs-g a{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:.74rem;color:var(--mu)}' +
    '.gxs-g i{width:50px;height:50px;border-radius:50%;display:grid;place-items:center;color:#fff;font-style:normal;font-weight:800;font-size:1.05rem}' +
    '.gxs-u{display:flex;gap:8px}.gxs-u input{flex:1;min-width:0;font:inherit;font-size:.85rem;color:var(--tx);background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:11px 12px}.gxs-n{width:100%;margin-top:10px}' +
    '.gxt{position:fixed;left:50%;bottom:100px;transform:translate(-50%,12px);z-index:160;background:var(--tx);color:var(--bg);padding:10px 18px;border-radius:999px;font-size:.86rem;font-weight:600;opacity:0;pointer-events:none;transition:.25s}.gxt.on{opacity:1;transform:translate(-50%,0)}' +
    '.sec,.qa-row{transition:opacity .7s ease,transform .7s ease}.gx-rv .sec:not(.gx-in),.gx-rv .qa-row:not(.gx-in){opacity:0;transform:translateY(24px)}' +
    '@media(prefers-reduced-motion:reduce){.gx-rv .sec:not(.gx-in),.gx-rv .qa-row:not(.gx-in){opacity:1;transform:none}}';

  /* ---------- html pieces ---------- */
  function shareBtn(id, label) { return '<button type="button" class="shr" data-sh="' + esc(id) + '" aria-label="' + esc(label) + '">' + IC.share + '</button>'; }

  function quickStrip(c, name, wa, tel) {
    var k = c.contact, q = [];
    if (tel) q.push('<a class="qa" data-ev="call" href="tel:+' + tel + '">' + IC.phone + '<span>Call</span></a>');
    if (wa) {
      var msg = c.cta.waMessage || ('Hi ' + name + ', I found you on your website and need some information.');
      q.push('<a class="qa" data-ev="whatsapp" target="_blank" rel="noopener" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(msg) + '">' + IC.chat + '<span>WhatsApp</span></a>');
    }
    if (k.address) q.push('<a class="qa" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&amp;query=' + encodeURIComponent((name ? name + ', ' : '') + k.address) + '">' + IC.pin + '<span>Directions</span></a>');
    if (k.instagram) {
      var h = String(k.instagram).replace(/^@/, '');
      var ig = /^https?:\/\//i.test(k.instagram) ? GS.safeUrl(k.instagram) : (/^[A-Za-z0-9._]{1,30}$/.test(h) ? 'https://instagram.com/' + h : '');
      if (ig) q.push('<a class="qa" target="_blank" rel="noopener" href="' + esc(ig) + '">' + IC.insta + '<span>Instagram</span></a>');
    }
    if (tel || k.email) q.push('<button type="button" class="qa" data-vc="1">' + IC.user + '<span>Save contact</span></button>');
    q.push('<button type="button" class="qa" data-sh="site">' + IC.share + '<span>Share</span></button>');
    return '<div class="qa-row"><div class="wrap qa-in">' + q.join('') + '</div></div>';
  }

  function priceNum(o) {
    var p = o.price; if (!p) return '';
    var v = parseFloat(p.amount != null && p.amount !== '' ? p.amount : p.min);
    return isNaN(v) ? '' : String(v);
  }

  function jsonForScript(o) {
    return JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(8232)).join('\\u2028').split(String.fromCharCode(8233)).join('\\u2029');
  }

  /* ---------- runtime (runs inside the generated page) ---------- */
  function rt() {
    var X = window.__GX || {}, P = !!X.preview, DOC = document, cur = null;
    function q(s, r) { return (r || DOC).querySelector(s); }
    function qa(s, r) { return Array.prototype.slice.call((r || DOC).querySelectorAll(s)); }
    function ea(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var vid = ''; try { vid = localStorage.getItem('gs_vid') || ''; } catch (e) { /* ignore */ }
    var FK = 'gs_fav_' + (X.slug || 'x');
    function favs() { try { var a = JSON.parse(localStorage.getItem(FK) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function setFavs(a) { try { localStorage.setItem(FK, JSON.stringify(a.slice(0, 200))); } catch (e) { /* ignore */ } }
    function toast(m) {
      var t = q('#gxt'); if (!t) { t = DOC.createElement('div'); t.id = 'gxt'; DOC.body.appendChild(t); }
      t.textContent = m; t.className = 'gxt on'; clearTimeout(toast.t); toast.t = setTimeout(function () { t.className = 'gxt'; }, 2200);
    }
    function track(ev, label) {
      if (P || !X.slug) return;
      try { fetch(X.api + '/rpc/website_public_track', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: X.key }, body: JSON.stringify({ p_slug: X.slug, p_event: ev, p_visitor: vid, p_meta: { label: label || '' } }), keepalive: true }).catch(function () { /* ignore */ }); } catch (e) { /* ignore */ }
    }

    /* ----- share ----- */
    function urlFor(id) { return X.base + X.slug + (id ? '&p=' + encodeURIComponent(id) : ''); }
    function closeSheet() { var s = q('#gxs'); if (s) s.remove(); }
    function openShare(id) {
      var o = null; (X.offers || []).forEach(function (z) { if (z.id === id) o = z; });
      var url = urlFor(o ? o.id : ''), enc = encodeURIComponent;
      var title = o ? o.name + ' - ' + X.name : X.name;
      var text = o ? o.name + (o.price ? ' (' + o.price + ')' : '') + ' at ' + X.name : 'Have a look at ' + X.name;
      cur = { title: title, text: text, url: url };
      track('share', o ? o.name : 'site');
      closeSheet();
      var items = [
        ['WhatsApp', '#25d366', 'W', 'https://wa.me/?text=' + enc(text + ' ' + url)],
        ['Telegram', '#2aa3e0', 'T', 'https://t.me/share/url?url=' + enc(url) + '&text=' + enc(text)],
        ['Facebook', '#1877f2', 'f', 'https://www.facebook.com/sharer/sharer.php?u=' + enc(url)],
        ['X', '#111111', 'X', 'https://twitter.com/intent/tweet?text=' + enc(text) + '&url=' + enc(url)],
        ['Email', '#8a6d3b', '@', 'mailto:?subject=' + enc(title) + '&body=' + enc(text + '\n' + url)]
      ];
      var d = DOC.createElement('div'); d.className = 'gxs'; d.id = 'gxs';
      d.innerHTML = '<div class="gxs-b" role="dialog" aria-modal="true"><button type="button" class="gxs-x" data-gx="close" aria-label="Close">×</button><h4>Share</h4><p class="gxs-t">' + ea(title) + '</p><div class="gxs-g">' +
        items.map(function (it) { return '<a target="_blank" rel="noopener" href="' + ea(it[3]) + '"><i style="background:' + it[1] + '">' + it[2] + '</i>' + it[0] + '</a>'; }).join('') +
        '</div><div class="gxs-u"><input id="gxu" readonly value="' + ea(url) + '"><button type="button" class="btn sm" data-gx="copy">Copy link</button></div>' +
        (navigator.share ? '<button type="button" class="btn ghost gxs-n" data-gx="native">More options…</button>' : '') + '</div>';
      DOC.body.appendChild(d);
    }
    function copyLink() {
      var inp = q('#gxu'), u = cur ? cur.url : '';
      var fb = function () { if (inp) { inp.focus(); inp.select(); try { DOC.execCommand('copy'); toast('Link copied'); } catch (e) { toast('Select the link and copy it'); } } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(function () { toast('Link copied'); }).catch(fb); else fb();
    }

    /* ----- save contact (vCard) ----- */
    function saveContact() {
      var L = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:' + X.name, 'ORG:' + X.name];
      if (X.phone) L.push('TEL;TYPE=WORK,VOICE:+' + X.phone);
      if (X.email) L.push('EMAIL:' + X.email);
      if (X.address) L.push('ADR;TYPE=WORK:;;' + String(X.address).replace(/[;,\r\n]+/g, ' ') + ';;;;');
      L.push('URL:' + urlFor(''), 'END:VCARD');
      try {
        var b = new Blob([L.join('\r\n')], { type: 'text/vcard' }), a = DOC.createElement('a');
        a.href = URL.createObjectURL(b); a.download = (X.slug || 'contact') + '.vcf'; DOC.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
        toast('Contact file ready');
      } catch (e) { toast('Could not create the contact file'); }
    }

    /* ----- open now / closed now (India time) ----- */
    var DN = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    function dayList(s) {
      s = String(s || '').toLowerCase();
      if (/daily|every ?day|all days|7 days/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
      var m = s.match(/(sun|mon|tue|wed|thu|fri|sat)/g) || [];
      if (!m.length) return [];
      var ix = m.map(function (d) { return DN.indexOf(d); });
      if (ix.length === 2 && /[–—-]|\bto\b/.test(s)) { var out = [], i = ix[0]; for (var n = 0; n < 7; n++) { out.push(i); if (i === ix[1]) break; i = (i + 1) % 7; } return out; }
      return ix;
    }
    function toMin(s) {
      var m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i.exec(s || ''); if (!m) return null;
      var h = +m[1], mi = +(m[2] || 0), ap = (m[3] || '').toLowerCase();
      if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
      return h * 60 + mi;
    }
    function fmtMin(v) { var h = Math.floor(v / 60) % 24, m = v % 60, ap = h >= 12 ? 'PM' : 'AM'; h = h % 12; if (h === 0) h = 12; return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap; }
    function openNow() {
      var el = q('#opn'); if (!el) return;
      var rows = [];
      (X.hours || []).forEach(function (r) {
        var d = dayList(r.d); if (!d.length) return;
        if (/closed/i.test(r.t || '')) { rows.push({ d: d, closed: true }); return; }
        var p = String(r.t || '').split(/\s*[–—]\s*|\s+-\s+|\s+to\s+/i), a = toMin(p[0]), b = toMin(p[1]);
        if (a == null || b == null) return;
        rows.push({ d: d, a: a, b: b });
      });
      if (!rows.length) return;
      var now;
      try {
        var parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date()), o = {};
        parts.forEach(function (p) { o[p.type] = p.value; });
        now = { d: DN.indexOf(String(o.weekday).slice(0, 3).toLowerCase()), m: (+o.hour % 24) * 60 + (+o.minute) };
      } catch (e) { return; }
      var open = false, until = null;
      rows.forEach(function (r) {
        if (r.closed || r.d.indexOf(now.d) < 0) return;
        var ok = r.b > r.a ? (now.m >= r.a && now.m < r.b) : (now.m >= r.a || now.m < r.b);
        if (ok) { open = true; until = r.b; }
      });
      el.hidden = false; el.className = 'opn' + (open ? '' : ' off');
      el.textContent = open ? '● Open now' + (until != null ? ' · until ' + fmtMin(until) : '') : '● Closed now';
    }

    /* ----- search, sort, saved ----- */
    function paintFavs() {
      var f = favs();
      qa('.fv').forEach(function (b) { b.classList.toggle('on', f.indexOf(b.getAttribute('data-fv')) >= 0); });
      var c = q('.gx-fvb b'); if (c) c.textContent = f.length ? '(' + f.length + ')' : '';
    }
    function apply() {
      var inp = q('#gxq'), qv = inp ? inp.value.toLowerCase().trim() : '', fb = q('[data-tb="fav"]'), only = !!(fb && fb.classList.contains('on')), f = favs(), shown = 0;
      qa('.grid .card[data-id]').forEach(function (c) {
        var ok = true;
        if (qv && (c.getAttribute('data-nm') || '').indexOf(qv) < 0) ok = false;
        if (only && f.indexOf(c.getAttribute('data-id')) < 0) ok = false;
        c.classList.toggle('gx-h', !ok);
        if (ok && c.style.display !== 'none') shown++;
      });
      var em = q('#gxe'); if (em) { em.hidden = shown > 0; em.textContent = only ? 'No saved items yet. Tap the heart on an item to save it.' : 'No items match your search.'; }
    }
    function sortCards() {
      var s = q('#gxo'), g = q('.grid'); if (!s || !g) return;
      var v = s.value, cards = qa('.grid .card[data-id]');
      cards.sort(function (a, b) {
        if (v === 'lo' || v === 'hi') {
          var x = parseFloat(a.getAttribute('data-pr')), y = parseFloat(b.getAttribute('data-pr')), nx = isNaN(x), ny = isNaN(y);
          if (nx && ny) return 0; if (nx) return 1; if (ny) return -1;
          return v === 'lo' ? x - y : y - x;
        }
        return (+a.getAttribute('data-i')) - (+b.getAttribute('data-i'));
      });
      cards.forEach(function (c) { g.appendChild(c); });
    }

    /* ----- events ----- */
    DOC.addEventListener('click', function (e) {
      var t = e.target; if (!t || !t.closest) return;
      var sheet = q('#gxs');
      if (sheet && t === sheet) { closeSheet(); e.stopPropagation(); return; }
      var gx = t.closest('[data-gx]');
      if (gx) {
        e.preventDefault(); e.stopPropagation();
        var a = gx.getAttribute('data-gx');
        if (a === 'close') closeSheet(); else if (a === 'copy') copyLink();
        else if (a === 'native' && navigator.share && cur) navigator.share({ title: cur.title, text: cur.text, url: cur.url }).catch(function () { /* cancelled */ });
        return;
      }
      if (P) return;
      var sh = t.closest('[data-sh]');
      if (sh) { e.preventDefault(); e.stopPropagation(); var sid = sh.getAttribute('data-sh'); openShare(sid === 'site' ? '' : sid); return; }
      var fv = t.closest('[data-fv]');
      if (fv) {
        e.preventDefault(); e.stopPropagation();
        var id = fv.getAttribute('data-fv'), f = favs(), i = f.indexOf(id);
        if (i < 0) { f.push(id); toast('Saved ♥'); } else { f.splice(i, 1); toast('Removed from saved'); }
        setFavs(f); paintFavs(); apply(); return;
      }
      var tb = t.closest('[data-tb="fav"]');
      if (tb) { e.preventDefault(); e.stopPropagation(); tb.classList.toggle('on'); apply(); return; }
      if (t.closest('[data-vc]')) { e.preventDefault(); e.stopPropagation(); saveContact(); return; }
      if (t.closest('button.cat')) setTimeout(apply, 0);
    }, true);
    DOC.addEventListener('input', function (e) { if (e.target && e.target.id === 'gxq') apply(); });
    DOC.addEventListener('change', function (e) { if (e.target && e.target.id === 'gxo') { sortCards(); apply(); } });
    DOC.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

    /* Share button inside the product popup */
    try {
      new MutationObserver(function () {
        var m = q('.mdl .mact'); if (!m || m.querySelector('.gx-sh')) return;
        var a = m.querySelector('[data-offer]'), id = a ? a.getAttribute('data-offer') : '';
        var b = DOC.createElement('button'); b.type = 'button'; b.className = 'btn ghost gx-sh'; b.setAttribute('data-sh', id || 'site'); b.setAttribute('aria-label', 'Share'); b.innerHTML = X.shareSvg || 'Share';
        m.appendChild(b);
      }).observe(DOC.body, { childList: true });
    } catch (e) { /* ignore */ }

    paintFavs(); openNow(); setInterval(openNow, 60000);

    if (!P) {
      var pm = /[?&]p=([^&]+)/.exec(location.search);
      if (pm) {
        var pid = ''; try { pid = decodeURIComponent(pm[1]); } catch (e) { pid = ''; }
        if (/^[0-9a-zA-Z-]{6,60}$/.test(pid)) setTimeout(function () { var c = q('.card[data-id="' + pid + '"]'); if (c) { var t = c.querySelector('.im') || c; t.click(); } }, 500);
      }
      if ('IntersectionObserver' in window) {
        DOC.documentElement.classList.add('gx-rv');
        var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('gx-in'); io.unobserve(en.target); } }); }, { threshold: 0.06 });
        qa('.sec,.qa-row').forEach(function (s) { io.observe(s); });
      }
    }
  }

  /* ---------- enhance the generated document ---------- */
  function enhance(html, c, data, opts) {
    var offers = GS.visibleOffers(c, data.offers), slug = data.slug || '', name = c.brand.name || 'Your business', k = c.contact;
    var wa = GS.waNumber(k.whatsapp || k.phone), tel = GS.waNumber(k.phone || k.whatsapp);
    var out = html, a, b;

    /* css + fonts */
    out = out.replace('<style>', function () { return (PREMIUM[c.layout] ? '<link rel="stylesheet" href="' + PREM_FONT + '">' : '') + '<style>'; });
    out = out.replace('</style></head>', function () { return CSS + '</style></head>'; });

    /* top bar: share button next to the main button */
    a = out.indexOf('</nav>'); b = out.indexOf('</div></header>');
    if (a > -1 && b > a) out = out.slice(0, a + 6) + '<div class="nav-act">' + out.slice(a + 6, b) + shareBtn('site', 'Share') + '</div>' + out.slice(b);

    /* open-now badge (filled in by the page script) */
    if ((k.hours || []).some(function (h) { return h.d || h.t; })) out = out.replace(/(<span class="chip">[^<]*<\/span>)/, function (m) { return m + '<span class="opn" id="opn" hidden></span>'; });

    /* quick action strip right after the hero */
    a = out.indexOf('</section>');
    if (a > -1) out = out.slice(0, a + 10) + quickStrip(c, name, wa, tel) + out.slice(a + 10);

    /* products: toolbar, hearts, data for search and sort */
    if (offers.length) {
      var priced = offers.filter(function (o) { return priceNum(o) !== ''; }).length;
      var tb = '';
      if (offers.length >= 6) tb += '<label class="gx-q">' + IC.search + '<input id="gxq" type="search" maxlength="60" placeholder="Search products" autocomplete="off"></label>';
      if (c.offers.showPrices && priced >= 3) tb += '<select class="gx-o" id="gxo" aria-label="Sort"><option value="">Featured</option><option value="lo">Price: low to high</option><option value="hi">Price: high to low</option></select>';
      if (offers.length >= 2) tb += '<button type="button" class="gx-fvb" data-tb="fav">' + IC.heart + '<span>Saved</span> <b></b></button>';
      if (tb) out = out.replace('<div class="grid">', function () { return '<div class="gx-tb">' + tb + '</div><div class="grid">'; });
      out = out.replace(/<article class="card" data-i="(\d+)" data-cat="([^"]*)">/g, function (m, i, cat) {
        var o = offers[+i]; if (!o) return m;
        var nm = esc((String(o.name || '') + ' ' + String(o.category || '')).toLowerCase());
        return '<article class="card" data-i="' + i + '" data-cat="' + cat + '" data-id="' + esc(o.id) + '" data-nm="' + nm + '" data-pr="' + priceNum(o) + '">' +
          '<button type="button" class="fv" data-fv="' + esc(o.id) + '" aria-label="Save item">' + IC.heart + '</button>';
      });
      var g = out.indexOf('<div class="grid">');
      if (g > -1) { var e = out.indexOf('</div></div></section>', g); if (e > -1) out = out.slice(0, e + 6) + '<p class="gx-empty" id="gxe" hidden></p>' + out.slice(e + 6); }
    }

    /* page script */
    var X = {
      slug: slug, name: name, base: GS.SITE_BASE, api: GS.SUPABASE_URL + '/rest/v1', key: GS.KEY, preview: !!opts.preview,
      phone: tel, email: k.email || '', address: k.address || '', hours: k.hours || [], shareSvg: IC.share,
      offers: offers.map(function (o) { return { id: o.id, name: o.name, price: c.offers.showPrices ? GS.fmtPrice(o.price, 'en') : '' }; })
    };
    var end = out.lastIndexOf('</body>');
    if (end > -1) out = out.slice(0, end) + '<script>window.__GX=' + jsonForScript(X) + ';(' + rt.toString() + ')();<\/script>' + out.slice(end);
    return out;
  }

  var baseBuild = GS.buildDocument;
  GS.buildDocument = function (cfg, data, opts) {
    var html = baseBuild(cfg, data, opts);
    opts = opts || {};
    if (opts.mini) return html;
    try { return enhance(html, GS.normalize(cfg), data || {}, opts); } catch (e) { return html; }
  };
  GS.enhance = enhance;
})(typeof window !== 'undefined' ? window : this);
