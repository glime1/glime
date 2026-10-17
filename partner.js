/* =========================================================
   GLIME PARTNER LANDING PAGE
   - fills program numbers from partner-config.js
   - earnings estimator
   - "Continue with Google" sign-up / sign-in
========================================================= */
(function () {
  "use strict";

  var C = window.GLIME_PARTNER;
  if (!C) return;
  var P = C.program, U = C.util;

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- fill program numbers ---------- */
  var maxRate = P.tiers[P.tiers.length - 1].rate;
  var values = {
    recurringMonths: P.recurringMonths,
    cookieDays: P.cookieDays,
    holdDays: P.holdDays,
    minPayout: U.inr(P.minPayout),
    payoutDayOrd: ordinal(P.payoutDay),
    maxRate: maxRate
  };
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var k = el.getAttribute("data-cfg");
    if (values[k] != null) el.textContent = values[k];
  });

  /* ---------- tier cards ---------- */
  var tierWrap = document.getElementById("tierCards");
  if (tierWrap) {
    tierWrap.innerHTML = P.tiers.map(function (t, i) {
      var req = t.minCustomers === 0
        ? "From your first customer"
        : t.minCustomers + "+ active paying customers";
      var top = i === P.tiers.length - 1 ? " top" : "";
      return '<article class="tier' + top + '">' +
        "<h3>" + U.esc(t.name) + "</h3>" +
        '<p class="rate">' + t.rate + "%</p>" +
        '<p class="req">' + U.esc(req) + "</p>" +
        "<ul><li>Recurring for " + P.recurringMonths + " months</li>" +
        "<li>Paid monthly</li><li>Dashboard reporting</li></ul></article>";
    }).join("");
  }

  /* ---------- earnings estimator ---------- */
  var planSel = document.getElementById("calcPlan");
  var range = document.getElementById("calcCustomers");
  if (planSel && range) {
    planSel.innerHTML = P.plans.map(function (p) {
      return '<option value="' + U.esc(p.key) + '">' + U.esc(p.name) + " · " + U.inr(p.monthly) + "/month</option>";
    }).join("");

    var calc = function () {
      var n = Number(range.value) || 0;
      var plan = P.plans.filter(function (p) { return p.key === planSel.value; })[0] || P.plans[0];
      var tier = U.tierFor(n);
      var monthly = n * plan.monthly * tier.rate / 100;
      document.getElementById("calcCustomersOut").textContent = n;
      document.getElementById("calcTier").textContent = tier.name;
      document.getElementById("calcRate").textContent = tier.rate;
      document.getElementById("calcMonthly").textContent = U.inr(Math.round(monthly));
      document.getElementById("calcYear").textContent = U.inr(Math.round(monthly * P.recurringMonths));
    };
    range.addEventListener("input", calc);
    planSel.addEventListener("change", calc);
    calc();
  }

  /* ---------- Google sign-in ---------- */
  var sb = null;
  try {
    if (window.supabase && C.supabaseUrl) {
      sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
      });
    }
  } catch (e) { sb = null; }

  var buttons = document.querySelectorAll(".js-google-signin");
  var labels = document.querySelectorAll(".js-google-label");
  var msg = document.querySelector(".js-join-msg");
  var note = document.querySelector(".js-session-note");
  var noteEmail = document.querySelector(".js-session-email");
  var switchBtn = document.querySelector(".js-switch-account");
  var hasSession = false;

  function dashboardUrl() {
    return new URL(C.pages.dashboard, window.location.href).href;
  }
  function setLabel(text) { labels.forEach(function (l) { l.textContent = text; }); }
  function setBusy(busy) { buttons.forEach(function (b) { b.disabled = !!busy; }); }
  function showMsg(text) {
    if (!msg) return;
    msg.textContent = text;
    msg.hidden = !text;
  }

  /* An OAuth failure comes back to this page with an error in the URL. */
  (function readOAuthError() {
    var q = new URLSearchParams(window.location.search);
    var h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    var d = q.get("error_description") || h.get("error_description");
    if (d) {
      showMsg("Google sign-in could not be completed: " + d.replace(/\+/g, " ") + ". Please try again.");
      try { history.replaceState(null, "", window.location.pathname); } catch (e) {}
    }
  })();

  async function checkSession() {
    if (!sb) return;
    try {
      var res = await sb.auth.getSession();
      var s = res && res.data && res.data.session;
      if (s && s.user) {
        hasSession = true;
        setLabel("Open my partner dashboard");
        if (note) {
          note.hidden = false;
          if (noteEmail) noteEmail.textContent = s.user.email || "your account";
        }
      }
    } catch (e) { /* stay on the sign-in state */ }
  }

  async function startGoogle() {
    showMsg("");
    if (!sb) {
      showMsg("Sign-in is not available right now. Please refresh the page and try again.");
      return;
    }
    if (hasSession) {
      window.location.href = dashboardUrl();
      return;
    }
    setBusy(true);
    setLabel("Opening Google...");
    try {
      try { localStorage.setItem("glime_partner_intent", "1"); } catch (e) {}
      var res = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: dashboardUrl(),
          queryParams: { prompt: "select_account" }
        }
      });
      if (res && res.error) throw res.error;
      /* On success the browser is redirected to Google. */
    } catch (err) {
      console.error("Partner Google sign-in error:", err);
      showMsg("We could not start Google sign-in. Please check your connection and try again.");
      setBusy(false);
      setLabel(hasSession ? "Open my partner dashboard" : "Continue with Google");
    }
  }

  buttons.forEach(function (b) { b.addEventListener("click", startGoogle); });

  if (switchBtn) {
    switchBtn.addEventListener("click", async function () {
      try { await sb.auth.signOut(); } catch (e) {}
      hasSession = false;
      if (note) note.hidden = true;
      setLabel("Continue with Google");
    });
  }

  /* If the browser restores this page from the back/forward cache after
     the Google redirect, make sure the buttons are usable again. */
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) {
      setBusy(false);
      setLabel(hasSession ? "Open my partner dashboard" : "Continue with Google");
    }
  });

  checkSession();
})();
