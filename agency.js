/* =========================================================
   GLIME AGENCY — application page
   Google sign-in -> agency_apply RPC -> status.
   Numbers (tiers, plans) come from partner-config.js.
========================================================= */
(function () {
  "use strict";
  var C = window.GLIME_PARTNER;
  if (!C || !C.agency) return;
  var A = C.agency, U = C.util, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- Pricing table ---------- */
  $("agTiers").innerHTML = A.tiers.map(function (t, i) {
    var next = A.tiers[i + 1];
    var range = next ? t.minClients + " to " + (next.minClients - 1) : t.minClients + "+";
    return "<tr><td>" + esc(t.name) + "</td><td>" + range + '</td><td class="r">' + t.discount + "%</td></tr>";
  }).join("");
  $("agTerms").textContent = "Minimum wallet top-up " + U.inr(A.minTopup) +
    ". Low-balance warning below " + U.inr(A.lowBalance) +
    ". If the wallet stays empty for " + A.graceDays + " days, client accounts are paused until you top up.";

  /* ---------- Calculator ---------- */
  var plans = C.program.plans;
  $("cPlan").innerHTML = plans.map(function (p, i) {
    return '<option value="' + i + '">' + esc(p.name) + " (" + U.inr(p.monthly) + "/month list)</option>";
  }).join("");
  function tierForClients(n) {
    var cur = A.tiers[0];
    A.tiers.forEach(function (t) { if (n >= t.minClients) cur = t; });
    return cur;
  }
  var priceTouched = false;
  function calc() {
    var p = plans[Number($("cPlan").value)] || plans[0];
    var n = Number($("cClients").value) || 1;
    $("cClientsV").textContent = n;
    if (!priceTouched) $("cPrice").value = p.monthly;
    var price = Number($("cPrice").value) || 0;
    var t = tierForClients(n);
    var cost = Math.round(p.monthly * (1 - t.discount / 100) * 100) / 100;
    var m = price - cost;
    $("oTier").textContent = t.name + " · " + t.discount + "% off";
    $("oCost").textContent = U.inr(cost);
    $("oMargin").textContent = U.inr(m);
    $("oMonthly").textContent = U.inr(m * n);
    $("oYearly").textContent = U.inr(m * n * 12);
  }
  $("cPlan").addEventListener("change", function () { priceTouched = false; calc(); });
  $("cClients").addEventListener("input", calc);
  $("cPrice").addEventListener("input", function () { priceTouched = true; calc(); });
  calc();

  /* ---------- Apply flow ---------- */
  if (!window.supabase) {
    $("agLoading").hidden = true;
    $("agSignin").hidden = false;
    $("agGoogle").disabled = true;
    $("agSigninMsg").className = "f-msg err";
    $("agSigninMsg").textContent = "Sign-in could not load. Please check your connection and refresh.";
    return;
  }
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var user = null;

  var ERR = {
    TERMS_NOT_ACCEPTED: "Please accept the terms to continue.",
    INVALID_BUSINESS_NAME: "Company name should be 2 to 120 characters.",
    INVALID_PHONE: "Please enter a valid phone number (8 to 20 characters).",
    INVALID_CITY: "Please enter your city.",
    INVALID_PAN: "PAN looks wrong. Format: ABCDE1234F.",
    INVALID_GST: "GST number should be 15 characters.",
    INVALID_WEBSITE: "Website is too long.",
    ABOUT_TOO_LONG: "About text is too long (max 1000 characters).",
    INVALID_NAME: "Name is too long.",
    not_authenticated: "Your session expired. Please sign in again."
  };
  function errText(e) {
    var m = String((e && e.message) || "");
    for (var k in ERR) if (m.indexOf(k) > -1) return ERR[k];
    if (e && (e.code === "PGRST202" || e.code === "42883")) return "Applications are not open yet. Please try again soon.";
    return "Something went wrong. Please try again.";
  }

  function show(id) {
    ["agLoading", "agSignin", "agStatus", "agForm"].forEach(function (x) { $(x).hidden = x !== id; });
  }

  function statusView(a) {
    var s = a.status, code = a.code ? "<p><span class=\"chip info\">Agency code " + esc(a.code) + "</span></p>" : "";
    var html;
    if (s === "pending") {
      html = "<h3>Application under review</h3><p>Thank you, " + esc(a.business_name || "") + ". We will review your details and activate your agency account. You can check back here any time.</p>" + code +
        '<p><span class="chip warn">Pending review</span></p>';
    } else if (s === "active") {
      html = "<h3>You are approved</h3><p>Your agency account is active. Open the dashboard to add balance and your first client.</p>" + code +
        '<a class="btn btn-primary" href="' + esc(A.pages.dashboard) + '">Open agency dashboard</a>';
    } else if (s === "suspended") {
      html = "<h3>Account suspended</h3><p>" + esc(a.review_note || "Your agency account is currently suspended.") + '</p><a class="btn btn-ghost" href="contact.html">Contact GLIME</a>';
    } else {
      html = "<h3>Application not approved</h3><p>" + esc(a.review_note || "Your application could not be approved this time.") + "</p>" +
        '<button type="button" class="btn btn-primary" id="agReapply">Update details and apply again</button>';
    }
    $("agStatus").innerHTML = html;
    show("agStatus");
    var r = $("agReapply");
    if (r) r.addEventListener("click", function () { openForm(true); });
  }

  function openForm(again) {
    var m = user.user_metadata || {};
    $("agFormTitle").textContent = again ? "Update your details" : "Company details";
    $("agWho").textContent = "Signed in as " + (user.email || "");
    if (!$("fName").value) $("fName").value = m.full_name || m.name || "";
    show("agForm");
  }

  async function boot() {
    var res;
    try { res = await sb.auth.getSession(); } catch (e) { res = null; }
    var session = res && res.data && res.data.session;
    if (!session) { show("agSignin"); return; }
    user = session.user;
    try { history.replaceState(null, "", window.location.pathname + "#apply"); } catch (e) {}
    try {
      var r = await sb.rpc("agency_get_dashboard");
      if (r.error) throw r.error;
      var d = Array.isArray(r.data) ? r.data[0] : r.data;
      if (d && d.agency) statusView(d.agency); else openForm(false);
    } catch (e) {
      openForm(false);
    }
    var el = $("apply");
    if (el && /apply/.test(window.location.hash)) el.scrollIntoView();
  }

  $("agGoogle").addEventListener("click", async function () {
    var btn = this, msg = $("agSigninMsg");
    msg.className = "f-msg"; msg.textContent = "";
    btn.disabled = true;
    try {
      var r = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });
      if (r.error) throw r.error;
    } catch (e) {
      btn.disabled = false;
      msg.className = "f-msg err";
      msg.textContent = "Google sign-in could not start. Please try again.";
    }
  });

  $("agSignOut").addEventListener("click", async function () {
    try { await sb.auth.signOut(); } catch (e) {}
    window.location.reload();
  });

  $("agForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var msg = $("agMsg"), btn = $("agSubmit");
    msg.className = "f-msg"; msg.textContent = "";
    var v = function (id) { return $(id).value.trim(); };
    var biz = v("fBiz"), phone = v("fPhone"), city = v("fCity"), pan = v("fPan").toUpperCase(), gst = v("fGst").toUpperCase();
    var bad = "";
    if (biz.length < 2) bad = ERR.INVALID_BUSINESS_NAME;
    else if (phone.length < 8) bad = ERR.INVALID_PHONE;
    else if (city.length < 2) bad = ERR.INVALID_CITY;
    else if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) bad = ERR.INVALID_PAN;
    else if (gst && gst.length !== 15) bad = ERR.INVALID_GST;
    else if (!$("fTerms").checked) bad = ERR.TERMS_NOT_ACCEPTED;
    if (bad) { msg.className = "f-msg err"; msg.textContent = bad; return; }
    btn.disabled = true; btn.textContent = "Submitting...";
    try {
      var r = await sb.rpc("agency_apply", { p_details: {
        business_name: biz, contact_name: v("fName"), contact_phone: phone, city: city,
        website: v("fWeb"), about: v("fAbout"), pan: pan, gst: gst,
        terms_accepted: true, terms_version: A.termsVersion
      } });
      if (r.error) throw r.error;
      var d = Array.isArray(r.data) ? r.data[0] : r.data;
      statusView({ status: (d && d.status) || "pending", code: d && d.agency_code, business_name: biz });
    } catch (err) {
      msg.className = "f-msg err"; msg.textContent = errText(err);
    }
    btn.disabled = false; btn.textContent = "Submit application";
  });

  boot();
})();
