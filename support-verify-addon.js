/* GLIME support verification code (dashboard).
   When a client taps any "WhatsApp Support" link, this asks the server for a one-time
   10-letter code. The server also sends the same code to the GLIME admin on Telegram,
   so the admin can match the WhatsApp message with the Telegram message.
   If the code cannot be created, WhatsApp still opens normally so the client is never blocked. */
(function () {
  'use strict';
  var SUPPORT_NUMBER = '918504926242';
  var SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var ENDPOINT = SUPABASE_URL + '/functions/v1/glime-support-code';
  var busy = false;

  function isSupportLink(a) {
    return !!(a && a.href && a.href.indexOf('https://wa.me/' + SUPPORT_NUMBER) === 0);
  }

  function messageText(href) {
    try { return new URL(href).searchParams.get('text') || ''; } catch (e) { return ''; }
  }

  function withCode(href, code) {
    var t = messageText(href);
    var line = 'Verify Code: ' + code;
    if (t.indexOf('\n\nMessage:') > -1) t = t.replace('\n\nMessage:', '\n' + line + '\n\nMessage:');
    else t = t + (t ? '\n' : '') + line;
    return 'https://wa.me/' + SUPPORT_NUMBER + '?text=' + encodeURIComponent(t);
  }

  function getToken() {
    try {
      if (typeof supabaseClient !== 'undefined' && supabaseClient.auth) {
        return supabaseClient.auth.getSession().then(function (r) {
          return (r && r.data && r.data.session && r.data.session.access_token) || '';
        });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve('');
  }

  function requestCode(reason) {
    return getToken().then(function (token) {
      if (!token) return '';
      var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
      return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ reason: reason || '' }),
        signal: ctl ? ctl.signal : undefined
      }).then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (d) { return d && d.ok && /^[A-Z2-9]{10}$/.test(d.code || '') ? d.code : ''; })
        .finally(function () { if (timer) clearTimeout(timer); });
    }).catch(function () { return ''; });
  }

  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest('a') : null;
    if (!isSupportLink(a)) return;
    ev.preventDefault();
    if (busy) return;
    busy = true;

    var href = a.href;
    var m = /Support code:\s*(\S+)/.exec(messageText(href));
    var reason = m ? 'Error support code ' + m[1] : '';

    /* Open the tab right now (inside the tap) so the browser does not block it. */
    var w = null;
    try {
      w = window.open('about:blank', '_blank');
      if (w && w.document) w.document.write('<meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:sans-serif;padding:24px">Opening WhatsApp&hellip;</p>');
    } catch (e) { w = null; }

    requestCode(reason).then(function (code) {
      var url = code ? withCode(href, code) : href;
      busy = false;
      if (w && !w.closed) { w.location.href = url; } else { window.location.href = url; }
    });
  }, true);
})();
