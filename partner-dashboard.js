/* =========================================================
   GLIME PARTNER DASHBOARD
   - Google session guard (no session -> partner landing page)
   - loads partner data from the Supabase RPC `partner_get_dashboard`
   - renders Overview, Referral link, Referrals, Earnings, Payouts,
     Resources and Profile views
   See PARTNER_PROGRAM.md for the data contract.
========================================================= */
(function () {
  "use strict";

  var C = window.GLIME_PARTNER;
  if (!C || !window.supabase) return;
  var P = C.program, U = C.util, esc = U.esc;

  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  var $ = function (id) { return document.getElementById(id); };
  var state = { user: null, data: null, live: false, refFilter: "all", refQuery: "", tag: "" };
  var VIEWS = ["overview", "link", "referrals", "earnings", "payouts", "resources", "profile"];

  /* ---------------------------------------------------------
     Data
  --------------------------------------------------------- */
  function emptyData() {
    return {
      partner: { code: null, status: "active", tier: null, joined_at: null, payout: null },
      stats: {
        clicks: 0, signups: 0, active_customers: 0,
        pending_earnings: 0, available_balance: 0, lifetime_earnings: 0, paid_out: 0
      },
      referrals: [], earnings: [], payouts: []
    };
  }

  function normalize(raw) {
    var d = emptyData();
    if (raw && typeof raw === "object") {
      if (raw.partner && typeof raw.partner === "object") Object.assign(d.partner, raw.partner);
      if (raw.stats && typeof raw.stats === "object") Object.assign(d.stats, raw.stats);
      ["referrals", "earnings", "payouts"].forEach(function (k) {
        if (Array.isArray(raw[k])) d[k] = raw[k];
      });
    }
    return d;
  }

  function isMissingFn(err) {
    var m = String((err && err.message) || "");
    return !!err && (err.code === "PGRST202" || err.code === "42883" ||
      /could not find the function|does not exist|schema cache/i.test(m));
  }

  async function loadData() {
    try {
      var r = await sb.rpc("partner_get_dashboard");
      if (r.error) throw r.error;
      var raw = Array.isArray(r.data) ? r.data[0] : r.data;
      state.data = normalize(raw);
      state.live = true;
      banner("");
    } catch (err) {
      console.warn("partner_get_dashboard:", err);
      state.data = normalize(null);
      state.live = false;
      if (isMissingFn(err)) {
        banner("Welcome aboard! You are signed in as a GLIME partner. Your personal referral code, live clicks, sign-ups and earnings will appear here as soon as partner tracking is switched on for your account.", "");
      } else {
        banner("We could not load your latest numbers right now. Please refresh in a moment.", "warn");
      }
    }
  }

  function safeCode() {
    var c = state.data && state.data.partner && state.data.partner.code;
    return c && /^[A-Za-z0-9_-]{3,32}$/.test(String(c)) ? String(c) : null;
  }

  function referralUrl(tag) {
    var code = safeCode();
    if (!code) return "";
    var u = C.referralBase.replace(/\/?$/, "/") + "?ref=" + encodeURIComponent(code);
    if (tag) u += "&src=" + encodeURIComponent(tag);
    return u;
  }

  function currentTier() {
    var s = state.data.stats;
    var byCount = U.tierFor(Number(s.active_customers) || 0);
    var named = state.data.partner.tier;
    if (named) {
      var m = P.tiers.filter(function (t) { return t.name.toLowerCase() === String(named).toLowerCase(); })[0];
      if (m) return m;
    }
    return byCount;
  }

  function nextPayoutDate() {
    var now = new Date();
    var d = new Date(now.getFullYear(), now.getMonth(), P.payoutDay);
    if (now.getDate() >= P.payoutDay) d = new Date(now.getFullYear(), now.getMonth() + 1, P.payoutDay);
    return d;
  }

  function flag(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k) === "1";
      localStorage.setItem(k, v ? "1" : "0");
    } catch (e) {}
    return false;
  }

  /* ---------------------------------------------------------
     UI helpers
  --------------------------------------------------------- */
  function banner(text, kind) {
    var b = $("pdBanner");
    if (!text) { b.hidden = true; b.textContent = ""; return; }
    b.className = "pd-banner" + (kind ? " " + kind : "");
    b.textContent = text;
    b.hidden = false;
  }

  var toastTimer;
  function toast(text, isErr) {
    var t = $("pdToast");
    t.textContent = text;
    t.className = "pd-toast" + (isErr ? " err" : "");
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2800);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch (e2) { return false; }
    }
  }

  function chip(map, key) {
    var m = map[String(key || "").toLowerCase()];
    return m
      ? '<span class="chip ' + m[1] + '">' + m[0] + "</span>"
      : '<span class="chip">' + esc(key || "—") + "</span>";
  }
  var REF_STATUS = {
    signed_up: ["Signed up", "info"], trial: ["On trial", "warn"], active: ["Active", "ok"],
    churned: ["Churned", "bad"], refunded: ["Refunded", "bad"]
  };
  var EARN_STATUS = {
    pending: ["Pending", "warn"], available: ["Available", "ok"], paid: ["Paid", "info"], reversed: ["Reversed", "bad"]
  };
  var PAY_STATUS = { processing: ["Processing", "warn"], paid: ["Paid", "ok"], failed: ["Failed", "bad"] };

  function monthLabel(m, long) {
    var s = String(m || "");
    var d = new Date(s.length === 7 ? s + "-01" : s);
    if (isNaN(d)) return esc(s || "—");
    return d.toLocaleDateString("en-IN", long ? { month: "long", year: "numeric" } : { month: "short" });
  }

  function head(title, sub, actionHtml) {
    return '<div class="pd-h"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") +
      "</div>" + (actionHtml || "") + "</div>";
  }

  function stat(k, v, n, green) {
    return '<div class="pd-card pd-stat"><div class="k">' + esc(k) + '</div><div class="v' + (green ? " g" : "") + '">' + v +
      '</div><div class="n">' + n + "</div></div>";
  }

  /* ---------------------------------------------------------
     Views
  --------------------------------------------------------- */
  function vOverview() {
    var d = state.data, s = d.stats;
    var customers = Number(s.active_customers) || 0;
    var tier = currentTier(), next = U.nextTier(customers);
    var pct = 100, tierMsg = "You are on the top tier. Thank you for growing with GLIME.";
    if (next) {
      var span = next.minCustomers - tier.minCustomers || 1;
      pct = Math.max(4, Math.min(100, Math.round(((customers - tier.minCustomers) / span) * 100)));
      var need = next.minCustomers - customers;
      tierMsg = need + " more active paying customer" + (need === 1 ? "" : "s") + " to reach " + esc(next.name) + " (" + next.rate + "% commission).";
    }

    var rows = d.earnings.slice().sort(function (a, b) {
      return String(a.month).localeCompare(String(b.month));
    }).slice(-6);
    var chart;
    if (!rows.length) {
      chart = '<div class="empty"><strong>No earnings yet</strong>Your monthly commission chart appears after your first referred customer pays.</div>';
    } else {
      var max = Math.max.apply(null, rows.map(function (r) { return Number(r.amount) || 0; })) || 1;
      chart = '<div class="chart">' + rows.map(function (r) {
        var a = Number(r.amount) || 0;
        return '<div class="col"><em>' + U.inr(a) + '</em><b style="height:' + Math.max(2, Math.round((a / max) * 110)) + 'px"></b><span>' + monthLabel(r.month) + "</span></div>";
      }).join("") + "</div>";
    }

    var hasCode = !!safeCode();
    var items = [
      { done: flag("glime_pd_copied"), html: hasCode ? '<a href="#link">Copy your referral link</a>' : "Your referral link is being prepared" },
      { done: flag("glime_pd_docs"), html: '<a href="partner-docs.html" data-flag="glime_pd_docs">Read the Partner Guide</a>' },
      { done: !!(d.partner.payout && d.partner.payout.method), html: '<a href="#payouts">Add your payout details</a>' },
      { done: (Number(s.signups) || 0) > 0, html: "Get your first sign-up" }
    ];
    var doneCount = items.filter(function (i) { return i.done; }).length;

    return head("Overview", "A snapshot of your partner performance.",
        '<a class="btn btn-primary btn-sm" href="#link">Get my referral link</a>') +
      '<div class="pd-grid c4">' +
        stat("Link clicks", U.num(s.clicks), "Last " + P.cookieDays + "-day tracking window") +
        stat("Sign-ups", U.num(s.signups), "Businesses that created a GLIME account") +
        stat("Active customers", U.num(customers), "Paying and attributed to you") +
        stat("Available balance", U.inr(s.available_balance), "Next payout " + U.date(nextPayoutDate()), true) +
      "</div>" +
      '<div class="pd-grid c32 pd-mt">' +
        '<div class="pd-card"><h2>Monthly earnings</h2><p class="sub">Commission earned over the last six months.</p>' + chart + "</div>" +
        '<div class="pd-grid">' +
          '<div class="pd-card"><h2>' + esc(tier.name) + " tier · " + tier.rate + '%</h2><p class="sub">' + tierMsg + "</p>" +
            '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
            '<div class="tier-row"><span>' + customers + " active</span><span>" + (next ? next.minCustomers + " for " + esc(next.name) : "Top tier") + "</span></div></div>" +
          '<div class="pd-card"><h2>Getting started</h2><p class="sub">' + doneCount + " of " + items.length + " done</p><ul class=\"check\">" +
            items.map(function (i) {
              return '<li class="' + (i.done ? "done" : "") + '"><span class="dot">' + (i.done ? "✓" : "") + "</span><span>" + i.html + "</span></li>";
            }).join("") + "</ul></div>" +
        "</div>" +
      "</div>";
  }

  function shareTemplates(link) {
    return [
      { title: "Short message",
        text: "GLIME helps businesses manage WhatsApp and Instagram conversations, leads, orders and follow-ups in one place. Plans start at ₹299/month with a 7-day free trial. Try it here: " + link },
      { title: "For a client or colleague",
        text: "If you get a lot of enquiries on WhatsApp or Instagram, take a look at GLIME. It connects chats, leads, orders, payments and follow-ups so nothing slips through. You can start a 7-day free trial here: " + link },
      { title: "For a post or newsletter",
        text: "Small businesses lose sales in the gaps between chat, orders and follow-ups. GLIME brings them into one workspace. See how it works and start a 7-day free trial: " + link }
    ];
  }

  function vLink() {
    var code = safeCode();
    var body;
    if (!code) {
      body = '<div class="pd-card"><div class="empty"><strong>Your referral link is being prepared</strong>' +
        "Your personal link appears here as soon as partner tracking is switched on for your account. Refresh this page in a moment.</div></div>";
    } else {
      var link = referralUrl(state.tag);
      body = '<div class="pd-card"><h2>Your personal referral link</h2><p class="sub">Anyone who signs up through this link for ' + P.cookieDays + " days is attributed to you.</p>" +
        '<div class="linkbox"><input id="refLink" type="text" readonly value="' + esc(link) + '" aria-label="Your referral link">' +
        '<button type="button" class="btn btn-primary" data-act="copy-link">Copy link</button></div>' +
        '<div class="f pd-mt"><label for="refTag">Campaign tag (optional)</label>' +
        '<input id="refTag" type="text" maxlength="24" placeholder="e.g. instagram-bio" value="' + esc(state.tag) + '" autocomplete="off">' +
        "<small>Letters, numbers and hyphens. Use a different tag for each place you share, so you can see what works.</small></div>" +
        '<div class="share"><button type="button" class="btn btn-ghost btn-sm" data-act="share-wa">Share on WhatsApp</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="share-mail">Email</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="share-in">LinkedIn</button>' +
        (navigator.share ? '<button type="button" class="btn btn-ghost btn-sm" data-act="share-native">More…</button>' : "") +
        "</div></div>" +
        '<div class="pd-card pd-mt"><h2>Ready-to-use messages</h2><p class="sub">Copy, adjust to your voice and share. Please keep claims accurate, see the <a href="partner-docs.html#policies" data-flag="glime_pd_docs">partner policies</a>.</p>' +
        shareTemplates(link).map(function (t, i) {
          return '<p class="mono" style="font-size:.72rem;color:var(--green);margin-bottom:6px">' + esc(t.title) + "</p>" +
            '<div class="copyblock" id="tpl' + i + '">' + esc(t.text) + "</div>" +
            '<button type="button" class="btn btn-ghost btn-sm" data-act="copy-tpl" data-i="' + i + '" style="margin-bottom:18px">Copy message</button>';
        }).join("") + "</div>";
    }
    return head("Referral link", "Share GLIME and earn when your referrals subscribe.") + body;
  }

  function referralRows() {
    var q = state.refQuery.trim().toLowerCase();
    var list = state.data.referrals.filter(function (r) {
      var okS = state.refFilter === "all" || String(r.status).toLowerCase() === state.refFilter;
      var okQ = !q || String(r.masked_name || "").toLowerCase().indexOf(q) > -1;
      return okS && okQ;
    });
    if (!list.length) {
      return '<tr><td colspan="5"><div class="tbl-empty">' +
        (state.data.referrals.length ? "No referrals match your filters." : "No referrals yet. Share your link to get your first sign-up.") + "</div></td></tr>";
    }
    return list.map(function (r) {
      return "<tr><td>" + esc(r.masked_name || "Customer") + "</td><td>" + esc(r.plan || "—") + "</td><td>" + chip(REF_STATUS, r.status) +
        "</td><td>" + U.date(r.signed_up_at) + '</td><td class="r">' + (r.monthly_commission != null ? U.inr(r.monthly_commission) : "—") + "</td></tr>";
    }).join("");
  }

  function vReferrals() {
    return head("Referrals", "Every business you have referred and where they are now.") +
      '<div class="tools"><input id="refSearch" type="search" placeholder="Search referrals" value="' + esc(state.refQuery) + '" aria-label="Search referrals">' +
      '<select id="refFilter" aria-label="Filter by status">' +
      [["all", "All statuses"], ["signed_up", "Signed up"], ["trial", "On trial"], ["active", "Active"], ["churned", "Churned"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.refFilter === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + "</select></div>" +
      '<div class="tbl-wrap"><table><thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Signed up</th><th class="r">Monthly commission</th></tr></thead>' +
      '<tbody id="refBody">' + referralRows() + "</tbody></table></div>" +
      '<p class="sub pd-mt" style="color:var(--dim);font-size:.76rem">Customer names are partly hidden to protect their privacy.</p>';
  }

  function vEarnings() {
    var s = state.data.stats;
    var rows = state.data.earnings.slice().sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
    return head("Earnings", "Commission is pending for " + P.holdDays + " days, then becomes available for payout.") +
      '<div class="pd-grid c4">' +
        stat("Pending", U.inr(s.pending_earnings), "In the " + P.holdDays + "-day hold period") +
        stat("Available", U.inr(s.available_balance), "Ready for the next payout", true) +
        stat("Paid out", U.inr(s.paid_out), "Already sent to you") +
        stat("Lifetime", U.inr(s.lifetime_earnings), "Everything you have earned") +
      "</div>" +
      '<div class="tbl-wrap pd-mt"><table><thead><tr><th>Month</th><th>Status</th><th class="r">Commission</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        return "<tr><td>" + monthLabel(r.month, true) + "</td><td>" + chip(EARN_STATUS, r.status) + '</td><td class="r">' + U.inr(r.amount) + "</td></tr>";
      }).join("") : '<tr><td colspan="3"><div class="tbl-empty">No earnings yet. Commission shows up here after a referred customer pays.</div></td></tr>') +
      "</tbody></table></div>";
  }

  function payoutSummary() {
    var p = state.data.partner.payout;
    if (!p || !p.method) return '<p class="sub" style="margin-bottom:14px">No payout method saved yet.</p>';
    return '<p class="sub" style="margin-bottom:14px">Saved: <strong style="color:var(--text)">' + esc(p.display || (String(p.method).toUpperCase() + " account")) + "</strong></p>";
  }

  function payoutFields(method) {
    if (method === "bank") {
      return '<div class="f"><label for="pfHolder">Account holder name</label><input id="pfHolder" type="text" maxlength="100" autocomplete="off"></div>' +
        '<div class="f"><label for="pfAcc">Account number</label><input id="pfAcc" type="text" inputmode="numeric" maxlength="18" autocomplete="off"></div>' +
        '<div class="f"><label for="pfIfsc">IFSC code</label><input id="pfIfsc" type="text" maxlength="11" autocomplete="off" style="text-transform:uppercase"></div>';
    }
    return '<div class="f"><label for="pfUpi">UPI ID</label><input id="pfUpi" type="text" maxlength="60" placeholder="name@bank" autocomplete="off">' +
      "<small>Payouts go to this UPI ID. Please double-check it.</small></div>";
  }

  function vPayouts() {
    var s = state.data.stats;
    var hist = state.data.payouts.slice().sort(function (a, b) {
      return String(b.requested_at || b.paid_at || "").localeCompare(String(a.requested_at || a.paid_at || ""));
    });
    return head("Payouts", "Available earnings are paid automatically every month.") +
      '<div class="pd-grid c4">' +
        stat("Available balance", U.inr(s.available_balance), "Eligible for the next payout", true) +
        stat("Next payout", U.date(nextPayoutDate()), "Paid on the " + P.payoutDay + "th of each month") +
        stat("Minimum payout", U.inr(P.minPayout), "Smaller balances roll over") +
        stat("Total paid out", U.inr(s.paid_out), "All time") +
      "</div>" +
      '<div class="pd-grid c2 pd-mt">' +
        '<div class="pd-card"><h2>Payout details</h2>' + payoutSummary() +
          '<form id="payoutForm" novalidate><div class="f"><label for="pfMethod">Payout method</label><select id="pfMethod"><option value="upi">UPI</option><option value="bank">Bank transfer</option></select></div>' +
          '<div id="pfFields">' + payoutFields("upi") + '</div><button type="submit" class="btn btn-primary btn-sm" id="pfSave">Save payout details</button>' +
          '<p class="f-msg" id="pfMsg" role="alert"></p></form></div>' +
        '<div class="pd-card"><h2>How payouts work</h2><ul class="check" style="margin-top:10px">' +
          "<li><span class=\"dot\" style=\"border:0\">1</span><span>New commission stays pending for " + P.holdDays + " days to cover refunds.</span></li>" +
          "<li><span class=\"dot\" style=\"border:0\">2</span><span>After that it becomes available.</span></li>" +
          "<li><span class=\"dot\" style=\"border:0\">3</span><span>On the " + P.payoutDay + "th, if your available balance is at least " + U.inr(P.minPayout) + ", it is paid to your saved payout method.</span></li>" +
          "<li><span class=\"dot\" style=\"border:0\">4</span><span>Below the minimum? It rolls over to the next month.</span></li></ul>" +
          '<p class="sub" style="margin-top:14px">Full details are in the <a href="partner-docs.html#payouts" data-flag="glime_pd_docs">Partner Guide</a>.</p></div>' +
      "</div>" +
      '<h2 style="font-size:1rem;margin:26px 0 12px">Payout history</h2>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Method</th><th>Status</th><th class="r">Amount</th></tr></thead><tbody>' +
      (hist.length ? hist.map(function (h) {
        return "<tr><td>" + U.date(h.paid_at || h.requested_at) + "</td><td>" + esc(h.method || "—") + "</td><td>" + chip(PAY_STATUS, h.status) + '</td><td class="r">' + U.inr(h.amount) + "</td></tr>";
      }).join("") : '<tr><td colspan="4"><div class="tbl-empty">No payouts yet.</div></td></tr>') +
      "</tbody></table></div>";
  }

  function vResources() {
    var cards = [
      ["Getting started", "Set up your link and share it the right way.", "partner-docs.html#getting-started"],
      ["Commission & tiers", "How earnings and tiers are calculated.", "partner-docs.html#commission"],
      ["Payouts", "Hold period, minimum payout and schedule.", "partner-docs.html#payouts"],
      ["Brand guidelines", "How to use the GLIME name and logo.", "partner-docs.html#brand"],
      ["Partner policies", "What is and is not allowed.", "partner-docs.html#policies"],
      ["FAQ", "Quick answers to common questions.", "partner-docs.html#faq"]
    ];
    return head("Resources", "Guides and policies to help you succeed as a partner.") +
      '<div class="res">' + cards.map(function (c) {
        return '<a class="pd-card" href="' + c[2] + '" data-flag="glime_pd_docs"><h3>' + esc(c[0]) + "</h3><p>" + esc(c[1]) + "</p></a>";
      }).join("") + "</div>" +
      '<div class="pd-card pd-mt"><h2>Need help?</h2><p class="sub">Our team is happy to help with partner questions.</p>' +
      '<a class="btn btn-ghost btn-sm" href="contact.html">Contact GLIME</a></div>';
  }

  function vProfile() {
    var u = state.user, m = (u && u.user_metadata) || {}, p = state.data.partner;
    return head("Profile", "Your partner account details.") +
      '<div class="pd-card"><dl class="kv">' +
        "<dt>Name</dt><dd>" + esc(m.full_name || m.name || "—") + "</dd>" +
        "<dt>Email</dt><dd>" + esc((u && u.email) || "—") + "</dd>" +
        "<dt>Sign-in</dt><dd>Google</dd>" +
        "<dt>Partner code</dt><dd>" + esc(safeCode() || "Being prepared") + "</dd>" +
        "<dt>Status</dt><dd>" + esc(String(p.status || "active").replace(/^./, function (c) { return c.toUpperCase(); })) + "</dd>" +
        "<dt>Partner since</dt><dd>" + U.date(p.joined_at || (u && u.created_at)) + "</dd>" +
      "</dl></div>" +
      '<div class="pd-card pd-mt"><h2>Account</h2><p class="sub">Partner accounts are separate from GLIME client accounts. Signing out here does not affect your client login.</p>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="signout">Sign out</button></div>';
  }

  var RENDER = {
    overview: vOverview, link: vLink, referrals: vReferrals, earnings: vEarnings,
    payouts: vPayouts, resources: vResources, profile: vProfile
  };

  /* ---------------------------------------------------------
     Router
  --------------------------------------------------------- */
  function currentView() {
    var h = window.location.hash.replace(/^#/, "");
    return VIEWS.indexOf(h) > -1 ? h : "overview";
  }

  function render() {
    var v = currentView();
    $("pdView").innerHTML = RENDER[v]();
    document.querySelectorAll("#pdNav a").forEach(function (a) {
      var on = a.getAttribute("data-view") === v;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = v.charAt(0).toUpperCase() + v.slice(1) + " | Partner Dashboard | GLIME";
    if (v === "payouts") bindPayoutForm();
  }

  function go() {
    render();
    window.scrollTo({ top: 0 });
    $("pdMain").focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------
     Payout form
  --------------------------------------------------------- */
  function bindPayoutForm() {
    var form = $("payoutForm");
    if (!form) return;
    var method = $("pfMethod");
    method.addEventListener("change", function () { $("pfFields").innerHTML = payoutFields(method.value); $("pfMsg").textContent = ""; });
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("pfMsg"), btn = $("pfSave");
      msg.className = "f-msg";
      var details = {};
      try {
        if (method.value === "upi") {
          var upi = $("pfUpi").value.trim();
          if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/.test(upi)) throw new Error("Please enter a valid UPI ID, for example name@bank.");
          details = { upi_id: upi };
        } else {
          var holder = $("pfHolder").value.trim(), acc = $("pfAcc").value.trim(), ifsc = $("pfIfsc").value.trim().toUpperCase();
          if (holder.length < 2) throw new Error("Please enter the account holder name.");
          if (!/^\d{9,18}$/.test(acc)) throw new Error("Account number should be 9 to 18 digits.");
          if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error("Please enter a valid 11-character IFSC code.");
          details = { account_holder: holder, account_number: acc, ifsc: ifsc };
        }
        btn.disabled = true; btn.textContent = "Saving...";
        var r = await sb.rpc("partner_save_payout_details", { p_method: method.value, p_details: details });
        if (r.error) throw r.error;
        msg.className = "f-msg ok"; msg.textContent = "Payout details saved.";
        toast("Payout details saved");
        await loadData();
        if (currentView() === "payouts") render();
      } catch (err) {
        msg.className = "f-msg err";
        msg.textContent = isMissingFn(err)
          ? "Saving payout details will be available as soon as partner payouts are switched on for your account."
          : (err && err.message) || "Could not save payout details. Please try again.";
        btn.disabled = false; btn.textContent = "Save payout details";
      }
    });
  }

  /* ---------------------------------------------------------
     Events
  --------------------------------------------------------- */
  function shareText() {
    return "GLIME helps businesses manage WhatsApp and Instagram conversations, leads, orders and follow-ups in one place. Start a 7-day free trial: " + referralUrl(state.tag);
  }

  document.addEventListener("click", async function (e) {
    var flagged = e.target.closest("[data-flag]");
    if (flagged) flag(flagged.getAttribute("data-flag"), true);

    var el = e.target.closest("[data-act]");
    if (!el) return;
    var act = el.getAttribute("data-act");
    var link = referralUrl(state.tag);

    if (act === "copy-link") {
      if (await copyText(link)) { flag("glime_pd_copied", true); toast("Referral link copied"); } else toast("Could not copy. Please copy it manually.", true);
    } else if (act === "copy-tpl") {
      var i = Number(el.getAttribute("data-i"));
      var t = shareTemplates(link)[i];
      if (t && await copyText(t.text)) { flag("glime_pd_copied", true); toast("Message copied"); } else toast("Could not copy. Please copy it manually.", true);
    } else if (act === "share-wa") {
      window.open("https://wa.me/?text=" + encodeURIComponent(shareText()), "_blank", "noopener");
    } else if (act === "share-mail") {
      window.location.href = "mailto:?subject=" + encodeURIComponent("Try GLIME for WhatsApp and Instagram") + "&body=" + encodeURIComponent(shareText());
    } else if (act === "share-in") {
      window.open("https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(link), "_blank", "noopener");
    } else if (act === "share-native") {
      try { await navigator.share({ title: "GLIME", text: shareText(), url: link }); } catch (err) {}
    } else if (act === "signout") {
      await signOut();
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "refTag") {
      var v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
      state.tag = v;
      if (e.target.value !== v) e.target.value = v;
      var box = $("refLink");
      if (box) box.value = referralUrl(v);
    } else if (e.target.id === "refSearch") {
      state.refQuery = e.target.value;
      $("refBody").innerHTML = referralRows();
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "refFilter") {
      state.refFilter = e.target.value;
      $("refBody").innerHTML = referralRows();
    }
  });

  window.addEventListener("hashchange", go);

  /* user menu */
  var menuBtn = $("pdUserBtn"), menu = $("pdMenu");
  function setMenu(open) { menu.hidden = !open; menuBtn.setAttribute("aria-expanded", String(open)); }
  menuBtn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  $("pdSignOut").addEventListener("click", signOut);

  async function signOut() {
    try { await sb.auth.signOut(); } catch (e) {}
    window.location.replace(C.pages.landing);
  }

  /* ---------------------------------------------------------
     Boot
  --------------------------------------------------------- */
  function paintUser() {
    var u = state.user, m = u.user_metadata || {};
    var name = m.full_name || m.name || (u.email ? u.email.split("@")[0] : "Partner");
    $("pdUserName").textContent = name;
    $("pdMenuEmail").textContent = u.email || "";
    var av = $("pdAvatar"), pic = m.avatar_url || m.picture;
    if (pic && /^https:\/\//i.test(pic)) {
      var img = document.createElement("img");
      img.src = pic; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onerror = function () { av.textContent = name.charAt(0).toUpperCase(); };
      av.textContent = ""; av.appendChild(img);
    } else {
      av.textContent = name.charAt(0).toUpperCase();
    }
    $("pdTier").textContent = currentTier().name;
  }

  async function boot() {
    var res;
    try { res = await sb.auth.getSession(); } catch (e) { res = null; }
    var session = res && res.data && res.data.session;
    if (!session) {
      var errQ = /error_description/.test(window.location.search + window.location.hash) ? window.location.search : "";
      window.location.replace(C.pages.landing + errQ);
      return;
    }
    state.user = session.user;

    /* Remove OAuth tokens/codes from the address bar. */
    var h = window.location.hash;
    var keep = VIEWS.indexOf(h.replace(/^#/, "")) > -1 ? h : "";
    try { history.replaceState(null, "", window.location.pathname + keep); } catch (e) {}
    try { localStorage.removeItem("glime_partner_intent"); } catch (e) {}

    sb.auth.onAuthStateChange(function (event) {
      if (event === "SIGNED_OUT") window.location.replace(C.pages.landing);
    });

    await loadData();
    paintUser();
    $("pdLoading").hidden = true;
    $("pdShell").hidden = false;
    render();
  }

  boot();
})();
