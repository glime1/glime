/* =========================================================
   GLIME PARTNER REFERRAL CAPTURE

   - Sees ?ref=CODE (and optional &src=tag) in the page URL and
     sends track_click to the glime-partner-api edge function.
   - Keeps the returned click_id together with its expires_at in
     localStorage ("glime_partner_click") until it is used or expires.
   - attribute(accessToken) sends that saved click_id for the
     signed-in client (action "attribute").

   Loaded on index.html (where the partner link opens) and signup.html.
   dashboard.html has its own small retry that reads the same key.
========================================================= */
(function () {
  "use strict";
  if (window.GlimePartnerReferral) return;

  var API = "https://ufoulgbiqgjriwapuopc.supabase.co/functions/v1/glime-partner-api";
  var APIKEY = "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";
  var KEY = "glime_partner_click";
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /* Answers from "attribute" that will never succeed later: stop retrying. */
  var FINAL = {
    REFERRAL_CLICK_NOT_FOUND: 1, REFERRAL_CLICK_EXPIRED: 1, REFERRAL_CLICK_ALREADY_USED: 1,
    PARTNER_NOT_ACTIVE: 1, PARTNER_SELF_REFERRAL_BLOCKED: 1, ACCOUNT_NOT_NEW: 1,
    ACCOUNT_TOO_OLD: 1, INVALID_CLICK_ID: 1
  };

  function cleanCode(v) {
    var c = String(v == null ? "" : v).trim().toUpperCase();
    return /^[A-Z0-9]{6,12}$/.test(c) ? c : "";
  }
  function cleanTag(v) {
    var t = String(v == null ? "" : v).trim().toLowerCase();
    return /^[a-z0-9-]{1,24}$/.test(t) ? t : "";
  }

  /* ---------- storage (every access is guarded) ---------- */
  function load() {
    try {
      var rec = JSON.parse(localStorage.getItem(KEY) || "null");
      if (rec && UUID.test(String(rec.click_id)) && Date.parse(rec.expires_at) > Date.now()) return rec;
      if (rec) localStorage.removeItem(KEY);
    } catch (e) {}
    return null;
  }
  function save(rec) {
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) {}
  }
  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function clearIfSame(clickId) {
    var cur = load();
    if (cur && cur.click_id === clickId) clear();
  }

  /* ---------- network ---------- */
  function post(body, token, ms) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms || 8000) : null;
    var headers = { "Content-Type": "application/json", apikey: APIKEY };
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(API, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { status: r.status, data: d || {} };
      });
    }).catch(function () {
      return { status: 0, data: {} };
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    });
  }

  function isOk(res) {
    return res.status >= 200 && res.status < 300 && res.data && res.data.ok === true;
  }

  /* ---------- track_click ---------- */
  function trackCode(code, tag) {
    code = cleanCode(code);
    if (!code) return Promise.resolve({ ok: false, error: "INVALID_REFERRAL_CODE" });
    tag = cleanTag(tag);
    var body = {
      action: "track_click",
      referral_code: code,
      landing_path: location.pathname || "/",
      referrer_url: document.referrer || ""
    };
    if (tag) body.tag = tag;
    return post(body).then(function (res) {
      var d = res.data;
      if (isOk(res) && UUID.test(String(d.click_id))) {
        var rec = { click_id: d.click_id, expires_at: d.expires_at, code: code, tag: tag, saved_at: new Date().toISOString() };
        save(rec);
        return { ok: true, record: rec };
      }
      return { ok: false, error: d.error || (res.status ? "HTTP_" + res.status : "NETWORK_ERROR") };
    });
  }

  /* ---------- read ?ref= from the URL ---------- */
  function capture() {
    var q;
    try { q = new URLSearchParams(window.location.search); } catch (e) { return Promise.resolve(load()); }
    var code = cleanCode(q.get("ref"));
    if (!code) return Promise.resolve(load());
    var cur = load();
    if (cur && cur.code === code) return Promise.resolve(cur); /* already tracked, do not count a reload twice */
    return trackCode(code, q.get("src")).then(function (r) { return r.ok ? r.record : load(); });
  }

  /* ---------- attribute ---------- */
  var inflight = null;
  function attribute(token) {
    if (inflight) return inflight;
    var rec = load();
    if (!rec || !token) return Promise.resolve({ skipped: true });
    inflight = post({ action: "attribute", click_id: rec.click_id }, token, 10000).then(function (res) {
      var d = res.data, r;
      if (isOk(res)) {
        clearIfSame(rec.click_id);
        r = { ok: true, already: d.already_attributed === true };
      } else {
        var code = String(d.error || "");
        if (FINAL[code]) clearIfSame(rec.click_id);
        r = { ok: false, error: code || (res.status ? "HTTP_" + res.status : "NETWORK_ERROR"), retry: !FINAL[code] };
      }
      inflight = null;
      return r;
    });
    return inflight;
  }

  window.GlimePartnerReferral = {
    ready: capture().catch(function () { return null; }),
    get: load,
    trackCode: trackCode,
    attribute: attribute,
    clear: clear,
    cleanCode: cleanCode
  };
})();
