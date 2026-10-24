/* =========================================================
   GLIME AGENCY DASHBOARD
   - Google session guard (no session -> agency.html)
   - loads data from RPC `agency_get_dashboard`
   - Overview, Clients, Wallet, Plans, Renewals, Reports, Team,
     Activity, Resources, Support, Profile
   Edge functions: glime-agency-api (create_client, open_client,
   client_setup_link), glime-agency-wallet (topup_create_order),
   glime-agency-invoice (PDF download).
   Other RPCs are listed in AGENCY_BACKEND_SPEC.md; until they exist the
   screen shows a friendly "coming soon" message instead of failing.
========================================================= */
(function () {
  "use strict";
  var C = window.GLIME_PARTNER;
  if (!C || !C.agency || !window.supabase) return;
  var A = C.agency, U = C.util, esc = U.esc;
  var sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var $ = function (id) { return document.getElementById(id); };
  var VIEWS = ["overview", "clients", "wallet", "plans", "renewals", "reports", "team", "activity", "resources", "support", "profile"];
  var state = { user: null, d: null, cFilter: "all", cQuery: "", cSort: "recent", txFilter: "all", extra: {} };

  /* ---------------- helpers ---------------- */
  var ERR = {
    AGENCY_NOT_ACTIVE: "Your agency account is not active.",
    CLIENT_NOT_FOUND: "That client was not found under your agency.",
    PLAN_NOT_AVAILABLE: "That plan is not available right now.",
    INVALID_PRICE: "Please enter a valid price.",
    INSUFFICIENT_BALANCE: "Your wallet balance is too low. Please top up and try again.",
    INSUFFICIENT_WALLET: "Your wallet balance is too low. Please top up and try again.",
    WALLET_FROZEN: "Your wallet is frozen. Please contact GLIME.",
    INVALID_AMOUNT: "Please enter a valid amount.",
    AMOUNT_TOO_LOW: "The amount is below the minimum top-up.",
    CLIENT_ALREADY_EXISTS: "This client already exists or belongs to another agency.",
    not_authenticated: "Your session expired. Please sign in again.",
    PHONE_ALREADY_USED: "This phone number is already used by another account.",
    EMAIL_ALREADY_REGISTERED: "This email is already registered on GLIME.",
    INVALID_PHONE: "Please enter a valid phone number.",
    INVALID_EMAIL: "Please enter a valid email.",
    DAILY_LIMIT_REACHED: "You can add up to 10 clients per day. Please try again tomorrow.",
    WALLET_UNAVAILABLE: "Your wallet is not available right now. Please contact GLIME.",
    INVALID_STATUS: "That status is not allowed.",
    INVALID_ROLE: "Please choose a valid role.",
    MEMBER_ALREADY_EXISTS: "This person is already on your team.",
    CANNOT_INVITE_OWNER: "The owner cannot be invited again.",
    TEAM_LIMIT_REACHED: "Your team has reached the limit of 25 members.",
    MEMBER_NOT_FOUND: "That team member was not found.",
    INVALID_SUBJECT: "Please enter a valid subject.",
    INVALID_MESSAGE: "Please enter a longer message.",
    TOO_MANY_REQUESTS: "Too many requests. Please try again in a while.",
    NOTHING_TO_UPDATE: "There is nothing to update.",
    INVALID_PAN: "PAN looks wrong. Format: ABCDE1234F.",
    INVALID_GST: "GST number should be 15 characters.",
    INVALID_CITY: "Please enter a valid city.",
    REQUEST_FAILED: "Could not reach the server. Please try again."
  };
  function isMissingFn(e) {
    var m = String((e && e.message) || "");
    return !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist|schema cache/i.test(m));
  }
  function errText(e) {
    if (isMissingFn(e)) return "This feature switches on as soon as its backend is live.";
    var m = String((e && e.message) || "");
    for (var k in ERR) if (m.indexOf(k) > -1) return ERR[k];
    return "Something went wrong. Please try again.";
  }
  async function call(fn, args) {
    var r = await sb.rpc(fn, args || {});
    if (r.error) throw r.error;
    return Array.isArray(r.data) ? r.data[0] : r.data;
  }
  var FN = C.supabaseUrl + "/functions/v1/";
  async function token() {
    var s0 = await sb.auth.getSession();
    var t = s0 && s0.data && s0.data.session && s0.data.session.access_token;
    if (!t) throw new Error("not_authenticated");
    return t;
  }
  async function api(fn, body) {
    var tok = await token();
    var r = await fetch(FN + fn, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok, apikey: C.supabaseKey }, body: JSON.stringify(body) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!j || j.ok === false) throw new Error((j && j.error) || "REQUEST_FAILED");
    return j;
  }
  function errFor(code) { return ERR[code] || String(code || ""); }
  function setupMessage(name, link) {
    return "Hi " + (name || "") + "! Your GLIME account is ready. Set your password and get started here: " + link + " . We will help you connect WhatsApp and Instagram.";
  }
  var toastTimer;
  function toast(text, bad) {
    var t = $("pdToast");
    t.textContent = text; t.className = "pd-toast" + (bad ? " err" : ""); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, 3000);
  }
  function banner(text, kind) {
    var b = $("pdBanner");
    if (!text) { b.hidden = true; return; }
    b.className = "pd-banner" + (kind ? " " + kind : ""); b.textContent = text; b.hidden = false;
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) {
      try {
        var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); return ok;
      } catch (e2) { return false; }
    }
  }
  function csv(name, rows) {
    var body = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? "" : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv" }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function flag(k, v) {
    try { if (v === undefined) return localStorage.getItem(k) === "1"; localStorage.setItem(k, v ? "1" : "0"); } catch (e) {}
    return false;
  }
  function head(title, sub, action) {
    return '<div class="pd-h"><div><h1>' + esc(title) + "</h1>" + (sub ? "<p>" + sub + "</p>" : "") + "</div>" + (action || "") + "</div>";
  }
  function stat(k, v, n, green) {
    return '<div class="pd-card pd-stat"><div class="k">' + esc(k) + '</div><div class="v' + (green ? " g" : "") + '">' + v + '</div><div class="n">' + n + "</div></div>";
  }
  function chip(label, kind) { return '<span class="chip ' + (kind || "") + '">' + esc(label) + "</span>"; }
  function soon(what) {
    return '<div class="empty"><strong>' + esc(what) + "</strong>This section switches on as soon as its backend is live.</div>";
  }

  /* ---------------- data ---------------- */
  function normalize(raw) {
    var d = { agency: null, wallet: {}, stats: {}, tiers: [], plans: [], grace_days: A.graceDays, clients: [], transactions: [] };
    if (raw && typeof raw === "object") {
      Object.keys(d).forEach(function (k) {
        if (raw[k] == null) return;
        if (Array.isArray(d[k])) { if (Array.isArray(raw[k])) d[k] = raw[k]; } else d[k] = raw[k];
      });
    }
    return d;
  }
  async function load() {
    try {
      state.d = normalize(await call("agency_get_dashboard"));
      banner("");
    } catch (e) {
      console.warn("agency_get_dashboard:", e);
      state.d = normalize(null);
      banner(isMissingFn(e) ? "Agency tracking is not switched on yet." : "We could not load your latest numbers. Please refresh in a moment.", "warn");
    }
  }
  function tiers() {
    var t = (state.d.tiers || []).map(function (x) { return { name: x.name, discount: Math.round(Number(x.discount) * 100), min: Number(x.min_clients) || 0 }; });
    if (!t.length) t = A.tiers.map(function (x) { return { name: x.name, discount: x.discount, min: x.minClients }; });
    return t.sort(function (a, b) { return a.min - b.min; });
  }
  function planOf(code) { return state.d.plans.filter(function (p) { return p.plan_code === code; })[0] || null; }
  function planName(code) { var p = planOf(code); return p ? p.name : (code || "No plan"); }
  function wprice(c) {
    if (c.wholesale_price != null) return Number(c.wholesale_price);
    var p = planOf(c.plan_key); return p ? Number(p.wholesale_price) : null;
  }
  function margin(c) {
    var w = wprice(c); if (c.client_price == null || w == null) return null;
    return Number(c.client_price) - w;
  }
  function live() { return state.d.clients.filter(function (c) { return c.status === "active" && c.plan_key; }); }
  function daysTo(v) { return v ? Math.ceil((new Date(v) - new Date()) / 86400000) : null; }
  function clientState(c) {
    if (c.status === "paused") return ["Paused", "bad"];
    if (!c.plan_key) return ["No plan", "warn"];
    var d = daysTo(c.period_end);
    if (d != null && d < 0) return ["Expired", "bad"];
    if (c.free_trial_status === "active" || c.free_trial_status === "trial") return ["Trial", "info"];
    return ["Active", "ok"];
  }
  function totals() {
    var l = live(), rev = 0, cost = 0, unpriced = 0;
    l.forEach(function (c) {
      var w = wprice(c); if (w != null) cost += w;
      if (c.client_price == null) unpriced++; else rev += Number(c.client_price);
    });
    var priced = l.filter(function (c) { return c.client_price != null; });
    var m = priced.reduce(function (s, c) { var x = margin(c); return s + (x == null ? 0 : x); }, 0);
    return { rev: rev, cost: cost, margin: m, unpriced: unpriced, live: l.length };
  }
  function dueClients(days) {
    return state.d.clients.filter(function (c) {
      if (c.status !== "active" || !c.plan_key || !c.auto_renew) return false;
      var d = daysTo(c.period_end); return d != null && d <= days;
    }).sort(function (a, b) { return new Date(a.period_end) - new Date(b.period_end); });
  }
  function balance() { return Number((state.d.wallet || {}).balance) || 0; }
  function minTopup() { return Number((state.d.wallet || {}).min_topup) || A.minTopup; }

  /* ---------------- modal ---------------- */
  function openModal(html) { $("adModalBody").innerHTML = html; $("adModal").hidden = false; var f = $("adModalBody").querySelector("input,select,textarea,button"); if (f) f.focus(); }
  function closeModal() { $("adModal").hidden = true; $("adModalBody").innerHTML = ""; }
  function ask(title, text, okLabel) {
    return new Promise(function (resolve) {
      openModal("<h2 id=\"adModalTitle\">" + esc(title) + '</h2><p class="sub">' + esc(text) + '</p><div class="ad-actions"><button type="button" class="btn btn-primary btn-sm" id="askOk">' + esc(okLabel || "Confirm") + '</button><button type="button" class="btn btn-ghost btn-sm" id="askNo">Cancel</button></div>');
      $("askOk").onclick = function () { closeModal(); resolve(true); };
      $("askNo").onclick = function () { closeModal(); resolve(false); };
    });
  }

  /* ---------------- views ---------------- */
  function vOverview() {
    var d = state.d, t = totals(), ts = tiers(), n = Number((d.stats || {}).clients) || 0;
    var cur = ts[0]; ts.forEach(function (x) { if (n >= x.min) cur = x; });
    var next = ts.filter(function (x) { return x.min > n; })[0];
    var pct = 100, tmsg = "You are on the top tier. Thank you for growing with GLIME.";
    if (next) {
      var span = next.min - cur.min || 1;
      pct = Math.max(4, Math.min(100, Math.round(((n - cur.min) / span) * 100)));
      tmsg = (next.min - n) + " more client" + (next.min - n === 1 ? "" : "s") + " to reach " + esc(next.name) + " (" + next.discount + "% wholesale discount).";
    }
    var due = dueClients(7), dueCost = due.reduce(function (s, c) { return s + (wprice(c) || 0); }, 0);
    var alerts = "";
    if (d.wallet && d.wallet.status === "frozen") alerts += '<div class="ad-alert bad">Your wallet is frozen. Please <a href="contact.html">contact GLIME</a>.</div>';
    else if (d.wallet && d.wallet.low_balance) alerts += '<div class="ad-alert bad">Your wallet balance is low (' + U.inr(balance()) + "). Client accounts are paused if it stays empty for " + esc(d.grace_days) + ' days. <button type="button" class="ag-link" data-act="goto" data-v="wallet">Top up now</button></div>';
    else if (dueCost > balance()) alerts += '<div class="ad-alert">Renewals due in 7 days need ' + U.inr(dueCost) + ", more than your wallet balance of " + U.inr(balance()) + '. <button type="button" class="ag-link" data-act="goto" data-v="wallet">Top up</button></div>';
    var neg = live().filter(function (c) { var m0 = margin(c); return m0 != null && m0 < 0; });
    if (neg.length) alerts += '<div class="ad-alert bad">' + neg.length + ' client' + (neg.length === 1 ? " is" : "s are") + ' priced below your wholesale cost. <a href="#clients">Review prices</a></div>';
    if (t.unpriced) alerts += '<div class="ad-alert">' + t.unpriced + ' live client' + (t.unpriced === 1 ? " has" : "s have") + ' no price set, so margin is not tracked. <a href="#clients">Set prices</a></div>';
    var items = [
      { done: balance() > 0 || (d.transactions || []).length > 0, html: '<a href="#wallet">Add money to your wallet</a>' },
      { done: d.clients.length > 0, html: '<button type="button" class="ad-link" data-act="add-client">Add your first client</button>' },
      { done: d.clients.some(function (c) { return c.client_price != null; }), html: '<a href="#clients">Set your price for a client</a>' },
      { done: flag("glime_ad_guide"), html: '<a href="#resources" data-flag="glime_ad_guide">Read the onboarding guide</a>' }
    ];
    var doneN = items.filter(function (i) { return i.done; }).length;
    var recent = (d.transactions || []).slice(0, 5);
    return head("Overview", "A snapshot of your agency.", '<button type="button" class="btn btn-primary btn-sm" data-act="add-client">Add client</button>') + alerts +
      '<div class="pd-grid c4">' +
        stat("Wallet balance", U.inr(balance()), "Minimum top-up " + U.inr(minTopup()), true) +
        stat("Clients", U.num(n), U.num((d.stats || {}).active_clients) + " active") +
        stat("Monthly billing", U.inr(t.rev), "What your clients pay you" + (t.unpriced ? " (" + t.unpriced + " without a price)" : "")) +
        stat("Monthly margin", U.inr(t.margin), "After wholesale cost of " + U.inr(t.cost), true) +
      "</div>" +
      '<div class="pd-grid c32 pd-mt">' +
        '<div class="pd-card"><h2>Recent wallet activity</h2><p class="sub">Your last five transactions.</p>' +
          (recent.length ? '<ul class="ad-list">' + recent.map(function (x) {
            var pos = Number(x.amount) > 0;
            return "<li><span>" + esc(x.description || x.type) + ' <span class="ad-muted">' + U.date(x.created_at) + '</span></span><b class="' + (pos ? "ad-pos" : "ad-neg") + '">' + (pos ? "+" : "") + U.inr(x.amount) + "</b></li>";
          }).join("") + "</ul>" : '<div class="empty"><strong>No activity yet</strong>Top-ups and plan charges appear here.</div>') + "</div>" +
        '<div class="pd-grid">' +
          '<div class="pd-card"><h2>' + esc(cur.name) + " tier · " + cur.discount + '% off</h2><p class="sub">' + tmsg + '</p><div class="bar"><i style="width:' + pct + '%"></i></div><div class="tier-row"><span>' + n + " clients</span><span>" + (next ? next.min + " for " + esc(next.name) : "Top tier") + "</span></div></div>" +
          '<div class="pd-card"><h2>Getting started</h2><p class="sub">' + doneN + " of " + items.length + ' done</p><ul class="check">' + items.map(function (i) {
            return '<li class="' + (i.done ? "done" : "") + '"><span class="dot">' + (i.done ? "✓" : "") + "</span><span>" + i.html + "</span></li>";
          }).join("") + "</ul></div>" +
        "</div>" +
      "</div>";
  }

  function clientRows() {
    var q = state.cQuery.trim().toLowerCase();
    var list = state.d.clients.filter(function (c) {
      var st = clientState(c)[0].toLowerCase();
      var okS = state.cFilter === "all" || st === state.cFilter;
      var hay = (String(c.name || "") + " " + String(c.email || "") + " " + String(c.phone || "") + " " + String(c.client_id)).toLowerCase();
      return okS && (!q || hay.indexOf(q) > -1);
    });
    var so = state.cSort;
    list = list.slice().sort(function (a, b) {
      if (so === "name") return String(a.name || a.client_id).localeCompare(String(b.name || b.client_id));
      if (so === "margin") return (margin(b) == null ? -1e9 : margin(b)) - (margin(a) == null ? -1e9 : margin(a));
      if (so === "renewal") return (a.period_end ? new Date(a.period_end) : 1e15) - (b.period_end ? new Date(b.period_end) : 1e15);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
    if (!list.length) return '<tr><td colspan="8"><div class="tbl-empty">' + (state.d.clients.length ? "No clients match your filters." : "No clients yet. Press Add client to create the first one.") + "</div></td></tr>";
    return list.map(function (c) {
      var s = clientState(c), m = margin(c);
      return "<tr><td><strong>" + esc(c.name || c.client_id) + '</strong><div class="ad-muted">' + esc(c.client_id) + " · " + esc(c.phone || c.email || "—") + "</div></td><td>" + esc(planName(c.plan_key)) + "</td><td>" + chip(s[0], s[1]) + '</td><td class="r">' +
        (c.client_price != null ? U.inr(c.client_price) : "—") + '</td><td class="r">' + (wprice(c) != null ? U.inr(wprice(c)) : "—") + '</td><td class="r ' + (m == null ? "" : m < 0 ? "ad-neg" : "ad-pos") + '">' + (m == null ? "—" : U.inr(m)) + "</td><td>" + (c.period_end ? U.date(c.period_end) : "—") +
        '</td><td class="r"><button type="button" class="btn btn-ghost btn-sm" data-act="manage" data-id="' + esc(c.client_id) + '">Manage</button></td></tr>';
    }).join("");
  }
  function vClients() {
    return head("Clients", "Every business you manage. Your price, wholesale cost and margin at a glance.", '<button type="button" class="btn btn-primary btn-sm" data-act="add-client">Add client</button>') +
      '<div class="tools"><input id="cSearch" type="search" placeholder="Search by name, phone or ID" value="' + esc(state.cQuery) + '" aria-label="Search clients"><select id="cFilter" aria-label="Filter by status">' +
      [["all", "All statuses"], ["active", "Active"], ["trial", "Trial"], ["paused", "Paused"], ["expired", "Expired"], ["no plan", "No plan"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.cFilter === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + '</select><select id="cSort" aria-label="Sort clients">' +
      [["recent", "Newest first"], ["name", "Name A to Z"], ["margin", "Highest margin"], ["renewal", "Renewing soonest"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.cSort === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + '</select><button type="button" class="btn btn-ghost btn-sm" data-act="csv-clients">Export CSV</button></div>' +
      '<div class="tbl-wrap"><table class="ad-tight"><thead><tr><th>Client</th><th>Plan</th><th>Status</th><th class="r">Your price</th><th class="r">Wholesale</th><th class="r">Margin</th><th>Renews</th><th></th></tr></thead><tbody id="cBody">' + clientRows() + "</tbody></table></div>";
  }

  function txRows() {
    var list = (state.d.transactions || []).filter(function (x) { return state.txFilter === "all" || x.type === state.txFilter; });
    if (!list.length) return '<tr><td colspan="5"><div class="tbl-empty">No transactions yet.</div></td></tr>';
    var LBL = { topup: ["Top-up", "ok"], plan_charge: ["Plan charge", "info"], refund: ["Refund", "warn"], adjustment: ["Adjustment", ""] };
    return list.map(function (x) {
      var l = LBL[x.type] || [x.type, ""], pos = Number(x.amount) > 0;
      return "<tr><td>" + U.date(x.created_at) + "</td><td>" + chip(l[0], l[1]) + "</td><td>" + esc(x.description || "—") + (x.client_id ? ' <span class="ad-muted">' + esc(x.client_id) + "</span>" : "") + '</td><td class="r ' + (pos ? "ad-pos" : "ad-neg") + '">' + (pos ? "+" : "") + U.inr(x.amount) + '</td><td class="r">' + U.inr(x.balance_after) + "</td></tr>";
    }).join("");
  }
  function vWallet() {
    var d = state.d, w = d.wallet || {}, mt = minTopup();
    var monthly = live().reduce(function (s, c) { return s + (c.auto_renew ? (wprice(c) || 0) : 0); }, 0);
    var runway = monthly > 0 ? (balance() / monthly) : null;
    var quick = [mt, mt * 2, mt * 5, mt * 10];
    return head("Wallet", "Prepaid balance used for client plan charges at your wholesale price.") +
      (w.status === "frozen" ? '<div class="ad-alert bad">Your wallet is frozen. Please <a href="contact.html">contact GLIME</a>.</div>' : "") +
      '<div class="pd-grid c4">' + stat("Balance", U.inr(balance()), w.low_balance ? "Low balance" : "Healthy", true) +
        stat("Monthly renewals", U.inr(monthly), "Wholesale cost of auto-renewing plans") +
        stat("Runway", runway == null ? "—" : runway.toFixed(1) + " mo", "Balance divided by monthly renewals") +
        stat("Grace period", esc(d.grace_days) + " days", "Before client accounts are paused") + "</div>" +
      '<div class="ad-split ad-mt"><div class="pd-card"><h2>Add money</h2><p class="sub">Pay online. The balance updates as soon as the payment is confirmed.</p><div class="ad-chips">' +
        quick.map(function (a) { return '<button type="button" data-act="quick-amt" data-a="' + a + '">' + U.inr(a) + "</button>"; }).join("") + "</div>" +
        '<form id="topupForm" novalidate><div class="f"><label for="tuAmt">Amount (₹)</label><input id="tuAmt" type="number" min="' + mt + '" step="1" inputmode="numeric" placeholder="Minimum ' + mt + '"></div>' +
        '<button type="submit" class="btn btn-primary btn-sm" id="tuBtn">Pay and add money</button><p class="f-msg" id="tuMsg" role="alert"></p></form></div>' +
        '<div class="pd-card"><h2>How billing works</h2><ul class="check" style="margin-top:10px">' +
        '<li><span class="dot" style="border:0">1</span><span>Plan charges are deducted from your wallet at the wholesale price.</span></li>' +
        '<li><span class="dot" style="border:0">2</span><span>You are warned when the balance falls below ' + U.inr(w.low_balance_threshold || A.lowBalance) + ".</span></li>" +
        '<li><span class="dot" style="border:0">3</span><span>If it stays too low for ' + esc(d.grace_days) + " days after a renewal is due, that client account is paused.</span></li>" +
        '<li><span class="dot" style="border:0">4</span><span>Top up, and paused accounts resume.</span></li></ul></div></div>' +
      '<div class="pd-h ad-mt"><div><h2 style="font-size:1rem">Transactions</h2></div><div class="ad-actions"><select id="txFilter" aria-label="Filter transactions">' +
      [["all", "All types"], ["topup", "Top-ups"], ["plan_charge", "Plan charges"], ["refund", "Refunds"], ["adjustment", "Adjustments"]].map(function (o) {
        return '<option value="' + o[0] + '"' + (state.txFilter === o[0] ? " selected" : "") + ">" + o[1] + "</option>";
      }).join("") + '</select><button type="button" class="btn btn-ghost btn-sm" data-act="csv-tx">Export CSV</button></div></div>' +
      '<div class="tbl-wrap"><table class="ad-tight"><thead><tr><th>Date</th><th>Type</th><th>Details</th><th class="r">Amount</th><th class="r">Balance</th></tr></thead><tbody id="txBody">' + txRows() + "</tbody></table></div>" +
      '<p class="ad-muted ad-mt">The latest 20 transactions are shown. Invoices: ' + (state.extra.invoices ? "" : '<button type="button" class="ad-link" data-act="load-invoices">load my GST invoices</button>') + "</p>" + (state.extra.invoices ? invoiceTable() : "");
  }
  function invoiceTable() {
    var inv = state.extra.invoices;
    if (inv === "missing") return soon("GST invoices");
    if (!inv.length) return '<div class="tbl-empty">No invoices yet.</div>';
    return '<div class="tbl-wrap"><table class="ad-tight"><thead><tr><th>Invoice</th><th>Date</th><th class="r">Amount</th><th></th></tr></thead><tbody>' + inv.map(function (i) {
      return "<tr><td>" + esc(i.invoice_number || i.id) + "</td><td>" + U.date(i.issued_at || i.created_at) + '</td><td class="r">' + U.inr(i.total_amount || i.amount) + "</td><td class=\"r\">" + (i.id ? '<button type="button" class="ad-link" data-act="dl-invoice" data-id="' + esc(i.id) + '">Download PDF</button>' : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
  }

  function vPlans() {
    var d = state.d, ts = tiers(), n = Number((d.stats || {}).clients) || 0;
    var cur = ts[0]; ts.forEach(function (x) { if (n >= x.min) cur = x; });
    return head("Plans & pricing", "Your wholesale prices today, with your current tier discount of " + cur.discount + "%.") +
      '<div class="tbl-wrap"><table><thead><tr><th>Plan</th><th class="r">List price</th><th class="r">Your wholesale price</th><th class="r">You save</th></tr></thead><tbody>' +
      (d.plans.length ? d.plans.map(function (p) {
        return "<tr><td>" + esc(p.name) + '</td><td class="r">' + U.inr(p.list_price) + '</td><td class="r"><strong>' + U.inr(p.wholesale_price) + '</strong></td><td class="r ad-pos">' + U.inr(Number(p.list_price) - Number(p.wholesale_price)) + "</td></tr>";
      }).join("") : '<tr><td colspan="4"><div class="tbl-empty">Plans appear here once pricing is loaded.</div></td></tr>') + "</tbody></table></div>" +
      '<h2 style="font-size:1rem;margin:26px 0 12px">Discount tiers</h2><div class="tbl-wrap"><table><thead><tr><th>Tier</th><th>Clients</th><th class="r">Discount</th><th>Status</th></tr></thead><tbody>' + ts.map(function (t, i) {
        var nx = ts[i + 1], on = t === cur;
        return "<tr><td>" + esc(t.name) + "</td><td>" + t.min + (nx ? " to " + (nx.min - 1) : "+") + '</td><td class="r">' + t.discount + "%</td><td>" + (on ? chip("Your tier", "ok") : n < t.min ? chip((t.min - n) + " more clients", "") : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" +
      '<p class="ad-muted ad-mt">Your tier is based on the number of clients you manage. Set your own selling price for each client from the Clients page.</p>';
  }

  function vRenewals() {
    var due = dueClients(30), run = 0;
    return head("Renewals", "Auto-renewing plans due in the next 30 days, and whether your wallet covers them.") +
      '<div class="pd-grid c4">' + stat("Due in 30 days", U.num(due.length), "Plans renewing") + stat("Wholesale needed", U.inr(due.reduce(function (s, c) { return s + (wprice(c) || 0); }, 0)), "Charged from your wallet") + stat("Wallet balance", U.inr(balance()), "Available now", true) + "</div>" +
      '<div class="tbl-wrap pd-mt"><table class="ad-tight"><thead><tr><th>Client</th><th>Plan</th><th>Renews</th><th class="r">Wholesale</th><th>Wallet cover</th></tr></thead><tbody>' +
      (due.length ? due.map(function (c) {
        var w = wprice(c) || 0, dd = daysTo(c.period_end); run += w;
        var ok = run <= balance();
        return "<tr><td>" + esc(c.name || c.client_id) + "</td><td>" + esc(planName(c.plan_key)) + "</td><td>" + U.date(c.period_end) + ' <span class="ad-muted">' + (dd < 0 ? Math.abs(dd) + " days overdue" : dd === 0 ? "today" : "in " + dd + " days") + '</span></td><td class="r">' + U.inr(w) + "</td><td>" + chip(ok ? "Covered" : "Top up needed", ok ? "ok" : "bad") + "</td></tr>";
      }).join("") : '<tr><td colspan="5"><div class="tbl-empty">No renewals due in the next 30 days.</div></td></tr>') + "</tbody></table></div>" +
      '<p class="ad-muted ad-mt">Cover is checked in due-date order against your current balance.</p>';
  }

  function vReports() {
    var t = totals(), cl = state.d.clients.filter(function (c) { return c.status !== "removed"; });
    var ex = state.extra.usage;
    return head("Reports", "Margin and activity across your clients.", '<button type="button" class="btn btn-ghost btn-sm" data-act="csv-report">Export CSV</button>') +
      '<div class="pd-grid c4">' + stat("Live clients", U.num(t.live), "Paying plans right now") + stat("Monthly billing", U.inr(t.rev), "Your prices") + stat("Wholesale cost", U.inr(t.cost), "Charged from your wallet") + stat("Monthly margin", U.inr(t.margin), "Yearly " + U.inr(t.margin * 12), true) + "</div>" +
      '<div class="tbl-wrap pd-mt"><table class="ad-tight"><thead><tr><th>Client</th><th>Plan</th><th>Status</th><th class="r">Price</th><th class="r">Cost</th><th class="r">Margin</th><th class="r">Margin %</th><th class="r">Messages</th><th class="r">Leads</th></tr></thead><tbody>' +
      (cl.length ? cl.map(function (c) {
        var m = margin(c), s = clientState(c), u = (ex && ex !== "missing" && ex[c.client_id]) || {};
        var pct = m != null && Number(c.client_price) > 0 ? Math.round((m / Number(c.client_price)) * 100) + "%" : "—";
        return "<tr><td>" + esc(c.name || c.client_id) + "</td><td>" + esc(planName(c.plan_key)) + "</td><td>" + chip(s[0], s[1]) + '</td><td class="r">' + (c.client_price != null ? U.inr(c.client_price) : "—") + '</td><td class="r">' + (wprice(c) != null ? U.inr(wprice(c)) : "—") + '</td><td class="r ' + (m == null ? "" : m < 0 ? "ad-neg" : "ad-pos") + '">' + (m == null ? "—" : U.inr(m)) + '</td><td class="r">' + pct + '</td><td class="r">' + (u.messages != null ? U.num(u.messages) : "—") + '</td><td class="r">' + (u.leads != null ? U.num(u.leads) : "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="9"><div class="tbl-empty">Add clients to see reports.</div></td></tr>') + "</tbody></table></div>" +
      '<p class="ad-muted ad-mt">' + (ex === "missing" ? "Message and lead counts appear once usage reporting is live." : ex ? "Usage covers the last 30 days." : "Loading usage...") + "</p>";
  }

  function vTeam() {
    var tm = state.extra.team;
    var body;
    if (tm === "missing") body = soon("Team access");
    else if (!tm) body = '<div class="empty"><strong>Loading team...</strong></div>';
    else body = '<div class="tbl-wrap"><table class="ad-tight"><thead><tr><th>Member</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>' +
      (tm.length ? tm.map(function (m) {
        return "<tr><td>" + esc(m.email || m.name) + "</td><td>" + esc(m.role) + "</td><td>" + chip(m.status || "invited", m.status === "active" ? "ok" : "warn") + '</td><td class="r">' + (m.role !== "owner" ? '<button type="button" class="btn btn-ghost btn-sm" data-act="rm-member" data-id="' + esc(m.id) + '">Remove</button>' : "") + "</td></tr>";
      }).join("") : '<tr><td colspan="4"><div class="tbl-empty">Only you so far. Invite a team member below.</div></td></tr>') + "</tbody></table></div>";
    return head("Team", "Give staff limited access. Only the owner can manage the wallet and team.") + body +
      '<div class="pd-card pd-mt"><h2>Invite a team member</h2><form id="teamForm" novalidate><div class="ad-row2"><div class="f"><label for="tmEmail">Google email</label><input id="tmEmail" type="email" maxlength="120"></div><div class="f"><label for="tmRole">Role</label><select id="tmRole">' +
      A.roles.map(function (r) { return '<option value="' + r.key + '">' + esc(r.name) + " — " + esc(r.desc) + "</option>"; }).join("") + '</select></div></div><button type="submit" class="btn btn-primary btn-sm">Send invite</button><p class="f-msg" id="tmMsg" role="alert"></p></form></div>';
  }

  function pitch() {
    var base = C.referralBase;
    return [
      ["Intro message to a business", "Hi! We help businesses reply faster on WhatsApp and Instagram, capture every lead and never miss a follow-up, all in one dashboard. We can set it up for you and manage it every month. Want a quick 10-minute demo this week?"],
      ["Offer message", "Many of your enquiries on WhatsApp and Instagram probably go unanswered after hours. We set up GLIME so every chat gets a reply, leads are saved and follow-ups are automatic. Setup is done by our team. Shall I share the plan options?"],
      ["Client invite after signing", "Welcome aboard! Your GLIME account is ready. Please sign in at " + base + "login.html with your registered number or email. We will connect your WhatsApp and Instagram and share a short setup checklist."]
    ];
  }
  function vResources() {
    var steps = ["Collect the client business name, WhatsApp number and email", "Agree your monthly price with the client", "Add the client here and choose the plan", "Set your client price so margin is tracked", "Send the client the setup link so they can set a password", "Connect WhatsApp and Instagram in the client account", "Add services, prices and FAQs to the Knowledge Base", "Test a few chats, then go live", "Share the first weekly report"];
    return head("Resources", "Everything to pitch, onboard and keep clients.") +
      '<div class="ad-split"><div class="pd-card"><h2>Client onboarding checklist</h2><ul class="check" style="margin-top:10px">' + steps.map(function (s, i) {
        var k = "glime_ad_step" + i;
        return '<li class="' + (flag(k) ? "done" : "") + '"><span class="dot" data-act="tick" data-k="' + k + '" style="cursor:pointer">' + (flag(k) ? "✓" : "") + "</span><span>" + esc(s) + "</span></li>";
      }).join("") + '</ul></div><div class="pd-card"><h2>Guides and terms</h2><ul class="ad-list"><li><a href="partner-docs.html" data-flag="glime_ad_guide">Partner Guide</a></li><li><a href="terms.html">Terms of service</a></li><li><a href="privacy.html">Privacy policy</a></li><li><a href="agency.html#faq">Agency FAQ</a></li><li><a href="GLIME_Official_Integration_Guide.html">Integration guide (WhatsApp, Instagram)</a></li></ul></div></div>' +
      '<div class="pd-card pd-mt"><h2>Pitch messages</h2><p class="sub">Copy, adjust to your voice and send. Keep claims accurate.</p>' + pitch().map(function (p, i) {
        return '<p class="mono" style="font-size:.72rem;color:var(--green);margin-bottom:6px">' + esc(p[0]) + '</p><div class="copyblock">' + esc(p[1]) + '</div><button type="button" class="btn btn-ghost btn-sm" data-act="copy-pitch" data-i="' + i + '" style="margin-bottom:18px">Copy message</button>';
      }).join("") + "</div>";
  }

  function vSupport() {
    return head("Support", "Questions about billing, clients or setup? Send us a note.") +
      '<div class="ad-split"><div class="pd-card"><h2>Contact support</h2><form id="supForm" novalidate><div class="f"><label for="suSub">Subject</label><input id="suSub" type="text" maxlength="120"></div><div class="f"><label for="suMsg">Message</label><textarea id="suMsg" rows="5" maxlength="2000"></textarea></div><button type="submit" class="btn btn-primary btn-sm" id="suBtn">Send</button><p class="f-msg" id="suOut" role="alert"></p></form></div>' +
      '<div class="pd-card"><h2>Other ways to reach us</h2><p class="sub">Include your agency code <strong>' + esc((state.d.agency || {}).code || "") + '</strong> so we can help faster.</p><a class="btn btn-ghost btn-sm" href="contact.html">Contact page</a></div></div>';
  }

  function vProfile() {
    var u = state.user, m = (u && u.user_metadata) || {}, a = state.d.agency || {};
    return head("Profile", "Your agency account.") +
      '<div class="pd-card"><dl class="kv"><dt>Agency</dt><dd>' + esc(a.business_name || "—") + "</dd><dt>Agency code</dt><dd>" + esc(a.code || "—") + "</dd><dt>Owner</dt><dd>" + esc(m.full_name || m.name || "—") + "</dd><dt>Email</dt><dd>" + esc((u && u.email) || "—") + "</dd><dt>Sign-in</dt><dd>Google</dd><dt>Tier</dt><dd>" + esc(a.tier || "—") + " · " + Math.round(Number(a.wholesale_discount || 0) * 100) + "% wholesale discount</dd><dt>Status</dt><dd>" + esc(String(a.status || "active")) + "</dd><dt>Agency since</dt><dd>" + U.date(a.joined_at) + '</dd></dl></div>' +
      '<div class="pd-card pd-mt"><h2>Update business details</h2><p class="sub">Used on invoices and for support.</p><form id="profForm" novalidate><div class="ad-row2"><div class="f"><label for="pfPhone">Phone</label><input id="pfPhone" type="tel" maxlength="20"></div><div class="f"><label for="pfCity">City</label><input id="pfCity" type="text" maxlength="80"></div></div><div class="ad-row2"><div class="f"><label for="pfPan">PAN</label><input id="pfPan" type="text" maxlength="10" style="text-transform:uppercase"></div><div class="f"><label for="pfGst">GST number</label><input id="pfGst" type="text" maxlength="15" style="text-transform:uppercase"></div></div><div class="f"><label for="pfWeb">Website or Instagram</label><input id="pfWeb" type="text" maxlength="200"></div><button type="submit" class="btn btn-primary btn-sm">Save details</button><p class="f-msg" id="pfOut" role="alert"></p></form></div>' +
      '<div class="pd-card pd-mt"><h2>Account</h2><p class="sub">Agency accounts are separate from GLIME client accounts. Signing out here does not affect a client login.</p><button type="button" class="btn btn-ghost btn-sm" data-act="signout">Sign out</button></div>';
  }

  function vActivity() {
    var a = state.extra.activity, body;
    if (a === "missing") body = soon("Activity log");
    else if (!a) body = '<div class="empty"><strong>Loading activity...</strong></div>';
    else body = '<div class="tbl-wrap"><table class="ad-tight"><thead><tr><th>When</th><th>Event</th><th>Client</th></tr></thead><tbody>' +
      (a.length ? a.map(function (x) {
        return "<tr><td>" + U.date(x.created_at) + "</td><td>" + esc(String(x.event_type || "").replace(/_/g, " ")) + "</td><td>" + esc(x.client_id || "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="3"><div class="tbl-empty">No activity yet.</div></td></tr>') + "</tbody></table></div>";
    return head("Activity", "Everything done on your agency account, including every time a client account is opened.") + body;
  }
  async function loadActivity() {
    try {
      var r = await sb.rpc("agency_get_activity", { p_limit: 50 });
      if (r.error) throw r.error;
      state.extra.activity = Array.isArray(r.data) ? r.data : (r.data && r.data.events) || [];
    } catch (e) { state.extra.activity = "missing"; }
    if (view() === "activity") render();
  }

  var RENDER = { overview: vOverview, clients: vClients, wallet: vWallet, plans: vPlans, renewals: vRenewals, reports: vReports, team: vTeam, activity: vActivity, resources: vResources, support: vSupport, profile: vProfile };

  /* ---------------- router ---------------- */
  function view() { var h = location.hash.replace(/^#/, ""); return VIEWS.indexOf(h) > -1 ? h : "overview"; }
  function render() {
    var v = view();
    $("pdView").innerHTML = RENDER[v]();
    document.querySelectorAll("#pdNav a").forEach(function (a) {
      var on = a.getAttribute("data-view") === v; a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = v.charAt(0).toUpperCase() + v.slice(1) + " | Agency Dashboard | GLIME";
    if (v === "reports" && !state.extra.usage) loadUsage();
    if (v === "team" && !state.extra.team) loadTeam();
    if (v === "activity" && !state.extra.activity) loadActivity();
  }
  function go() { render(); window.scrollTo({ top: 0 }); $("pdMain").focus({ preventScroll: true }); }
  async function refresh() { await load(); paintUser(); render(); }

  async function loadUsage() {
    try {
      var r = await sb.rpc("agency_get_reports", { p_days: 30 });
      if (r.error) throw r.error;
      var rows = Array.isArray(r.data) ? r.data : (r.data && r.data.clients) || [], map = {};
      rows.forEach(function (x) { map[x.client_id] = x; });
      state.extra.usage = map;
    } catch (e) { state.extra.usage = "missing"; }
    if (view() === "reports") render();
  }
  async function loadTeam() {
    try {
      var r = await sb.rpc("agency_list_team");
      if (r.error) throw r.error;
      state.extra.team = Array.isArray(r.data) ? r.data : (r.data && r.data.members) || [];
    } catch (e) { state.extra.team = "missing"; }
    if (view() === "team") render();
  }

  /* ---------------- client modals ---------------- */
  function addClientModal() {
    var opts = state.d.plans.map(function (p) { return '<option value="' + esc(p.plan_code) + '">' + esc(p.name) + " — wholesale " + U.inr(p.wholesale_price) + "</option>"; }).join("");
    openModal('<h2 id="adModalTitle">Add client</h2><p class="sub">A GLIME account is created for the client under your agency (up to 10 new clients per day). The plan charge is taken from your wallet (balance ' + U.inr(balance()) + ").</p>" +
      '<form id="addForm" novalidate><div class="f"><label for="acName">Client business name *</label><input id="acName" type="text" maxlength="120"></div><div class="ad-row2"><div class="f"><label for="acPhone">WhatsApp number *</label><input id="acPhone" type="tel" maxlength="20" inputmode="tel"></div><div class="f"><label for="acEmail">Email *</label><input id="acEmail" type="email" maxlength="120"></div></div><div class="ad-row2"><div class="f"><label for="acPlan">Plan</label><select id="acPlan"><option value="">Choose later</option>' + opts + '</select></div><div class="f"><label for="acPrice">Your price (₹/month)</label><input id="acPrice" type="number" min="0" step="1" inputmode="numeric"></div></div><button type="submit" class="btn btn-primary btn-sm" id="acBtn">Create client</button><p class="f-msg" id="acMsg" role="alert"></p></form>');
    $("addForm").addEventListener("submit", async function (e) {
      e.preventDefault();
      var msg = $("acMsg"), btn = $("acBtn"), name = $("acName").value.trim(), phone = $("acPhone").value.trim(), email = $("acEmail").value.trim().toLowerCase();
      var price = $("acPrice").value === "" ? null : Number($("acPrice").value);
      msg.className = "f-msg err";
      if (name.length < 2) { msg.textContent = "Please enter the client business name."; return; }
      if (phone.replace(/\D/g, "").length < 8) { msg.textContent = "Please enter a valid WhatsApp number."; return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "Please enter a valid email."; return; }
      if (price != null && (isNaN(price) || price < 0)) { msg.textContent = ERR.INVALID_PRICE; return; }
      btn.disabled = true; btn.textContent = "Creating...";
      try {
        var planCode = $("acPlan").value || null;
        var res = await api("glime-agency-api", { action: "create_client", name: name, phone: phone, email: email, plan_code: planCode, client_price: price });
        await refresh();
        createdModal(res, name, planCode);
      } catch (err) { msg.textContent = errText(err); btn.disabled = false; btn.textContent = "Create client"; }
    });
  }

  function createdModal(res, name, plan) {
    var link = /^https:\/\//.test(String(res.setup_link || "")) ? res.setup_link : "";
    state.lastLink = link; state.lastName = name;
    var failed = plan && res.plan_charged === false;
    if (failed) toast("Client created. Add the plan later.");
    openModal('<h2 id="adModalTitle">Client created</h2><p class="sub">' + esc(name) + " now has a GLIME account under your agency.</p>" +
      (failed ? '<div class="ad-alert">The plan was not applied' + (res.plan_error ? " (" + esc(errFor(res.plan_error)) + ")" : "") + ". You can apply it later from Manage.</div>" : "") +
      (link ? '<p class="sub">The client has no password yet. Send this setup link so they can set one and sign in.</p><div class="copyblock">' + esc(link) + '</div><div class="ad-actions"><button type="button" class="btn btn-primary btn-sm" data-act="copy-setup">Copy setup message</button><button type="button" class="btn btn-ghost btn-sm" data-act="close-modal">Done</button></div>' : '<div class="ad-actions"><button type="button" class="btn btn-ghost btn-sm" data-act="close-modal">Done</button></div>'));
  }

  function manageModal(id) {
    var c = state.d.clients.filter(function (x) { return x.client_id === id; })[0];
    if (!c) return;
    var s = clientState(c), m = margin(c);
    var opts = state.d.plans.map(function (p) { return '<option value="' + esc(p.plan_code) + '"' + (p.plan_code === c.plan_key ? " selected" : "") + ">" + esc(p.name) + " — " + U.inr(p.wholesale_price) + "</option>"; }).join("");
    openModal('<h2 id="adModalTitle">' + esc(c.name || c.client_id) + '</h2><p class="sub">' + esc(c.client_id) + " · " + esc(c.phone || c.email || "") + " · " + chip(s[0], s[1]) + "</p>" +
      '<dl class="kv"><dt>Plan</dt><dd>' + esc(planName(c.plan_key)) + "</dd><dt>Renews</dt><dd>" + (c.period_end ? U.date(c.period_end) + (c.auto_renew ? " (auto-renew)" : " (will not renew)") : "—") + "</dd><dt>Your price</dt><dd>" + (c.client_price != null ? U.inr(c.client_price) : "Not set") + "</dd><dt>Wholesale</dt><dd>" + (wprice(c) != null ? U.inr(wprice(c)) : "—") + "</dd><dt>Margin</dt><dd>" + (m == null ? "—" : U.inr(m)) + "</dd>" + (c.paused_reason ? "<dt>Paused because</dt><dd>" + esc(c.paused_reason) + "</dd>" : "") + "</dl><hr>" +
      '<h3>Plan</h3><div class="ad-row2"><div class="f"><select id="mgPlan" aria-label="Plan"><option value="">Choose a plan</option>' + opts + '</select></div><div class="f"><button type="button" class="btn btn-primary btn-sm" data-act="apply-plan" data-id="' + esc(id) + '">Apply plan</button></div></div><p class="ad-muted">A new or lapsed plan is charged from your wallet now. If a plan is already running, the change starts at the next renewal.</p>' +
      '<h3 style="margin-top:16px">Your price</h3><div class="ad-row2"><div class="f"><input id="mgPrice" data-w="' + (wprice(c) != null ? wprice(c) : "") + '" type="number" min="0" step="1" inputmode="numeric" value="' + (c.client_price != null ? esc(c.client_price) : "") + '" aria-label="Your price"></div><div class="f"><button type="button" class="btn btn-ghost btn-sm" data-act="save-price" data-id="' + esc(id) + '">Save price</button></div></div><p class="ad-muted" id="mgMargin"></p><hr>' +
      '<div class="ad-actions">' + (c.auto_renew ? '<button type="button" class="btn btn-ghost btn-sm" data-act="cancel-plan" data-id="' + esc(id) + '">Stop auto-renewal</button>' : "") +
      (c.status === "paused" ? '<button type="button" class="btn btn-ghost btn-sm" data-act="set-status" data-st="active" data-id="' + esc(id) + '">Resume account</button>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="set-status" data-st="paused" data-id="' + esc(id) + '">Pause account</button>') +
      '<button type="button" class="btn btn-ghost btn-sm" data-act="open-client" data-id="' + esc(id) + '">Open client account</button><button type="button" class="btn btn-ghost btn-sm" data-act="copy-invite" data-id="' + esc(id) + '">Copy setup message</button></div><p class="ad-muted" style="margin-top:10px">Opening a client account is recorded in your agency activity log.</p>');
  }

  async function doAction(btn, fn, okMsg, keepOpen) {
    btn.disabled = true;
    try { await fn(); toast(okMsg); await refresh(); if (!keepOpen) closeModal(); }
    catch (e) { toast(errText(e), true); }
    btn.disabled = false;
  }

  /* ---------------- top-up ---------------- */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  async function topup(amount) {
    var res0 = await api("glime-agency-wallet", { action: "topup_create_order", amount: amount });
    var d = res0.data || res0;
    if (d && d.checkout_url && /^https:\/\//.test(d.checkout_url)) { window.location.href = d.checkout_url; return; }
    if (d && d.razorpay_order_id && d.key_id) {
      await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      var rz = new window.Razorpay({
        key: d.key_id, order_id: d.razorpay_order_id, amount: Math.round(amount * 100), currency: "INR", name: "GLIME Agency Wallet",
        prefill: { email: (state.user && state.user.email) || "" },
        handler: function () { toast("Payment received. Updating your balance..."); setTimeout(refresh, 2500); setTimeout(refresh, 8000); }
      });
      rz.open(); return;
    }
    throw new Error("no checkout returned");
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", async function (e) {
    var fl = e.target.closest("[data-flag]"); if (fl) flag(fl.getAttribute("data-flag"), true);
    if (e.target.id === "adModal") { closeModal(); return; }
    var el = e.target.closest("[data-act]"); if (!el) return;
    var act = el.getAttribute("data-act"), id = el.getAttribute("data-id");
    if (act === "close-modal") closeModal();
    else if (act === "goto") { location.hash = el.getAttribute("data-v"); }
    else if (act === "add-client") addClientModal();
    else if (act === "manage") manageModal(id);
    else if (act === "apply-plan") {
      var code = $("mgPlan").value; if (!code) { toast("Choose a plan first.", true); return; }
      var p = planOf(code);
      var okGo = await ask("Apply " + (p ? p.name : "plan") + "?", "Wholesale " + (p ? U.inr(p.wholesale_price) : "") + " may be charged from your wallet now (balance " + U.inr(balance()) + ").", "Apply plan");
      if (!okGo) { manageModal(id); return; }
      await doAction(el, function () { return call("agency_set_client_plan", { p_client_id: id, p_plan_code: code }); }, "Plan updated");
    } else if (act === "save-price") {
      var raw = $("mgPrice").value, pr = raw === "" ? null : Number(raw);
      if (pr != null && (isNaN(pr) || pr < 0)) { toast(ERR.INVALID_PRICE, true); return; }
      await doAction(el, function () { return call("agency_set_client_price", { p_client_id: id, p_price: pr }); }, "Price saved");
    } else if (act === "cancel-plan") {
      if (await ask("Stop auto-renewal?", "The client keeps access until the current period ends and will not be charged again.", "Stop renewal"))
        await doAction(el, function () { return call("agency_cancel_client_plan", { p_client_id: id }); }, "Auto-renewal stopped");
      else manageModal(id);
    } else if (act === "set-status") {
      var st = el.getAttribute("data-st");
      if (st === "paused" && !(await ask("Pause this account?", "The client will not be able to use GLIME until you resume it.", "Pause"))) { manageModal(id); return; }
      await doAction(el, function () { return call("agency_set_client_status", { p_client_id: id, p_status: st }); }, st === "paused" ? "Account paused" : "Account resumed");
    } else if (act === "open-client") {
      el.disabled = true;
      try {
        var r = await api("glime-agency-api", { action: "open_client", client_id: id });
        var ou = r && (r.url || (r.data && r.data.url));
        if (ou && /^https:\/\//.test(ou)) { var w = window.open(ou, "_blank", "noopener"); if (!w) openModal('<h2 id="adModalTitle">Open client account</h2><p class="sub">Your browser blocked the new tab.</p><a class="btn btn-primary btn-sm" href="' + esc(ou) + '" target="_blank" rel="noopener">Open client account</a>'); }
        else toast("Client account opened.");
      } catch (err) { toast(errText(err), true); }
      el.disabled = false;
    } else if (act === "copy-invite") {
      var c = state.d.clients.filter(function (x) { return x.client_id === id; })[0] || {};
      el.disabled = true;
      try {
        var rs = await api("glime-agency-api", { action: "client_setup_link", client_id: id });
        var lk = rs.setup_link || (rs.data && rs.data.setup_link) || "";
        if (!/^https:\/\//.test(lk)) throw new Error("REQUEST_FAILED");
        toast((await copyText(setupMessage(c.name, lk))) ? "Setup message copied" : "Could not copy");
      } catch (err) { toast(errText(err), true); }
      el.disabled = false;
    } else if (act === "copy-pitch") {
      toast((await copyText(pitch()[Number(el.getAttribute("data-i"))][1])) ? "Message copied" : "Could not copy");
    } else if (act === "copy-setup") { toast((await copyText(setupMessage(state.lastName, state.lastLink))) ? "Setup message copied" : "Could not copy"); }
    else if (act === "dl-invoice") {
      el.disabled = true;
      try {
        var rr = await fetch(FN + "glime-agency-invoice?invoice_id=" + encodeURIComponent(id), { headers: { Authorization: "Bearer " + (await token()), apikey: C.supabaseKey } });
        if (!rr.ok) throw new Error("REQUEST_FAILED");
        var blob = await rr.blob(), a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = "glime-invoice-" + id + ".pdf"; document.body.appendChild(a); a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
      } catch (err) { toast("Could not download the invoice.", true); }
      el.disabled = false;
    }
    else if (act === "quick-amt") { $("tuAmt").value = el.getAttribute("data-a"); }
    else if (act === "csv-clients") {
      csv("glime-agency-clients.csv", [["Client ID", "Name", "Phone", "Email", "Plan", "Status", "Your price", "Wholesale", "Margin", "Renews"]].concat(state.d.clients.map(function (c) {
        return [c.client_id, c.name, c.phone, c.email, planName(c.plan_key), clientState(c)[0], c.client_price, wprice(c), margin(c), c.period_end ? U.date(c.period_end) : ""];
      })));
    } else if (act === "csv-tx") {
      csv("glime-agency-wallet.csv", [["Date", "Type", "Details", "Client", "Amount", "Balance after"]].concat((state.d.transactions || []).map(function (x) {
        return [x.created_at, x.type, x.description, x.client_id, x.amount, x.balance_after];
      })));
    } else if (act === "csv-report") {
      var ex = state.extra.usage && state.extra.usage !== "missing" ? state.extra.usage : {};
      csv("glime-agency-report.csv", [["Client", "Plan", "Status", "Price", "Cost", "Margin", "Messages (30d)", "Leads (30d)"]].concat(state.d.clients.map(function (c) {
        var u = ex[c.client_id] || {}; return [c.name || c.client_id, planName(c.plan_key), clientState(c)[0], c.client_price, wprice(c), margin(c), u.messages, u.leads];
      })));
    } else if (act === "load-invoices") {
      try { var r2 = await sb.rpc("agency_list_invoices"); if (r2.error) throw r2.error; state.extra.invoices = Array.isArray(r2.data) ? r2.data : []; }
      catch (err) { state.extra.invoices = "missing"; }
      render();
    } else if (act === "rm-member") {
      if (await ask("Remove this member?", "They will lose access to your agency dashboard.", "Remove")) {
        try { await call("agency_remove_member", { p_member_id: id }); toast("Member removed"); state.extra.team = null; render(); } catch (err) { toast(errText(err), true); }
      }
    } else if (act === "tick") { var k = el.getAttribute("data-k"); flag(k, !flag(k)); render(); }
    else if (act === "signout") await signOut();
  });

  document.addEventListener("input", function (e) {
    if (e.target.id === "cSearch") { state.cQuery = e.target.value; $("cBody").innerHTML = clientRows(); }
    else if (e.target.id === "mgPrice") {
      var wr = e.target.getAttribute("data-w"), pv = e.target.value === "" ? null : Number(e.target.value), mm = $("mgMargin");
      if (mm) mm.textContent = (wr === "" || pv == null || isNaN(pv)) ? "" : "Margin at this price: " + U.inr(pv - Number(wr)) + (pv > 0 ? " (" + Math.round(((pv - Number(wr)) / pv) * 100) + "%)" : "");
    }
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "cFilter") { state.cFilter = e.target.value; $("cBody").innerHTML = clientRows(); }
    else if (e.target.id === "cSort") { state.cSort = e.target.value; $("cBody").innerHTML = clientRows(); }
    else if (e.target.id === "txFilter") { state.txFilter = e.target.value; $("txBody").innerHTML = txRows(); }
  });
  document.addEventListener("submit", async function (e) {
    var f = e.target.id;
    if (f === "topupForm") {
      e.preventDefault();
      var amt = Number($("tuAmt").value), msg = $("tuMsg"), btn = $("tuBtn"); msg.className = "f-msg err";
      if (!amt || amt < minTopup()) { msg.textContent = "The minimum top-up is " + U.inr(minTopup()) + "."; return; }
      if (amt > 1000000) { msg.textContent = "For amounts above ₹10,00,000 please contact GLIME."; return; }
      btn.disabled = true; btn.textContent = "Opening payment...";
      try { await topup(amt); msg.className = "f-msg ok"; msg.textContent = "Complete the payment in the window that opened."; }
      catch (err) { msg.textContent = isMissingFn(err) || /no checkout/.test(String(err && err.message)) ? "Online top-up could not start. Please try again or contact GLIME." : errText(err); }
      btn.disabled = false; btn.textContent = "Pay and add money";
    } else if (f === "teamForm") {
      e.preventDefault();
      var em = $("tmEmail").value.trim().toLowerCase(), out = $("tmMsg"); out.className = "f-msg err";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { out.textContent = "Please enter a valid email."; return; }
      try { await call("agency_invite_member", { p_email: em, p_role: $("tmRole").value }); out.className = "f-msg ok"; out.textContent = "Invite sent."; state.extra.team = null; loadTeam(); }
      catch (err) { out.textContent = errText(err); }
    } else if (f === "supForm") {
      e.preventDefault();
      var sub = $("suSub").value.trim(), body = $("suMsg").value.trim(), o = $("suOut"); o.className = "f-msg err";
      if (sub.length < 3 || body.length < 10) { o.textContent = "Please add a subject and a short description."; return; }
      try { await call("agency_submit_support", { p_subject: sub, p_message: body }); o.className = "f-msg ok"; o.textContent = "Thanks, we received your message."; $("suSub").value = ""; $("suMsg").value = ""; }
      catch (err) { o.textContent = isMissingFn(err) ? "Support tickets are not live yet. Please use the Contact page." : errText(err); }
    } else if (f === "profForm") {
      e.preventDefault();
      var po = $("pfOut"), pan = $("pfPan").value.trim().toUpperCase(), gst = $("pfGst").value.trim().toUpperCase(); po.className = "f-msg err";
      if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) { po.textContent = "PAN looks wrong. Format: ABCDE1234F."; return; }
      if (gst && gst.length !== 15) { po.textContent = "GST number should be 15 characters."; return; }
      try { await call("agency_update_profile", { p_details: { contact_phone: $("pfPhone").value.trim(), city: $("pfCity").value.trim(), website: $("pfWeb").value.trim(), pan: pan, gst: gst } }); po.className = "f-msg ok"; po.textContent = "Details saved."; }
      catch (err) { po.textContent = errText(err); }
    }
  });
  window.addEventListener("hashchange", go);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeModal(); setMenu(false); } });

  var menuBtn = $("pdUserBtn"), menu = $("pdMenu");
  function setMenu(o) { menu.hidden = !o; menuBtn.setAttribute("aria-expanded", String(o)); }
  menuBtn.addEventListener("click", function (e) { e.stopPropagation(); setMenu(menu.hidden); });
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target)) setMenu(false); });
  $("pdSignOut").addEventListener("click", signOut);
  async function signOut() { try { await sb.auth.signOut(); } catch (e) {} location.replace(A.pages.landing); }

  /* ---------------- boot ---------------- */
  function paintUser() {
    var u = state.user, m = u.user_metadata || {}, a = state.d.agency || {};
    var name = a.business_name || m.full_name || m.name || (u.email ? u.email.split("@")[0] : "Agency");
    $("pdUserName").textContent = name; $("pdMenuEmail").textContent = u.email || "";
    var av = $("pdAvatar"), pic = m.avatar_url || m.picture;
    if (pic && /^https:\/\//i.test(pic)) {
      var img = document.createElement("img"); img.src = pic; img.alt = ""; img.referrerPolicy = "no-referrer";
      img.onerror = function () { av.textContent = name.charAt(0).toUpperCase(); };
      av.textContent = ""; av.appendChild(img);
    } else av.textContent = name.charAt(0).toUpperCase();
    $("pdTier").textContent = a.tier || "Agency";
  }
  function gateScreen(a) {
    var map = {
      pending: ["Application under review", "We are reviewing your agency application. You will get access here as soon as it is approved."],
      rejected: ["Application not approved", a.review_note || "Your application could not be approved this time. You can update your details and apply again."],
      suspended: ["Account suspended", a.review_note || "Your agency account is currently suspended. Please contact GLIME."]
    };
    var m = map[a.status] || map.pending;
    $("pdNav").hidden = true;
    $("pdView").innerHTML = head(m[0], esc(m[1])) + '<div class="pd-card"><p class="sub">Agency code ' + esc(a.code || "—") + '</p><div class="ad-actions"><a class="btn btn-primary btn-sm" href="agency.html#apply">' + (a.status === "rejected" ? "Update and apply again" : "View application") + '</a><a class="btn btn-ghost btn-sm" href="contact.html">Contact GLIME</a></div></div>';
  }
  async function boot() {
    var res; try { res = await sb.auth.getSession(); } catch (e) { res = null; }
    var session = res && res.data && res.data.session;
    if (!session) { location.replace(A.pages.landing); return; }
    state.user = session.user;
    var h = location.hash, keep = VIEWS.indexOf(h.replace(/^#/, "")) > -1 ? h : "";
    try { history.replaceState(null, "", location.pathname + keep); } catch (e) {}
    sb.auth.onAuthStateChange(function (ev) { if (ev === "SIGNED_OUT") location.replace(A.pages.landing); });
    await load();
    if (!state.d.agency) { location.replace(A.pages.landing + "#apply"); return; }
    paintUser();
    $("pdLoading").hidden = true; $("pdShell").hidden = false;
    if (state.d.agency.status !== "active") { gateScreen(state.d.agency); return; }
    render();
  }
  boot();
})();
