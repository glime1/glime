/* =========================================================
   GLIME — WhatsApp connect hardening (Coexistence is KEPT)
   ---------------------------------------------------------
   Problem seen in production: after Meta shows "Your account is
   connected to GLIME" the page never called the backend
   (whatsapp-connection / action "complete"), so nothing was saved.

   What this file changes (same Meta config as before:
   featureType = whatsapp_business_app_onboarding, sessionInfoVersion = 3):
   1. The Meta SDK and the one-time signup state are prepared BEFORE the
      tap on "Continue with Meta", so FB.login() runs directly inside
      the tap. Browsers block or detach a popup that is opened after
      a network wait, and then the result never comes back.
   2. Every step shows its real result in the connect dialog (Meta
      cancel / error events, "no code returned", server error text)
      instead of failing silently.
   3. Meta messages from m.facebook.com / business.facebook.com are
      accepted too (the old check only allowed www / web).
   4. If Meta returns to this page with ?code=..., the pending signup
      is completed from that code.
   Backend, token handling and the rest of the page are not changed.
   ========================================================= */
(function () {
  'use strict';
  if (window.__glimeWaConnectFix) return;
  window.__glimeWaConnectFix = true;

  var FB_APP_ID = '1682940610216509';   /* same value as whatsapp-sales-specialist.js */
  var FB_VERSION = 'v26.0';             /* same value as whatsapp-sales-specialist.js */
  var LS_KEY = 'glime_wa_connect_attempt';
  var LOG_KEY = 'glime_wa_connect_log';
  var MAX_AGE = 9 * 60 * 1000;          /* the server state lives 10 minutes */

  var prep = null;
  var prepping = null;
  var sdkPromise = null;
  var fbInited = false;
  var callbackFired = false;
  var completing = false;
  var finishWatch = null;
  var info = { coexistence: false, waba_id: null, phone_number_id: null, finished: false };

  function $(id) { return document.getElementById(id); }
  function noop() {}
  function errText(e) {
    return String((e && e.message) || e || 'Something went wrong').replace(/^[A-Z][A-Z_]{3,}:\s*/, '');
  }
  function log(t) {
    try {
      var a = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      a.push(new Date().toISOString().slice(11, 19) + ' ' + t);
      localStorage.setItem(LOG_KEY, JSON.stringify(a.slice(-30)));
    } catch (e) {}
    try { console.info('[GLIME WA connect]', t); } catch (e) {}
  }
  function say(t, bad) {
    var el = $('connectStatus');
    if (el) { el.textContent = t; el.style.color = bad ? '#ff6472' : ''; }
    log(t);
  }
  function resetBtn(label) {
    var b = $('startConnect');
    if (!b) return;
    b.disabled = false;
    if (label) b.textContent = label;
  }
  function fresh(p) { return !!p && Date.now() - p.at < MAX_AGE; }
  function saveAttempt(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ state: state, at: Date.now(), info: info }));
    } catch (e) {}
  }
  function backend(body) {
    var G = window.GWA;
    if (!G || typeof G.fn !== 'function') {
      return Promise.reject(new Error('GLIME is still loading. Please try again in a moment.'));
    }
    return G.fn('whatsapp-connection', body);
  }

  /* ---- Meta SDK (loaded early, initialised once) ---- */
  function initFb() {
    if (fbInited || !window.FB) return;
    try {
      window.FB.init({ appId: FB_APP_ID, cookie: true, xfbml: false, version: FB_VERSION });
      fbInited = true;
    } catch (e) { log('FB.init failed: ' + errText(e)); }
  }
  function loadSdk() {
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      if (window.FB && window.FB.login) { initFb(); resolve(); return; }
      var previous = window.fbAsyncInit;
      window.fbAsyncInit = function () {
        try { if (typeof previous === 'function') previous(); } catch (e) {}
        initFb();
        resolve();
      };
      var s = document.createElement('script');
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.onerror = function () {
        sdkPromise = null;
        reject(new Error('Could not load the Meta SDK. Check your connection and try again.'));
      };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  /* ---- one-time signup state from the backend ---- */
  function prepare(force) {
    if (!force && fresh(prep)) return Promise.resolve(prep);
    if (!force && prepping) return prepping;
    prepping = backend({ action: 'start' }).then(function (d) {
      prepping = null;
      if (!d || !d.state || !d.config_id) throw new Error('Meta configuration is missing on the server.');
      prep = { state: d.state, config_id: d.config_id, at: Date.now() };
      return prep;
    }, function (e) {
      prepping = null;
      throw e;
    });
    return prepping;
  }
  function ready() {
    return !!(window.FB && window.FB.login && fbInited && fresh(prep));
  }

  /* ---- finish: send the one-time code to the backend ---- */
  function complete(code, state) {
    if (completing) return;
    completing = true;
    clearTimeout(finishWatch);
    say('Verifying Meta connection…');
    backend({
      action: 'complete',
      code: code,
      state: state,
      waba_id: info.waba_id,
      phone_number_id: info.phone_number_id,
      coexistence: info.coexistence
    }).then(function () {
      say('WhatsApp connected successfully.');
      try { localStorage.removeItem(LS_KEY); } catch (e) {}
      setTimeout(function () { location.reload(); }, 800);
    }, function (e) {
      completing = false;
      prep = null;
      say(errText(e), true);
      resetBtn('Continue with Meta →');
    });
  }

  /* ---- open Meta signup directly inside the tap ---- */
  function launch() {
    var st = prep;
    prep = null; /* the state is single use */
    info = { coexistence: false, waba_id: null, phone_number_id: null, finished: false };
    callbackFired = false;
    saveAttempt(st.state);
    var btn = $('startConnect');
    if (btn) btn.disabled = true;
    say('Meta signup opened. Finish it there, then come back to this tab.');

    window.FB.login(function (resp) {
      callbackFired = true;
      var code = resp && resp.authResponse && resp.authResponse.code;
      log('FB.login callback status=' + (resp && resp.status) + ' code=' + (code ? 'yes' : 'no'));
      if (code) { complete(code, st.state); return; }
      if (info.finished) {
        say('Meta finished the signup but did not return the authorization code to this page. Keep this tab open and try again once.', true);
      } else {
        say('Meta signup was closed before it finished (status: ' + ((resp && resp.status) || 'none') + ').', true);
      }
      resetBtn('Continue with Meta →');
    }, {
      config_id: st.config_id,
      response_type: 'code',
      override_default_response_type: true,
      /* Coexistence — unchanged */
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
    });
  }

  function onStartTap() {
    if (completing) return;
    if (ready()) { launch(); return; }
    /* not ready yet: prepare now, then ask for one more tap so the popup
       is opened by the tap itself and is not blocked */
    var btn = $('startConnect');
    if (btn) btn.disabled = true;
    say('Preparing secure Meta signup…');
    Promise.all([loadSdk(), prepare(true)]).then(function () {
      resetBtn('Open Meta signup →');
      say('Ready. Tap "Open Meta signup" once more.');
    }, function (e) {
      resetBtn('Continue with Meta →');
      say(errText(e), true);
    });
  }

  /* the capture listener runs before the page's own click handler */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#startConnect') : null;
    if (!t) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    onStartTap();
  }, true);

  /* warm up when the connect dialog is opened */
  document.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('#connectBtn') : null;
    if (!t) return;
    loadSdk().catch(noop);
    prepare(false).catch(function (err) { log('prepare failed: ' + errText(err)); });
  });

  /* ---- Meta session events (waba, phone, coexistence, cancel, error) ---- */
  window.addEventListener('message', function (ev) {
    var host = '';
    try { host = new URL(ev.origin).hostname; } catch (e) { return; }
    if (host !== 'facebook.com' && !/\.facebook\.com$/.test(host)) return;
    var m = ev.data;
    try { if (typeof m === 'string') m = JSON.parse(m); } catch (e) { return; }
    if (!m || m.type !== 'WA_EMBEDDED_SIGNUP') return;
    var d = m.data || {};
    var evName = String(m.event || '');
    if (d.waba_id) info.waba_id = String(d.waba_id);
    if (d.phone_number_id) info.phone_number_id = String(d.phone_number_id);
    if (evName === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') info.coexistence = true;

    if (evName.indexOf('FINISH') === 0) {
      info.finished = true;
      log('Meta event ' + evName);
      clearTimeout(finishWatch);
      finishWatch = setTimeout(function () {
        if (callbackFired || completing) return;
        say('Meta finished the signup but did not return the authorization code to this page. Keep this tab open and try again once.', true);
        resetBtn('Continue with Meta →');
      }, 8000);
    } else if (evName === 'CANCEL') {
      say('Meta signup was cancelled at step: ' + (d.current_step || 'unknown') + '.', true);
      resetBtn('Continue with Meta →');
    } else if (evName === 'ERROR') {
      say('Meta reported an error: ' + (d.error_message || 'unknown') + (d.error_id ? ' (id ' + d.error_id + ')' : ''), true);
      resetBtn('Continue with Meta →');
    }
  });

  /* ---- Meta returned to this page with ?code=... (redirect instead of popup) ---- */
  function recoverFromUrl() {
    var code = null;
    try {
      var q = new URLSearchParams(location.search);
      var h = new URLSearchParams((location.hash || '').replace(/^#/, ''));
      code = q.get('code') || h.get('code');
      if (!code) return;
      var u = new URL(location.href);
      ['code', 'state', 'e2e', 'fb'].forEach(function (n) { u.searchParams.delete(n); });
      u.hash = '';
      history.replaceState({}, document.title, u.pathname + (u.search || ''));
    } catch (e) { return; }

    var a = null;
    try { a = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
    var modal = $('connectModal');
    if (modal) modal.classList.remove('hidden');
    if (!a || !a.state || Date.now() - a.at > MAX_AGE + 60000) {
      say('Meta returned to GLIME, but the signup session had expired. Tap Continue with Meta and try again.', true);
      return;
    }
    if (a.info) {
      info.waba_id = a.info.waba_id || null;
      info.phone_number_id = a.info.phone_number_id || null;
      info.coexistence = a.info.coexistence === true;
    }
    log('code received from URL');
    complete(code, a.state);
  }

  loadSdk().catch(noop);
  recoverFromUrl();
})();
