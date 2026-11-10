/* =========================================================
   GLIME - CLIENT ONBOARDING > QUICK BUTTONS BLOCK
   ---------------------------------------------------------
   Adds one block to the side column of client-onboarding.html:
     - a short line about Quick Buttons (0 AI tokens),
     - the client's saved menus (WhatsApp and Instagram), each with a
       Review button that opens a tappable test chat,
     - a link to Settings > Quick Buttons (settings.html#quick-buttons).
   Only REVIEW is shown here. Building and editing happens in Settings.
   Review is a simulation: nothing is sent to any customer and no
   tokens are used.

   This file does not touch the 8 onboarding steps or the progress
   ring, and it needs no change in client-onboarding.js. It follows the
   page language (English / Hindi) by watching the lang attribute of
   #ob, which client-onboarding.js already sets.

   Reads (RLS, the signed-in client only):
     client_data           client_id of the signed-in user
     client_quick_menus    the client's menus
     client_fixed_qa       question text, only to show the first bubble
========================================================= */
(function () {
  'use strict';

  var CFG = {
    SB_URL: 'https://ufoulgbiqgjriwapuopc.supabase.co',
    SB_KEY: 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA',
    SB_LIB: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js'
  };
  var LINK = 'settings.html#quick-buttons';
  var COLS = 'id,channel,name,trigger_qa_id,is_welcome,menu_type,header_text,body_text,footer_text,list_button_text,items,is_active,updated_at';

  var TX = {
    en: {
      title: 'Quick Buttons',
      free: '0 tokens',
      lead: 'Let customers tap a button instead of typing. Replies go out directly, so no AI tokens are used. Try your menus below like a customer.',
      review: '\u25B6 Review',
      open: 'Open Quick Buttons',
      empty: 'You have no menus yet. Open Quick Buttons to make your first one.',
      signin: 'Sign in to see your menus.',
      loading: 'Loading your menus\u2026',
      error: 'Could not load your menus. Please try again later.',
      off: 'Off',
      welcome: 'Welcome menu',
      wa: 'WhatsApp',
      ig: 'Instagram',
      restart: '\u21BA Start again',
      close: 'Close',
      cap: 'tap the buttons like a customer',
      foot: 'Test view only. Nothing is sent to any customer and no tokens are used.',
      nWelcome: 'The customer sends their first message (or writes after 24 hours of silence). Your welcome menu is sent.',
      nStandalone: 'This menu opens from a button in another menu. It is shown here on its own.',
      nHuman: 'The chat is handed over to your team.',
      nMissing: 'The menu this button should open was not found. Edit the button in Quick Buttons.',
      nLink: "The customer's phone opens this link: ",
      noLink: '(no link set)',
      defaultQ: 'A question that matches your Fixed Q&A',
      defaultList: 'Choose option',
      review2: 'Review'
    },
    hi: {
      title: '\u0915\u094D\u0935\u093F\u0915 \u092C\u091F\u0928',
      free: '0 \u091F\u094B\u0915\u0928',
      lead: '\u0917\u094D\u0930\u093E\u0939\u0915 \u091F\u093E\u0907\u092A \u0915\u0930\u0928\u0947 \u0915\u0940 \u091C\u0917\u0939 \u092C\u091F\u0928 \u0926\u092C\u093E \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964 \u091C\u0935\u093E\u092C \u0938\u0940\u0927\u0947 \u091A\u0932\u093E \u091C\u093E\u0924\u093E \u0939\u0948, \u0907\u0938\u0932\u093F\u090F \u0915\u094B\u0908 AI \u091F\u094B\u0915\u0928 \u0928\u0939\u0940\u0902 \u0932\u0917\u0924\u093E\u0964 \u0928\u0940\u091A\u0947 \u0905\u092A\u0928\u0947 \u092E\u0947\u0928\u094D\u092F\u0942 \u0915\u094B \u0917\u094D\u0930\u093E\u0939\u0915 \u0915\u0940 \u0924\u0930\u0939 \u0906\u091C\u093C\u092E\u093E\u0915\u0930 \u0926\u0947\u0916\u093F\u090F\u0964',
      review: '\u25B6 \u0930\u093F\u0935\u094D\u092F\u0942',
      open: '\u0915\u094D\u0935\u093F\u0915 \u092C\u091F\u0928 \u0916\u094B\u0932\u093F\u090F',
      empty: '\u0905\u092D\u0940 \u0906\u092A\u0915\u093E \u0915\u094B\u0908 \u092E\u0947\u0928\u094D\u092F\u0942 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964 \u092A\u0939\u0932\u093E \u092E\u0947\u0928\u094D\u092F\u0942 \u092C\u0928\u093E\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0915\u094D\u0935\u093F\u0915 \u092C\u091F\u0928 \u0916\u094B\u0932\u093F\u090F\u0964',
      signin: '\u0905\u092A\u0928\u0947 \u092E\u0947\u0928\u094D\u092F\u0942 \u0926\u0947\u0916\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0938\u093E\u0907\u0928 \u0907\u0928 \u0915\u0940\u091C\u093F\u090F\u0964',
      loading: '\u0906\u092A\u0915\u0947 \u092E\u0947\u0928\u094D\u092F\u0942 \u0932\u094B\u0921 \u0939\u094B \u0930\u0939\u0947 \u0939\u0948\u0902\u2026',
      error: '\u092E\u0947\u0928\u094D\u092F\u0942 \u0932\u094B\u0921 \u0928\u0939\u0940\u0902 \u0939\u094B \u0938\u0915\u0947\u0964 \u0915\u0943\u092A\u092F\u093E \u0925\u094B\u0921\u093C\u0940 \u0926\u0947\u0930 \u092C\u093E\u0926 \u092B\u093F\u0930 \u0915\u094B\u0936\u093F\u0936 \u0915\u0940\u091C\u093F\u090F\u0964',
      off: '\u092C\u0902\u0926',
      welcome: '\u0935\u0947\u0932\u0915\u092E \u092E\u0947\u0928\u094D\u092F\u0942',
      wa: 'WhatsApp',
      ig: 'Instagram',
      restart: '\u21BA \u092B\u093F\u0930 \u0938\u0947 \u0936\u0941\u0930\u0942',
      close: '\u092C\u0902\u0926 \u0915\u0930\u0947\u0902',
      cap: '\u0917\u094D\u0930\u093E\u0939\u0915 \u0915\u0940 \u0924\u0930\u0939 \u092C\u091F\u0928 \u0926\u092C\u093E\u0915\u0930 \u0926\u0947\u0916\u093F\u090F',
      foot: '\u0938\u093F\u0930\u094D\u092B\u093C \u091F\u0947\u0938\u094D\u091F: \u0915\u093F\u0938\u0940 \u0917\u094D\u0930\u093E\u0939\u0915 \u0915\u094B \u0915\u0941\u091B \u0928\u0939\u0940\u0902 \u092D\u0947\u091C\u093E \u091C\u093E\u0924\u093E \u0914\u0930 \u0915\u094B\u0908 \u091F\u094B\u0915\u0928 \u0928\u0939\u0940\u0902 \u0932\u0917\u0924\u093E\u0964',
      nWelcome: '\u0917\u094D\u0930\u093E\u0939\u0915 \u0915\u093E \u092A\u0939\u0932\u093E \u092E\u0948\u0938\u0947\u091C \u0906\u0924\u093E \u0939\u0948 (\u092F\u093E 24 \u0918\u0902\u091F\u0947 \u0915\u0940 \u091A\u0941\u092A\u094D\u092A\u0940 \u0915\u0947 \u092C\u093E\u0926 \u0932\u093F\u0916\u0924\u093E \u0939\u0948)\u0964 \u0906\u092A\u0915\u093E \u0935\u0947\u0932\u0915\u092E \u092E\u0947\u0928\u094D\u092F\u0942 \u091C\u093E\u0924\u093E \u0939\u0948\u0964',
      nStandalone: '\u092F\u0939 \u092E\u0947\u0928\u094D\u092F\u0942 \u0915\u093F\u0938\u0940 \u0926\u0942\u0938\u0930\u0947 \u092E\u0947\u0928\u094D\u092F\u0942 \u0915\u0947 \u092C\u091F\u0928 \u0938\u0947 \u0916\u0941\u0932\u0924\u093E \u0939\u0948\u0964 \u092F\u0939\u093E\u0901 \u0905\u0915\u0947\u0932\u093E \u0926\u093F\u0916\u093E\u092F\u093E \u0917\u092F\u093E \u0939\u0948\u0964',
      nHuman: '\u091A\u0948\u091F \u0906\u092A\u0915\u0940 \u091F\u0940\u092E \u0915\u094B \u0926\u0947 \u0926\u0940 \u0917\u0908\u0964',
      nMissing: '\u0907\u0938 \u092C\u091F\u0928 \u0938\u0947 \u091C\u094B \u092E\u0947\u0928\u094D\u092F\u0942 \u0916\u0941\u0932\u0928\u093E \u0939\u0948 \u0935\u0939 \u0928\u0939\u0940\u0902 \u092E\u093F\u0932\u093E\u0964 \u0915\u094D\u0935\u093F\u0915 \u092C\u091F\u0928 \u092E\u0947\u0902 \u091C\u093E\u0915\u0930 \u092C\u091F\u0928 \u0920\u0940\u0915 \u0915\u0940\u091C\u093F\u090F\u0964',
      nLink: '\u0917\u094D\u0930\u093E\u0939\u0915 \u0915\u0947 \u092B\u093C\u094B\u0928 \u092E\u0947\u0902 \u092F\u0939 \u0932\u093F\u0902\u0915 \u0916\u0941\u0932\u0947\u0917\u093E: ',
      noLink: '(\u0932\u093F\u0902\u0915 \u0928\u0939\u0940\u0902 \u0939\u0948)',
      defaultQ: '\u0906\u092A\u0915\u0947 Fixed Q&A \u0938\u0947 \u092E\u093F\u0932\u0924\u093E \u0938\u0935\u093E\u0932',
      defaultList: 'Choose option',
      review2: '\u0930\u093F\u0935\u094D\u092F\u0942'
    }
  };

  var S = { status: 'loading', menus: [], faqs: {} };
  var BLOCK = null;
  var RV = null; // overlay element
  var RVS = null; // { menuId, ch, steps, list }

  function lang() {
    var ob = document.getElementById('ob');
    return ob && ob.getAttribute('lang') === 'hi' ? 'hi' : 'en';
  }
  function T() { return TX[lang()]; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function chOf(m) { return m && m.channel === 'instagram' ? 'instagram' : 'whatsapp'; }
  function chLabel(ch) { return ch === 'instagram' ? T().ig : T().wa; }

  /* ---------------------------------------------------------
     STYLES
  --------------------------------------------------------- */
  function injectStyles() {
    if (document.getElementById('obqStyles')) return;
    var st = document.createElement('style');
    st.id = 'obqStyles';
    st.textContent = [
      '.obq-tag{display:inline-block;margin-left:6px;padding:2px 10px;border-radius:999px;background:linear-gradient(105deg,var(--ob-g1),var(--ob-g2));color:var(--ob-on);font-size:.72rem;font-weight:800;vertical-align:middle}',
      '.obq-mut{margin:0 0 14px;color:var(--ob-mut);font-size:.86rem}',
      '.obq-list{list-style:none;margin:0 0 16px;padding:0;max-height:340px;overflow:auto}',
      '.obq-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--ob-line)}',
      '.obq-row:first-child{border-top:0}',
      '.obq-row strong{display:block;font-size:.88rem;font-weight:700;word-break:break-word}',
      '.obq-pills{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:3px}',
      '.obq-pill{display:inline-block;padding:1px 9px;border:1px solid var(--ob-line);border-radius:999px;font-size:.7rem;font-weight:700;color:var(--ob-mut)}',
      '.obq-pill.ig{color:#d62976;border-color:rgba(214,41,118,.5)}',
      '.obq-pill.wa{color:#128c7e;border-color:rgba(18,140,126,.5)}',
      '.obq-sm{min-height:38px;padding:0 14px;font-size:.8rem}',
      '.ob .obq-sm{flex:0 0 auto}',

      /* review overlay (always dark, like a phone) */
      '.obq-rv{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.74);display:flex;align-items:center;justify-content:center;padding:14px;color:#eaf3f8;font-family:"Manrope","Noto Sans Devanagari",system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}',
      '.obq-rv *{box-sizing:border-box}',
      '.obq-box{background:#0f1a26;border:1px solid rgba(255,255,255,.18);border-radius:20px;width:100%;max-width:440px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}',
      '.obq-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.18)}',
      '.obq-top b{font-size:.84rem;line-height:1.3;word-break:break-word}',
      '.obq-tools{display:flex;gap:6px;flex:none}',
      '.obq-tb{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:transparent;color:#fff;font:inherit;font-size:.74rem;font-weight:800;cursor:pointer}',
      '.obq-scroll{overflow:auto;padding:12px 14px;flex:1}',
      '.obq-foot{padding:10px 14px;border-top:1px solid rgba(255,255,255,.18);font-size:.68rem;color:rgba(255,255,255,.68);line-height:1.5}',
      '.obq-phone{background:#0b141a;border:1px solid rgba(255,255,255,.18);border-radius:22px;padding:14px;min-height:240px}',
      '.obq-phone.ig{background:#000;border-color:rgba(255,255,255,.14)}',
      '.obq-cap{font-size:.64rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.5);margin:0 0 8px}',
      '.obq-msg{margin-bottom:8px}',
      '.obq-bub{background:#1f2c34;border-radius:12px 12px 12px 4px;padding:9px 12px;max-width:96%;font-size:.8rem;word-break:break-word}',
      '.obq-phone.ig .obq-bub{background:#262626;border-radius:20px 20px 20px 6px}',
      '.obq-h{font-weight:800;margin-bottom:4px}',
      '.obq-b{white-space:pre-wrap}',
      '.obq-f{font-size:.68rem;color:rgba(255,255,255,.55);margin-top:6px}',
      '.obq-out{margin:8px 0 8px auto;width:fit-content;max-width:80%;background:#005c4b;border-radius:12px 12px 4px 12px;padding:8px 12px;font-size:.8rem;word-break:break-word;white-space:pre-wrap}',
      '.obq-phone.ig .obq-out{background:#3797f0}',
      '.obq-in{background:#1f2c34;border-radius:12px 12px 12px 4px;padding:9px 12px;max-width:96%;margin-bottom:6px;font-size:.8rem;white-space:pre-wrap;word-break:break-word}',
      '.obq-phone.ig .obq-in{background:#262626;border-radius:20px 20px 20px 6px}',
      '.obq-note{margin:10px auto;width:fit-content;max-width:94%;text-align:center;font-size:.7rem;line-height:1.5;color:rgba(255,255,255,.78);border:1px dashed rgba(255,255,255,.3);border-radius:10px;padding:6px 10px;word-break:break-word}',
      '.obq-btn{display:block;width:96%;margin-top:6px;border:1px solid transparent;border-radius:10px;background:#1f2c34;color:#53bdeb;text-align:center;font-weight:800;font-size:.8rem;padding:10px;font-family:inherit;cursor:pointer;word-break:break-word}',
      '.obq-btn:disabled{opacity:.45;cursor:default}',
      '.obq-btn:not(:disabled):hover{border-color:#53bdeb}',
      '.obq-phone.ig .obq-btn{background:#363636;color:#fff}',
      '.obq-list2{background:#1f2c34;border-radius:12px;margin-top:8px;padding:6px 10px;width:96%}',
      '.obq-sec{font-size:.68rem;font-weight:800;color:#25d366;margin:8px 0 2px}',
      '.obq-opt{display:block;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,.08);color:#fff;padding:9px 0;font-size:.78rem;font-family:inherit;cursor:pointer}',
      '.obq-opt:last-child{border-bottom:0}',
      '.obq-opt small{display:block;color:rgba(255,255,255,.55);font-size:.68rem;margin-top:2px}',
      '.obq-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}',
      '.obq-chip{border:1px solid #8e5cff;background:transparent;color:#c4a8ff;border-radius:99px;padding:7px 14px;font-size:.78rem;font-weight:800;font-family:inherit;cursor:pointer;word-break:break-word}',
      '.obq-chip:disabled{opacity:.45;cursor:default}',
      '@media(max-width:640px){.obq-rv{padding:0;align-items:flex-end}.obq-box{max-width:none;max-height:96vh;border-radius:20px 20px 0 0}}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------------------------------------------------------
     THE BLOCK (side column)
  --------------------------------------------------------- */
  function rowHtml(m) {
    var t = T();
    var ch = chOf(m);
    return '<li class="obq-row"><div><strong>' + esc(m.name) + '</strong><div class="obq-pills">' +
      '<span class="obq-pill ' + (ch === 'instagram' ? 'ig' : 'wa') + '">' + esc(chLabel(ch)) + '</span>' +
      (m.is_welcome ? '<span class="obq-pill">' + esc(t.welcome) + '</span>' : '') +
      (m.is_active === false ? '<span class="obq-pill">' + esc(t.off) + '</span>' : '') +
      '</div></div><button type="button" class="ob-btn obq-sm" data-obq="review" data-id="' + esc(m.id) + '" aria-label="' + esc(t.review2 + ': ' + m.name) + '">' + esc(t.review) + '</button></li>';
  }

  function blockHtml() {
    var t = T();
    var body = '';
    if (S.status === 'loading') body = '<p class="obq-mut">' + esc(t.loading) + '</p>';
    else if (S.status === 'signedout') body = '<p class="obq-mut">' + esc(t.signin) + '</p>';
    else if (S.status === 'error') body = '<p class="obq-mut">' + esc(t.error) + '</p>';
    else if (S.status === 'ready') {
      body = S.menus.length
        ? '<ul class="obq-list">' + S.menus.map(rowHtml).join('') + '</ul>'
        : '<p class="obq-mut">' + esc(t.empty) + '</p>';
    }
    return '<h2>' + esc(t.title) + ' <span class="obq-tag">' + esc(t.free) + '</span></h2>' +
      '<p>' + esc(t.lead) + '</p>' + body +
      '<a class="ob-btn ob-pri" href="' + LINK + '">' + esc(t.open) + '</a>';
  }

  function renderBlock() {
    if (BLOCK) BLOCK.innerHTML = blockHtml();
  }

  /* ---------------------------------------------------------
     REVIEW (tappable test chat, nothing is sent to anyone)
  --------------------------------------------------------- */
  function startSteps(m) {
    var t = T();
    var steps = [];
    if (m.is_welcome) steps.push({ k: 'note', t: t.nWelcome });
    else if (m.trigger_qa_id) steps.push({ k: 'out', t: S.faqs[m.trigger_qa_id] || t.defaultQ });
    else steps.push({ k: 'note', t: t.nStandalone });
    steps.push({ k: 'menu', m: m });
    return steps;
  }

  function lastMenuIdx() {
    for (var n = RVS.steps.length - 1; n >= 0; n--) if (RVS.steps[n].k === 'menu') return n;
    return -1;
  }

  function menuHtml(m, active) {
    var ch = chOf(m);
    var type = m.menu_type;
    var items = Array.isArray(m.items) ? m.items : [];
    var dis = active ? '' : ' disabled';
    var out, i;

    if (ch === 'instagram') {
      var bub = '<div class="obq-bub"><div class="obq-b">' + esc(m.body_text) + '</div></div>';
      if (type === 'cta') {
        return bub + (items[0] ? '<button type="button" class="obq-btn" data-obq="tap" data-i="0"' + dis + '>\u2197 ' + esc(items[0].title) + '</button>' : '');
      }
      out = bub + '<div class="obq-chips">';
      for (i = 0; i < items.length; i++) out += '<button type="button" class="obq-chip" data-obq="tap" data-i="' + i + '"' + dis + '>' + esc(items[i].title) + '</button>';
      return out + '</div>';
    }

    var head = m.header_text ? '<div class="obq-h">' + esc(m.header_text) + '</div>' : '';
    var foot = m.footer_text ? '<div class="obq-f">' + esc(m.footer_text) + '</div>' : '';
    var wb = '<div class="obq-bub">' + head + '<div class="obq-b">' + esc(m.body_text) + '</div>' + foot + '</div>';

    if (type === 'list') {
      out = wb + '<button type="button" class="obq-btn" data-obq="list"' + dis + '>\u2630 ' + esc(m.list_button_text || T().defaultList) + '</button>';
      if (active && RVS.list) {
        var last = null;
        var rows = '';
        for (i = 0; i < items.length; i++) {
          var sec = (items[i].section || '').trim();
          if (sec && sec !== last) { rows += '<div class="obq-sec">' + esc(sec) + '</div>'; last = sec; }
          rows += '<button type="button" class="obq-opt" data-obq="tap" data-i="' + i + '">' + esc(items[i].title) +
            (items[i].description ? '<small>' + esc(items[i].description) + '</small>' : '') + '</button>';
        }
        out += '<div class="obq-list2">' + rows + '</div>';
      }
      return out;
    }
    if (type === 'cta') {
      return wb + (items[0] ? '<button type="button" class="obq-btn" data-obq="tap" data-i="0"' + dis + '>\u2197 ' + esc(items[0].title) + '</button>' : '');
    }
    out = wb;
    for (i = 0; i < items.length; i++) out += '<button type="button" class="obq-btn" data-obq="tap" data-i="' + i + '"' + dis + '>' + esc(items[i].title) + '</button>';
    return out;
  }

  function stepsHtml() {
    var li = lastMenuIdx();
    return RVS.steps.map(function (s, idx) {
      if (s.k === 'menu') return '<div class="obq-msg">' + menuHtml(s.m, idx === li) + '</div>';
      if (s.k === 'out') return '<div class="obq-out">' + esc(s.t) + '</div>';
      if (s.k === 'in') return '<div class="obq-in">' + esc(s.t) + '</div>';
      return '<div class="obq-note">' + esc(s.t) + '</div>';
    }).join('');
  }

  function renderReview() {
    if (!RV || !RVS) return;
    var t = T();
    var m = null;
    for (var n = 0; n < S.menus.length; n++) if (S.menus[n].id === RVS.menuId) m = S.menus[n];
    RV.innerHTML =
      '<div class="obq-box" role="dialog" aria-modal="true" aria-label="' + esc(t.review2) + '">' +
        '<div class="obq-top"><b>' + esc(t.review2) + ': ' + esc(m ? m.name : '') + ' \u00B7 ' + esc(chLabel(RVS.ch)) + '</b>' +
          '<div class="obq-tools">' +
            '<button type="button" class="obq-tb" data-obq="restart">' + esc(t.restart) + '</button>' +
            '<button type="button" class="obq-tb" data-obq="close" aria-label="' + esc(t.close) + '">\u2715</button>' +
          '</div></div>' +
        '<div class="obq-scroll"><div class="obq-phone ' + (RVS.ch === 'instagram' ? 'ig' : '') + '">' +
          '<div class="obq-cap">' + esc(chLabel(RVS.ch)) + ' \u00B7 ' + esc(t.cap) + '</div>' + stepsHtml() +
        '</div></div>' +
        '<div class="obq-foot">' + esc(t.foot) + '</div>' +
      '</div>';
    var sc = RV.querySelector('.obq-scroll');
    if (sc) sc.scrollTop = sc.scrollHeight;
  }

  function tap(n) {
    var li = lastMenuIdx();
    if (li < 0) return;
    var m = RVS.steps[li].m;
    var it = (m.items || [])[n];
    if (!it) return;
    var t = T();
    RVS.list = false;
    RVS.steps.push({ k: 'out', t: it.title });
    if (it.action === 'text') {
      RVS.steps.push({ k: 'in', t: it.reply_text || '' });
    } else if (it.action === 'human') {
      if (it.reply_text) RVS.steps.push({ k: 'in', t: it.reply_text });
      RVS.steps.push({ k: 'note', t: t.nHuman });
    } else if (it.action === 'menu') {
      var tgt = null;
      for (var i = 0; i < S.menus.length; i++) {
        if (S.menus[i].id === it.target_menu_id && chOf(S.menus[i]) === RVS.ch) tgt = S.menus[i];
      }
      if (tgt) RVS.steps.push({ k: 'menu', m: tgt });
      else RVS.steps.push({ k: 'note', t: t.nMissing });
    } else if (it.action === 'url') {
      RVS.steps.push({ k: 'note', t: t.nLink + (it.url || t.noLink) });
    }
    renderReview();
  }

  function onOverlayClick(e) {
    if (!RV) return;
    if (e.target === RV) return closeReview();
    var el = e.target.closest ? e.target.closest('[data-obq]') : null;
    if (!el || !RV.contains(el)) return;
    var a = el.getAttribute('data-obq');
    if (a === 'close') closeReview();
    else if (a === 'restart') {
      var m = null;
      for (var n = 0; n < S.menus.length; n++) if (S.menus[n].id === RVS.menuId) m = S.menus[n];
      if (m) { RVS.steps = startSteps(m); RVS.list = false; renderReview(); }
    } else if (a === 'list') {
      RVS.list = !RVS.list;
      renderReview();
    } else if (a === 'tap') {
      tap(Number(el.getAttribute('data-i')));
    }
  }

  function onKey(e) {
    if (e.key === 'Escape') closeReview();
  }

  function openReview(id) {
    var m = null;
    for (var n = 0; n < S.menus.length; n++) if (S.menus[n].id === id) m = S.menus[n];
    if (!m) return;
    closeReview();
    RVS = { menuId: m.id, ch: chOf(m), steps: startSteps(m), list: false };
    RV = document.createElement('div');
    RV.className = 'obq-rv';
    RV.addEventListener('click', onOverlayClick);
    document.body.appendChild(RV);
    document.addEventListener('keydown', onKey);
    renderReview();
  }

  function closeReview() {
    document.removeEventListener('keydown', onKey);
    if (RV) {
      RV.removeEventListener('click', onOverlayClick);
      if (RV.parentNode) RV.parentNode.removeChild(RV);
    }
    RV = null;
    RVS = null;
  }

  /* ---------------------------------------------------------
     DATA
  --------------------------------------------------------- */
  function getClient(cb) {
    var tries = 0;
    (function loop() {
      if (window.supabaseClient && window.supabaseClient.auth) { cb(window.supabaseClient); return; }
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        try { cb(window.supabase.createClient(CFG.SB_URL, CFG.SB_KEY)); return; } catch (e) { /* fall through */ }
      }
      if (tries === 6 && !window.supabase && !document.querySelector('script[src*="supabase-js"]')) {
        var s = document.createElement('script');
        s.src = CFG.SB_LIB;
        s.async = true;
        document.head.appendChild(s);
      }
      if (++tries < 40) { setTimeout(loop, 300); return; }
      cb(null);
    })();
  }

  function isMissing(e) {
    var code = String((e && (e.code || e.status)) || '');
    return ['42P01', '42703', 'PGRST205', '404'].indexOf(code) !== -1 ||
      /does not exist|schema cache|could not find the (table|column)/i.test(String((e && e.message) || ''));
  }

  function load(sb) {
    if (!sb) { S.status = 'error'; renderBlock(); return; }
    sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      if (!session) { S.status = 'signedout'; renderBlock(); return null; }
      return sb.from('client_data').select('client_id').eq('auth_user_id', session.user.id).maybeSingle().then(function (res) {
        if (res.error || !res.data || !res.data.client_id) throw res.error || new Error('no client');
        return sb.from('client_quick_menus').select(COLS).eq('client_id', res.data.client_id).order('updated_at', { ascending: false }).limit(100);
      }).then(function (res) {
        if (res.error) throw res.error;
        S.menus = res.data || [];
        var ids = [];
        S.menus.forEach(function (m) { if (m.trigger_qa_id && ids.indexOf(m.trigger_qa_id) === -1) ids.push(m.trigger_qa_id); });
        if (!ids.length) return null;
        return sb.from('client_fixed_qa').select('id,question').in('id', ids).then(function (q) {
          (q.data || []).forEach(function (f) { S.faqs[f.id] = f.question; });
          return null;
        }, function () { return null; });
      }).then(function () {
        S.status = 'ready';
        renderBlock();
      });
    }).catch(function (e) {
      console.warn('[GLIME onboarding quick buttons]', e);
      /* table not switched on yet: show only the intro and the link */
      S.status = isMissing(e) ? 'ready' : 'error';
      S.menus = [];
      renderBlock();
    });
  }

  /* ---------------------------------------------------------
     START
  --------------------------------------------------------- */
  function init() {
    var aside = document.querySelector('.ob-aside');
    if (!aside || document.getElementById('obqBlock')) return;
    injectStyles();

    BLOCK = document.createElement('section');
    BLOCK.className = 'ob-block';
    BLOCK.id = 'obqBlock';
    BLOCK.setAttribute('aria-label', 'Quick Buttons');
    /* after the AI knowledge template, before "Stuck on a step?" */
    aside.insertBefore(BLOCK, aside.children[1] || null);
    renderBlock();

    BLOCK.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-obq="review"]') : null;
      if (el) openReview(el.getAttribute('data-id'));
    });

    /* follow the page language */
    var ob = document.getElementById('ob');
    if (ob && window.MutationObserver) {
      new MutationObserver(function () {
        renderBlock();
        if (RV) renderReview();
      }).observe(ob, { attributes: true, attributeFilter: ['lang'] });
    }

    getClient(load);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
