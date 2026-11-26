/* =========================================================
   GLIME SITE CARD STYLES  (glime-site-cards.js)
   ---------------------------------------------------------
   Loaded after glime-site-extras.js. Adds a "Card style" choice for the services / products:
     ''     Classic cards        (default, as before)
     'tile' Photo tiles          tall photo cards with the name and price on the photo,
                                 category pill on top, heart on the corner, swipe slider + arrows
     'box'  Small boxes          compact 2-column grid (4 on desktop) with a square photo
   The choice is saved in the site config as cfg.cardStyle.
   In the editor it adds three chips at the top of Customize > Services / products.
   If anything fails, the page from the previous layer is returned unchanged.
========================================================= */
(function (root) {
  'use strict';
  var GS = root.GlimeSite;
  if (!GS || GS.__cards) return;
  GS.__cards = true;

  var STYLES = [['', 'Classic cards'], ['tile', 'Photo tiles (slider)'], ['box', 'Small boxes (grid)']];
  function clean(v) { return v === 'tile' || v === 'box' ? v : ''; }

  var CSS =
    '.gx-nav{display:none;justify-content:center;gap:12px;margin-top:14px}' +
    '.gx-nav button{width:52px;height:52px;border-radius:50%;border:1px solid var(--bd);background:transparent;color:var(--tx);font-size:1.3rem;line-height:1;cursor:pointer;transition:.2s}.gx-nav button:hover{border-color:var(--p);color:var(--p)}' +
    /* photo tiles */
    'body.CS-tile .gx-nav{display:flex}' +
    'body.CS-tile .grid{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:4px 2px 10px}' +
    'body.CS-tile .grid::-webkit-scrollbar{display:none}' +
    'body.CS-tile .card{display:block;flex:0 0 min(78%,300px);aspect-ratio:3/4.1;scroll-snap-align:start;border:0;border-radius:30px;overflow:hidden;padding:0;background:var(--sf);box-shadow:0 14px 32px var(--sh)}' +
    'body.CS-tile .card .im{position:absolute;inset:0;width:auto;height:auto;aspect-ratio:auto;border-radius:0;background-size:cover;background-position:center}' +
    'body.CS-tile .card .im.ph{font-size:4rem}' +
    'body.CS-tile .cb{position:static;display:block;padding:0}' +
    'body.CS-tile .tag{position:absolute;top:14px;left:14px;z-index:2;background:var(--p);color:var(--on);padding:7px 14px;border-radius:999px;font-weight:700;letter-spacing:.08em;font-size:.68rem}' +
    'body.CS-tile .cbt{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:stretch;gap:6px;text-align:left;padding:72px 18px 18px;color:#fff;background:linear-gradient(to top,rgba(0,0,0,.88) 0,rgba(0,0,0,.55) 58%,transparent)}' +
    'body.CS-tile .card h3{color:#fff;font-size:1.3rem;font-weight:600}' +
    'body.CS-tile .card .d{color:rgba(255,255,255,.84);-webkit-line-clamp:2}' +
    'body.CS-tile .card .pr{color:#fff}' +
    'body.CS-tile .card .row{flex-direction:row;padding-top:6px}' +
    'body.CS-tile .card .btn.sm{background:#fff;color:#111;box-shadow:none}' +
    '@media(min-width:820px){body.CS-tile .card{flex-basis:300px}}' +
    /* small boxes */
    'body.CS-box .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}' +
    '@media(min-width:700px){body.CS-box .grid{grid-template-columns:repeat(4,1fr)}}' +
    'body.CS-box .card{display:flex;flex-direction:column;border-radius:20px;overflow:hidden;padding:0;background:var(--sf);border:1px solid var(--bd)}' +
    'body.CS-box .card .im{width:auto;height:auto;aspect-ratio:1/1;border-radius:0;flex:none}' +
    'body.CS-box .cb{padding:10px 12px 12px;gap:3px;text-align:left;align-items:stretch}' +
    'body.CS-box .card h3{font-size:.92rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
    'body.CS-box .card .d,body.CS-box .tag{display:none}' +
    'body.CS-box .card .row{flex-direction:row;flex-wrap:wrap;gap:6px;padding-top:6px}' +
    'body.CS-box .card .pr{font-size:.95rem}' +
    'body.CS-box .card .btn.sm{padding:7px 12px;font-size:.74rem}' +
    'body.CS-box .fv{width:32px;height:32px;top:8px;right:8px}';

  /* arrows for the tile slider (runs inside the generated page) */
  function rt() {
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-gxn]') : null;
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      var g = document.querySelector('.grid'), c = g && g.querySelector('.card'); if (!g || !c) return;
      g.scrollBy({ left: (+b.getAttribute('data-gxn')) * (c.getBoundingClientRect().width + 16), behavior: 'smooth' });
    }, true);
  }

  function enhance(html, style) {
    var out = html;
    out = out.replace('</style></head>', function () { return CSS + '</style></head>'; });
    if (!style) return out;
    out = out.replace('<body class="', function () { return '<body class="CS-' + style + ' '; });
    if (style === 'tile') {
      out = out.replace(/<div class="cb">(<span class="tag">[^<]*<\/span>)?/g, function (m, tag) { return '<div class="cb">' + (tag || '') + '<div class="cbt">'; });
      out = out.replace(/<\/div><\/div><\/article>/g, '</div></div></div></article>');
      out = out.replace('<p class="gx-empty"', function () { return '<div class="gx-nav"><button type="button" data-gxn="-1" aria-label="Previous">←</button><button type="button" data-gxn="1" aria-label="Next">→</button></div><p class="gx-empty"'; });
      var end = out.lastIndexOf('</body>');
      if (end > -1) out = out.slice(0, end) + '<script>(' + rt.toString() + ')();<\/script>' + out.slice(end);
    }
    return out;
  }

  var prev = GS.buildDocument;
  GS.buildDocument = function (cfg, data, opts) {
    var html = prev(cfg, data, opts);
    opts = opts || {};
    var st = clean(cfg && cfg.cardStyle);
    GS.__cs = st;
    paint();
    if (opts.mini) return html;
    try { return enhance(html, st); } catch (e) { return html; }
  };
  GS.enhanceCards = enhance;

  /* ---------- editor control (only exists on website-generator.html) ---------- */
  var panel = root.document && root.document.getElementById('panel');
  function paint() {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll('[data-gxcs]'), function (b) { b.classList.toggle('on', b.getAttribute('data-gxcs') === (GS.__cs || '')); });
  }
  function inject() {
    var d = panel.querySelector('details.acc[data-k="offs"] > div');
    if (!d || d.querySelector('.gx-cs')) return;
    d.insertAdjacentHTML('afterbegin',
      '<div class="fld gx-cs"><span>Card style</span><div class="chips">' +
      STYLES.map(function (s) { return '<button type="button" class="chip" data-gxcs="' + s[0] + '">' + s[1] + '</button>'; }).join('') +
      '</div></div><input type="hidden" id="gxcsv" data-f="cardStyle" value="">');
    paint();
  }
  if (panel && root.MutationObserver) {
    new MutationObserver(inject).observe(panel, { childList: true });
    panel.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-gxcs]') : null;
      if (!b) return;
      var v = b.getAttribute('data-gxcs'), i = panel.querySelector('#gxcsv'); if (!i) return;
      GS.__cs = v; i.value = v;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      paint();
    });
    inject();
  }
})(typeof window !== 'undefined' ? window : this);
