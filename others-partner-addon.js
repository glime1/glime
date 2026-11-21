/* =========================================================
   GLIME OTHERS > PARTNER PROGRAM  (embedded dashboard)
   ---------------------------------------------------------
   Two ways to use the Partner Program:

   1. Signed-in GLIME clients (this file)
      The partner dashboard opens right here inside the client app
      (others.html#partner), using the client's own login. It has the
      same sections as the standalone dashboard: Overview, Referral
      link, Referrals, Earnings, Payouts, Resources, Profile.
      It uses only the partner RPCs below, never the client's business
      data, so it keeps working even when the client's trial is over
      and the rest of the client dashboard is locked.

   2. Everyone else (students, creators, anyone without a GLIME client
      account)
      Unchanged. They use partner.html (Continue with Google) and the
      standalone partner-dashboard.html.

   RPCs used (same contract as partner-dashboard.js, see PARTNER_PROGRAM.md):
     partner_get_dashboard()
     partner_save_payout_details(p_method, p_details)
   Both run as the signed-in user (auth.uid()).

   Numbers (tiers, hold days, minimum payout, payout day) come from
   partner-config.js, loaded here on demand.
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var STYLE_ID = 'othPartnerStyle';

  var CSS =
    '.opd .opd-tabs{display:flex;gap:8px;overflow:auto;padding:2px 0 14px}' +
    '.opd .opd-tabs button{flex:none;border:1px solid var(--bd);background:transparent;color:var(--mu);padding:10px 15px;border-radius:11px;font-size:.82rem;font-weight:800}' +
    '.opd .opd-tabs button.active{color:var(--cy);border-color:rgba(82,232,255,.35);background:rgba(82,232,255,.07)}' +
    'html[data-theme="light"] .opd .opd-tabs button.active{color:#0e7490;border-color:rgba(14,116,144,.45);background:rgba(14,116,144,.09)}' +
    '.opd .opd-banner{border:1px solid var(--bd);border-radius:14px;padding:12px 14px;margin-bottom:14px;font-size:.78rem;color:var(--mu);background:var(--surf)}' +
    '.opd .opd-banner.warn{color:#ffc83d;border-color:rgba(255,200,61,.4)}' +
    'html[data-theme="light"] .opd .opd-banner.warn{color:#b45309}' +
    '.opd .opd-banner[hidden]{display:none}' +
    '.opd .opd-h{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:2px 0 14px;flex-wrap:wrap}' +
    '.opd .opd-h h3{font-size:1.08rem;margin:0}' +
    '.opd .opd-h p{color:var(--mu);font-size:.76rem;margin:2px 0 0}' +
    '.opd .opd-grid{display:grid;gap:12px}' +
    '.opd .opd-g4{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}' +
    '.opd .opd-g2{grid-template-columns:repeat(auto-fit,minmax(270px,1fr))}' +
    '.opd .opd-grid .card{margin-bottom:0}' +
    '.opd .opd-mt{margin-top:14px}' +
    '.opd .card h4{font-size:1rem;margin:0 0 4px}' +
    '.opd .sub{color:var(--mu);font-size:.78rem;margin:0}' +
    '.opd .opd-stat .k{font-size:.68rem;color:var(--mu);font-weight:800;letter-spacing:.05em}' +
    '.opd .opd-stat .v{font-size:1.45rem;font-weight:800;letter-spacing:-.02em;margin:3px 0}' +
    '.opd .opd-stat .v.g{color:var(--gr)}' +
    'html[data-theme="light"] .opd .opd-stat .v.g{color:#047857}' +
    '.opd .opd-stat .n{font-size:.7rem;color:var(--mu)}' +
    '.opd .opd-chart{display:flex;align-items:flex-end;gap:10px;height:160px;margin-top:12px}' +
    '.opd .opd-chart .col{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px}' +
    '.opd .opd-chart em{font-style:normal;font-size:.62rem;color:var(--mu)}' +
    '.opd .opd-chart b{display:block;width:70%;max-width:38px;border-radius:6px 6px 0 0;background:linear-gradient(var(--gr),var(--cy))}' +
    '.opd .opd-chart span{font-size:.68rem;color:var(--mu)}' +
    '.opd .opd-bar{height:8px;border-radius:99px;background:rgba(128,160,180,.22);overflow:hidden;margin:12px 0 6px}' +
    '.opd .opd-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gr),var(--cy))}' +
    '.opd .opd-tier{display:flex;justify-content:space-between;font-size:.72rem;color:var(--mu)}' +
    '.opd .opd-check{list-style:none;padding:0;margin:10px 0 0}' +
    '.opd .opd-check li{display:flex;gap:10px;align-items:center;padding:7px 0;font-size:.82rem}' +
    '.opd .opd-check .dot{flex:none;width:20px;height:20px;border-radius:50%;border:1.5px solid var(--bd);display:grid;place-items:center;font-size:.7rem}' +
    '.opd .opd-check li.done .dot{background:var(--gr);color:#031014;border-color:transparent}' +
    '.opd .opd-a{color:var(--cy);text-decoration:underline;background:none;border:0;padding:0;cursor:pointer;font:inherit}' +
    'html[data-theme="light"] .opd .opd-a{color:#0e7490}' +
    '.opd label{display:block;font-size:.72rem;font-weight:800;color:var(--mu);margin-bottom:5px}' +
    '.opd small{display:block;color:var(--mu);font-size:.7rem;margin-top:4px}' +
    '.opd input,.opd select{width:100%;background:transparent;color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:11px 12px;font:inherit;font-size:.86rem}' +
    '.opd select option{color:#111}' +
    '.opd input:focus,.opd select:focus{outline:2px solid rgba(14,116,144,.45);outline-offset:1px}' +
    '.opd .opd-f{margin-bottom:12px}' +
    '.opd .opd-linkbox{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}' +
    '.opd .opd-linkbox input{flex:1 1 220px;min-width:0}' +
    '.opd .opd-share{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}' +
    '.opd .opd-tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}' +
    '.opd .opd-tools input{flex:1 1 200px;min-width:0}' +
    '.opd .opd-tools select{flex:0 1 180px}' +
    '.opd .opd-chip{display:inline-block;padding:3px 10px;border-radius:99px;font-size:.68rem;font-weight:800;border:1px solid var(--bd);color:var(--mu)}' +
    '.opd .opd-chip.ok{color:var(--gr);border-color:rgba(80,245,168,.4)}' +
    '.opd .opd-chip.warn{color:#ffc83d;border-color:rgba(255,200,61,.4)}' +
    '.opd .opd-chip.bad{color:var(--rd);border-color:rgba(255,130,145,.4)}' +
    '.opd .opd-chip.info{color:var(--cy);border-color:rgba(82,232,255,.4)}' +
    'html[data-theme="light"] .opd .opd-chip.ok{color:#047857;border-color:rgba(4,120,87,.4)}' +
    'html[data-theme="light"] .opd .opd-chip.warn{color:#b45309;border-color:rgba(180,83,9,.4)}' +
    'html[data-theme="light"] .opd .opd-chip.bad{color:#c62828;border-color:rgba(198,40,40,.4)}' +
    'html[data-theme="light"] .opd .opd-chip.info{color:#0e7490;border-color:rgba(14,116,144,.45)}' +
    '.opd .opd-tw{overflow-x:auto;border:1px solid var(--bd);border-radius:14px;background:var(--surf)}' +
    '.opd table{width:100%;border-collapse:collapse;min-width:520px;font-size:.8rem}' +
    '.opd th{text-align:left;padding:11px 13px;color:var(--mu);font-size:.66rem;letter-spacing:.07em;border-bottom:1px solid var(--bd)}' +
    '.opd td{padding:11px 13px;border-bottom:1px solid var(--bd)}' +
    '.opd tr:last-child td{border-bottom:0}' +
    '.opd .r{text-align:right}' +
    '.opd .opd-empty{padding:22px;text-align:center;color:var(--mu);font-size:.8rem}' +
    '.opd .opd-copy{background:rgba(128,160,180,.1);border:1px solid var(--bd);border-radius:12px;padding:12px;font-size:.8rem;margin-bottom:8px;word-break:break-word}' +
    '.opd .opd-lbl{font-size:.72rem;font-weight:800;color:var(--cy);margin:0 0 6px}' +
    'html[data-theme="light"] .opd .opd-lbl{color:#0e7490}' +
    '.opd a.opd-rc{display:block;text-decoration:none;color:inherit}' +
    '.opd a.opd-rc h4{margin-bottom:4px}' +
    '.opd dl{display:grid;grid-template-columns:140px 1fr;gap:10px 14px;margin:0;font-size:.82rem}' +
    '.opd dt{color:var(--mu)}.opd dd{margin:0;word-break:break-word}' +
    '.opd .opd-msg{font-size:.76rem;margin-top:10px;min-height:1em}' +
    '.opd .opd-msg.ok{color:var(--gr)}.opd .opd-msg.err{color:var(--rd)}' +
    'html[data-theme="light"] .opd .opd-msg.ok{color:#047857}' +
    'html[data-theme="light"] .opd .opd-msg.err{color:#c62828}' +
    '@media(max-width:760px){.opd input,.opd select{font-size:16px}.opd dl{grid-template-columns:1fr}.opd dt{margin-top:6px}}';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function loadConfig() {
    return new Promise(function (resolve, reject) {
      if (window.GLIME_PARTNER) { resolve(); return; }
      var s = document.createElement('script');
      s.src = 'partner-config.js';
      s.onload = function () { window.GLIME_PARTNER ? resolve() : reject(new Error('Partner settings missing')); };
      s.onerror = function () { reject(new Error('Could not load partner-config.js')); };
      document.head.appendChild(s);
    });
  }

  var VIEWS = [
    ['overview', 'Overview'], ['link', 'Referral link'], ['referrals', 'Referrals'],
    ['earnings', 'Earnings'], ['payouts', 'Payouts'], ['resources', 'Resources'], ['profile', 'Profile']
  ];

  async function renderPartner(ctx) {
    injectStyle();
    await loadConfig();

    var C = window.GLIME_PARTNER, P = C.program, U = C.util, esc = U.esc;
    var sb = ctx.api.supabase;
    var client = ctx.state.client || {};
    var user = (ctx.state.session && ctx.state.session.user) || {};
    var st = { data: null, view: 'overview', refFilter: 'all', refQuery: '', tag: '' };

    /* ---------------- data ---------------- */
    function emptyData() {
      return {
        partner: { code: null, status: 'active', tier: null, joined_at: null, payout: null },
        stats: { clicks: 0, signups: 0, active_customers: 0, pending_earnings: 0, available_balance: 0, lifetime_earnings: 0, paid_out: 0 },
        referrals: [], earnings: [], payouts: []
      };
    }

    function normalize(raw) {
      var d = emptyData();
      if (raw && typeof raw === 'object') {
        if (raw.partner && typeof raw.partner === 'object') Object.assign(d.partner, raw.partner);
        if (raw.stats && typeof raw.stats === 'object') Object.assign(d.stats, raw.stats);
        ['referrals', 'earnings', 'payouts'].forEach(function (k) { if (Array.isArray(raw[k])) d[k] = raw[k]; });
      }
      return d;
    }

    function isMissingFn(err) {
      var m = String((err && err.message) || '');
      return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function|does not exist|schema cache/i.test(m));
    }

    async function loadData() {
      try {
        var r = await sb.rpc('partner_get_dashboard');
        if (r.error) throw r.error;
        st.data = normalize(Array.isArray(r.data) ? r.data[0] : r.data);
        banner('');
      } catch (err) {
        console.warn('partner_get_dashboard:', err);
        st.data = normalize(null);
        if (isMissingFn(err)) {
          banner('Your personal referral code, live clicks, sign-ups and earnings will appear here as soon as partner tracking is switched on for your account.', '');
        } else {
          banner('We could not load your latest numbers right now. Please refresh in a moment.', 'warn');
        }
      }
    }

    function safeCode() {
      var c = st.data && st.data.partner && st.data.partner.code;
      return c && /^[A-Za-z0-9_-]{3,32}$/.test(String(c)) ? String(c) : null;
    }

    function referralUrl(tag) {
      var code = safeCode();
      if (!code) return '';
      var u = C.referralBase.replace(/\/?$/, '/') + '?ref=' + encodeURIComponent(code);
      if (tag) u += '&src=' + encodeURIComponent(tag);
      return u;
    }

    function currentTier() {
      var s = st.data.stats;
      var byCount = U.tierFor(Number(s.active_customers) || 0);
      var named = st.data.partner.tier;
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
        if (v === undefined) return localStorage.getItem(k) === '1';
        localStorage.setItem(k, v ? '1' : '0');
      } catch (e) { /* ignore */ }
      return false;
    }

    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; }
      catch (e) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok;
        } catch (e2) { return false; }
      }
    }

    /* ---------------- shell ---------------- */
    ctx.container.innerHTML =
      '<div class="opd">' +
        '<div class="section-head"><h2>Partner Program</h2>' +
          '<p>Refer businesses to GLIME and earn commission when they subscribe.</p></div>' +
        '<div class="opd-banner" id="opdBanner" hidden></div>' +
        '<div class="opd-tabs" id="opdTabs" role="tablist">' +
          VIEWS.map(function (v) { return '<button type="button" role="tab" data-tab="' + v[0] + '">' + v[1] + '</button>'; }).join('') +
        '</div>' +
        '<div id="opdView"></div>' +
      '</div>';

    var root = ctx.container.querySelector('.opd');
    var viewBox = root.querySelector('#opdView');

    function banner(text, kind) {
      var b = root.querySelector('#opdBanner');
      if (!b) return;
      if (!text) { b.hidden = true; b.textContent = ''; return; }
      b.className = 'opd-banner' + (kind ? ' ' + kind : '');
      b.textContent = text;
      b.hidden = false;
    }

    function chip(map, key) {
      var m = map[String(key || '').toLowerCase()];
      return m ? '<span class="opd-chip ' + m[1] + '">' + m[0] + '</span>' : '<span class="opd-chip">' + esc(key || '\u2014') + '</span>';
    }
    var REF_STATUS = { signed_up: ['Signed up', 'info'], trial: ['On trial', 'warn'], active: ['Active', 'ok'], churned: ['Churned', 'bad'], refunded: ['Refunded', 'bad'] };
    var EARN_STATUS = { pending: ['Pending', 'warn'], available: ['Available', 'ok'], paid: ['Paid', 'info'], reversed: ['Reversed', 'bad'] };
    var PAY_STATUS = { processing: ['Processing', 'warn'], paid: ['Paid', 'ok'], failed: ['Failed', 'bad'] };

    function monthLabel(m, long) {
      var s = String(m || '');
      var d = new Date(s.length === 7 ? s + '-01' : s);
      if (isNaN(d)) return esc(s || '\u2014');
      return d.toLocaleDateString('en-IN', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
    }

    function head(title, sub, actionHtml) {
      return '<div class="opd-h"><div><h3>' + esc(title) + '</h3>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (actionHtml || '') + '</div>';
    }

    function stat(k, v, n, green) {
      return '<div class="card opd-stat"><div class="k">' + esc(k) + '</div><div class="v' + (green ? ' g' : '') + '">' + v + '</div><div class="n">' + n + '</div></div>';
    }

    function docLink(label, hash, flagKey) {
      return '<a class="opd-a" href="partner-docs.html' + hash + '" target="_blank" rel="noopener"' + (flagKey ? ' data-flag="' + flagKey + '"' : '') + '>' + label + '</a>';
    }

    /* ---------------- views ---------------- */
    function vOverview() {
      var d = st.data, s = d.stats;
      var customers = Number(s.active_customers) || 0;
      var tier = currentTier(), next = U.nextTier(customers);
      var pct = 100, tierMsg = 'You are on the top tier. Thank you for growing with GLIME.';
      if (next) {
        var span = next.minCustomers - tier.minCustomers || 1;
        pct = Math.max(4, Math.min(100, Math.round(((customers - tier.minCustomers) / span) * 100)));
        var need = next.minCustomers - customers;
        tierMsg = need + ' more active paying customer' + (need === 1 ? '' : 's') + ' to reach ' + esc(next.name) + ' (' + next.rate + '% commission).';
      }

      var rows = d.earnings.slice().sort(function (a, b) { return String(a.month).localeCompare(String(b.month)); }).slice(-6);
      var chart;
      if (!rows.length) {
        chart = '<div class="opd-empty"><strong>No earnings yet</strong><br>Your monthly commission chart appears after your first referred customer pays.</div>';
      } else {
        var max = Math.max.apply(null, rows.map(function (r) { return Number(r.amount) || 0; })) || 1;
        chart = '<div class="opd-chart">' + rows.map(function (r) {
          var a = Number(r.amount) || 0;
          return '<div class="col"><em>' + U.inr(a) + '</em><b style="height:' + Math.max(2, Math.round((a / max) * 110)) + 'px"></b><span>' + monthLabel(r.month) + '</span></div>';
        }).join('') + '</div>';
      }

      var hasCode = !!safeCode();
      var items = [
        { done: flag('glime_pd_copied'), html: hasCode ? '<button type="button" class="opd-a" data-tab="link">Copy your referral link</button>' : 'Your referral link is being prepared' },
        { done: flag('glime_pd_docs'), html: docLink('Read the Partner Guide', '', 'glime_pd_docs') },
        { done: !!(d.partner.payout && d.partner.payout.method), html: '<button type="button" class="opd-a" data-tab="payouts">Add your payout details</button>' },
        { done: (Number(s.signups) || 0) > 0, html: 'Get your first sign-up' }
      ];
      var doneCount = items.filter(function (i) { return i.done; }).length;

      return head('Overview', 'A snapshot of your partner performance.', '<button type="button" class="btn primary" data-tab="link">Get my referral link</button>') +
        '<div class="opd-grid opd-g4">' +
          stat('LINK CLICKS', U.num(s.clicks), 'Last ' + P.cookieDays + '-day tracking window') +
          stat('SIGN-UPS', U.num(s.signups), 'Businesses that created a GLIME account') +
          stat('ACTIVE CUSTOMERS', U.num(customers), 'Paying and attributed to you') +
          stat('AVAILABLE BALANCE', U.inr(s.available_balance), 'Next payout ' + U.date(nextPayoutDate()), true) +
        '</div>' +
        '<div class="opd-grid opd-g2 opd-mt">' +
          '<div class="card"><h4>Monthly earnings</h4><p class="sub">Commission earned over the last six months.</p>' + chart + '</div>' +
          '<div class="opd-grid">' +
            '<div class="card"><h4>' + esc(tier.name) + ' tier \u00B7 ' + tier.rate + '%</h4><p class="sub">' + tierMsg + '</p>' +
              '<div class="opd-bar"><i style="width:' + pct + '%"></i></div>' +
              '<div class="opd-tier"><span>' + customers + ' active</span><span>' + (next ? next.minCustomers + ' for ' + esc(next.name) : 'Top tier') + '</span></div></div>' +
            '<div class="card"><h4>Getting started</h4><p class="sub">' + doneCount + ' of ' + items.length + ' done</p><ul class="opd-check">' +
              items.map(function (i) { return '<li class="' + (i.done ? 'done' : '') + '"><span class="dot">' + (i.done ? '\u2713' : '') + '</span><span>' + i.html + '</span></li>'; }).join('') +
            '</ul></div>' +
          '</div>' +
        '</div>';
    }

    function shareTemplates(link) {
      return [
        { title: 'Short message', text: 'GLIME helps businesses manage WhatsApp and Instagram conversations, leads, orders and follow-ups in one place. Plans start at \u20B9299/month with a 7-day free trial. Try it here: ' + link },
        { title: 'For a client or colleague', text: 'If you get a lot of enquiries on WhatsApp or Instagram, take a look at GLIME. It connects chats, leads, orders, payments and follow-ups so nothing slips through. You can start a 7-day free trial here: ' + link },
        { title: 'For a post or newsletter', text: 'Small businesses lose sales in the gaps between chat, orders and follow-ups. GLIME brings them into one workspace. See how it works and start a 7-day free trial: ' + link }
      ];
    }

    function vLink() {
      var code = safeCode(), body;
      if (!code) {
        body = '<div class="card"><div class="opd-empty"><strong>Your referral link is being prepared</strong><br>Your personal link appears here as soon as partner tracking is switched on for your account. Refresh this page in a moment.</div></div>';
      } else {
        var link = referralUrl(st.tag);
        body = '<div class="card"><h4>Your personal referral link</h4><p class="sub">Anyone who signs up through this link within ' + P.cookieDays + ' days is attributed to you.</p>' +
          '<div class="opd-linkbox"><input id="opdRefLink" type="text" readonly value="' + esc(link) + '" aria-label="Your referral link">' +
          '<button type="button" class="btn primary" data-act="copy-link">Copy link</button></div>' +
          '<div class="opd-f opd-mt"><label for="opdTag">Campaign tag (optional)</label>' +
          '<input id="opdTag" type="text" maxlength="24" placeholder="e.g. instagram-bio" value="' + esc(st.tag) + '" autocomplete="off">' +
          '<small>Letters, numbers and hyphens. Use a different tag for each place you share, so you can see what works.</small></div>' +
          '<div class="opd-share"><button type="button" class="btn" data-act="share-wa">Share on WhatsApp</button>' +
          '<button type="button" class="btn" data-act="share-mail">Email</button>' +
          '<button type="button" class="btn" data-act="share-in">LinkedIn</button>' +
          (navigator.share ? '<button type="button" class="btn" data-act="share-native">More\u2026</button>' : '') + '</div></div>' +
          '<div class="card opd-mt"><h4>Ready-to-use messages</h4><p class="sub" style="margin-bottom:14px">Copy, adjust to your voice and share. Please keep claims accurate, see the ' + docLink('partner policies', '#policies', 'glime_pd_docs') + '.</p>' +
          shareTemplates(link).map(function (t, i) {
            return '<p class="opd-lbl">' + esc(t.title) + '</p><div class="opd-copy">' + esc(t.text) + '</div>' +
              '<button type="button" class="btn" data-act="copy-tpl" data-i="' + i + '" style="margin-bottom:18px">Copy message</button>';
          }).join('') + '</div>';
      }
      return head('Referral link', 'Share GLIME and earn when your referrals subscribe.') + body;
    }

    function referralRows() {
      var q = st.refQuery.trim().toLowerCase();
      var list = st.data.referrals.filter(function (r) {
        var okS = st.refFilter === 'all' || String(r.status).toLowerCase() === st.refFilter;
        var okQ = !q || String(r.masked_name || '').toLowerCase().indexOf(q) > -1;
        return okS && okQ;
      });
      if (!list.length) {
        return '<tr><td colspan="5"><div class="opd-empty">' + (st.data.referrals.length ? 'No referrals match your filters.' : 'No referrals yet. Share your link to get your first sign-up.') + '</div></td></tr>';
      }
      return list.map(function (r) {
        return '<tr><td>' + esc(r.masked_name || 'Customer') + '</td><td>' + esc(r.plan || '\u2014') + '</td><td>' + chip(REF_STATUS, r.status) +
          '</td><td>' + U.date(r.signed_up_at) + '</td><td class="r">' + (r.monthly_commission != null ? U.inr(r.monthly_commission) : '\u2014') + '</td></tr>';
      }).join('');
    }

    function vReferrals() {
      return head('Referrals', 'Every business you have referred and where they are now.') +
        '<div class="opd-tools"><input id="opdSearch" type="search" placeholder="Search referrals" value="' + esc(st.refQuery) + '" aria-label="Search referrals">' +
        '<select id="opdFilter" aria-label="Filter by status">' +
        [['all', 'All statuses'], ['signed_up', 'Signed up'], ['trial', 'On trial'], ['active', 'Active'], ['churned', 'Churned']].map(function (o) {
          return '<option value="' + o[0] + '"' + (st.refFilter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
        }).join('') + '</select></div>' +
        '<div class="opd-tw"><table><thead><tr><th>CUSTOMER</th><th>PLAN</th><th>STATUS</th><th>SIGNED UP</th><th class="r">MONTHLY COMMISSION</th></tr></thead>' +
        '<tbody id="opdRefBody">' + referralRows() + '</tbody></table></div>' +
        '<p class="sub opd-mt">Customer names are partly hidden to protect their privacy.</p>';
    }

    function vEarnings() {
      var s = st.data.stats;
      var rows = st.data.earnings.slice().sort(function (a, b) { return String(b.month).localeCompare(String(a.month)); });
      return head('Earnings', 'Commission is pending for ' + P.holdDays + ' days, then becomes available for payout.') +
        '<div class="opd-grid opd-g4">' +
          stat('PENDING', U.inr(s.pending_earnings), 'In the ' + P.holdDays + '-day hold period') +
          stat('AVAILABLE', U.inr(s.available_balance), 'Ready for the next payout', true) +
          stat('PAID OUT', U.inr(s.paid_out), 'Already sent to you') +
          stat('LIFETIME', U.inr(s.lifetime_earnings), 'Everything you have earned') +
        '</div>' +
        '<div class="opd-tw opd-mt"><table><thead><tr><th>MONTH</th><th>STATUS</th><th class="r">COMMISSION</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function (r) {
          return '<tr><td>' + monthLabel(r.month, true) + '</td><td>' + chip(EARN_STATUS, r.status) + '</td><td class="r">' + U.inr(r.amount) + '</td></tr>';
        }).join('') : '<tr><td colspan="3"><div class="opd-empty">No earnings yet. Commission shows up here after a referred customer pays.</div></td></tr>') +
        '</tbody></table></div>';
    }

    function payoutSummary() {
      var p = st.data.partner.payout;
      if (!p || !p.method) return '<p class="sub" style="margin:8px 0 14px">No payout method saved yet.</p>';
      return '<p class="sub" style="margin:8px 0 14px">Saved: <strong style="color:var(--tx)">' + esc(p.display || (String(p.method).toUpperCase() + ' account')) + '</strong></p>';
    }

    function payoutFields(method) {
      if (method === 'bank') {
        return '<div class="opd-f"><label for="pfHolder">Account holder name</label><input id="pfHolder" type="text" maxlength="100" autocomplete="off"></div>' +
          '<div class="opd-f"><label for="pfAcc">Account number</label><input id="pfAcc" type="text" inputmode="numeric" maxlength="18" autocomplete="off"></div>' +
          '<div class="opd-f"><label for="pfIfsc">IFSC code</label><input id="pfIfsc" type="text" maxlength="11" autocomplete="off" style="text-transform:uppercase"></div>';
      }
      return '<div class="opd-f"><label for="pfUpi">UPI ID</label><input id="pfUpi" type="text" maxlength="60" placeholder="name@bank" autocomplete="off"><small>Payouts go to this UPI ID. Please double-check it.</small></div>';
    }

    function vPayouts() {
      var s = st.data.stats;
      var hist = st.data.payouts.slice().sort(function (a, b) {
        return String(b.requested_at || b.paid_at || '').localeCompare(String(a.requested_at || a.paid_at || ''));
      });
      return head('Payouts', 'Available earnings are paid automatically every month.') +
        '<div class="opd-grid opd-g4">' +
          stat('AVAILABLE BALANCE', U.inr(s.available_balance), 'Eligible for the next payout', true) +
          stat('NEXT PAYOUT', U.date(nextPayoutDate()), 'Paid on the ' + P.payoutDay + 'th of each month') +
          stat('MINIMUM PAYOUT', U.inr(P.minPayout), 'Smaller balances roll over') +
          stat('TOTAL PAID OUT', U.inr(s.paid_out), 'All time') +
        '</div>' +
        '<div class="opd-grid opd-g2 opd-mt">' +
          '<div class="card"><h4>Payout details</h4>' + payoutSummary() +
            '<form id="opdPayoutForm" novalidate><div class="opd-f"><label for="pfMethod">Payout method</label><select id="pfMethod"><option value="upi">UPI</option><option value="bank">Bank transfer</option></select></div>' +
            '<div id="pfFields">' + payoutFields('upi') + '</div><button type="submit" class="btn primary" id="pfSave">Save payout details</button>' +
            '<p class="opd-msg" id="pfMsg" role="alert"></p></form></div>' +
          '<div class="card"><h4>How payouts work</h4><ul class="opd-check">' +
            '<li><span class="dot" style="border:0">1</span><span>New commission stays pending for ' + P.holdDays + ' days to cover refunds.</span></li>' +
            '<li><span class="dot" style="border:0">2</span><span>After that it becomes available.</span></li>' +
            '<li><span class="dot" style="border:0">3</span><span>On the ' + P.payoutDay + 'th, if your available balance is at least ' + U.inr(P.minPayout) + ', it is paid to your saved payout method.</span></li>' +
            '<li><span class="dot" style="border:0">4</span><span>Below the minimum? It rolls over to the next month.</span></li></ul>' +
            '<p class="sub" style="margin-top:12px">Full details are in the ' + docLink('Partner Guide', '#payouts', 'glime_pd_docs') + '.</p></div>' +
        '</div>' +
        '<h4 style="font-size:1rem;margin:26px 0 12px">Payout history</h4>' +
        '<div class="opd-tw"><table><thead><tr><th>DATE</th><th>METHOD</th><th>STATUS</th><th class="r">AMOUNT</th></tr></thead><tbody>' +
        (hist.length ? hist.map(function (h) {
          return '<tr><td>' + U.date(h.paid_at || h.requested_at) + '</td><td>' + esc(h.method || '\u2014') + '</td><td>' + chip(PAY_STATUS, h.status) + '</td><td class="r">' + U.inr(h.amount) + '</td></tr>';
        }).join('') : '<tr><td colspan="4"><div class="opd-empty">No payouts yet.</div></td></tr>') +
        '</tbody></table></div>';
    }

    function vResources() {
      var cards = [
        ['Getting started', 'Set up your link and share it the right way.', '#getting-started'],
        ['Commission & tiers', 'How earnings and tiers are calculated.', '#commission'],
        ['Payouts', 'Hold period, minimum payout and schedule.', '#payouts'],
        ['Brand guidelines', 'How to use the GLIME name and logo.', '#brand'],
        ['Partner policies', 'What is and is not allowed.', '#policies'],
        ['FAQ', 'Quick answers to common questions.', '#faq']
      ];
      return head('Resources', 'Guides and policies to help you succeed as a partner.') +
        '<div class="opd-grid opd-g2">' + cards.map(function (c) {
          return '<a class="card opd-rc" href="partner-docs.html' + c[2] + '" target="_blank" rel="noopener" data-flag="glime_pd_docs"><h4>' + esc(c[0]) + '</h4><p class="sub">' + esc(c[1]) + '</p></a>';
        }).join('') + '</div>' +
        '<div class="card opd-mt"><h4>Need help?</h4><p class="sub" style="margin-bottom:12px">Our team is happy to help with partner questions.</p>' +
        '<a class="btn" style="display:inline-block;text-decoration:none" href="contact.html" target="_blank" rel="noopener">Contact GLIME</a></div>' +
        '<div class="card opd-mt"><h4>Want to share the program with someone?</h4><p class="sub" style="margin-bottom:12px">Friends, students or creators who do not have a GLIME business account can join separately with Google.</p>' +
        '<a class="btn" style="display:inline-block;text-decoration:none" href="partner.html" target="_blank" rel="noopener">Partner Program page</a></div>';
    }

    function vProfile() {
      var p = st.data.partner;
      return head('Profile', 'Your partner account details.') +
        '<div class="card"><dl>' +
          '<dt>Business</dt><dd>' + esc(client.business_name || client.name || '\u2014') + '</dd>' +
          '<dt>Email</dt><dd>' + esc(user.email || '\u2014') + '</dd>' +
          '<dt>Sign-in</dt><dd>Your GLIME account</dd>' +
          '<dt>Partner code</dt><dd>' + esc(safeCode() || 'Being prepared') + '</dd>' +
          '<dt>Status</dt><dd>' + esc(String(p.status || 'active').replace(/^./, function (c) { return c.toUpperCase(); })) + '</dd>' +
          '<dt>Partner since</dt><dd>' + U.date(p.joined_at) + '</dd>' +
        '</dl></div>' +
        '<div class="card opd-mt"><h4>Account</h4><p class="sub">You are using the Partner Program with your GLIME login, so there is nothing separate to sign in to. Use Secure Logout in the menu to sign out.</p></div>';
    }

    var RENDER = { overview: vOverview, link: vLink, referrals: vReferrals, earnings: vEarnings, payouts: vPayouts, resources: vResources, profile: vProfile };

    function render() {
      viewBox.innerHTML = RENDER[st.view]();
      root.querySelectorAll('#opdTabs button').forEach(function (b) {
        var on = b.getAttribute('data-tab') === st.view;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', String(on));
      });
      if (st.view === 'payouts') bindPayoutForm();
    }

    function go(view) {
      if (!RENDER[view]) return;
      st.view = view;
      render();
      var tabs = root.querySelector('#opdTabs');
      if (tabs) tabs.scrollIntoView({ block: 'nearest' });
    }

    /* ---------------- payout form ---------------- */
    function bindPayoutForm() {
      var form = root.querySelector('#opdPayoutForm');
      if (!form) return;
      var method = root.querySelector('#pfMethod');
      method.addEventListener('change', function () {
        root.querySelector('#pfFields').innerHTML = payoutFields(method.value);
        root.querySelector('#pfMsg').textContent = '';
      });
      form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var msg = root.querySelector('#pfMsg'), btn = root.querySelector('#pfSave');
        msg.className = 'opd-msg';
        var details = {};
        try {
          if (method.value === 'upi') {
            var upi = root.querySelector('#pfUpi').value.trim();
            if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9]{2,}$/.test(upi)) throw new Error('Please enter a valid UPI ID, for example name@bank.');
            details = { upi_id: upi };
          } else {
            var holder = root.querySelector('#pfHolder').value.trim();
            var acc = root.querySelector('#pfAcc').value.trim();
            var ifsc = root.querySelector('#pfIfsc').value.trim().toUpperCase();
            if (holder.length < 2) throw new Error('Please enter the account holder name.');
            if (!/^\d{9,18}$/.test(acc)) throw new Error('Account number should be 9 to 18 digits.');
            if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new Error('Please enter a valid 11-character IFSC code.');
            details = { account_holder: holder, account_number: acc, ifsc: ifsc };
          }
          btn.disabled = true; btn.textContent = 'Saving...';
          var r = await sb.rpc('partner_save_payout_details', { p_method: method.value, p_details: details });
          if (r.error) throw r.error;
          ctx.ui.toast('Payout details saved');
          await loadData();
          if (st.view === 'payouts') {
            render();
            var m2 = root.querySelector('#pfMsg');
            if (m2) { m2.className = 'opd-msg ok'; m2.textContent = 'Payout details saved.'; }
          }
        } catch (err) {
          msg.className = 'opd-msg err';
          msg.textContent = isMissingFn(err)
            ? 'Saving payout details will be available as soon as partner payouts are switched on for your account.'
            : (err && err.message) || 'Could not save payout details. Please try again.';
          btn.disabled = false; btn.textContent = 'Save payout details';
        }
      });
    }

    /* ---------------- events ---------------- */
    function shareText() {
      return 'GLIME helps businesses manage WhatsApp and Instagram conversations, leads, orders and follow-ups in one place. Start a 7-day free trial: ' + referralUrl(st.tag);
    }

    root.addEventListener('click', async function (e) {
      var flagged = e.target.closest('[data-flag]');
      if (flagged) flag(flagged.getAttribute('data-flag'), true);

      var tab = e.target.closest('[data-tab]');
      if (tab) { go(tab.getAttribute('data-tab')); return; }

      var el = e.target.closest('[data-act]');
      if (!el) return;
      var act = el.getAttribute('data-act');
      var link = referralUrl(st.tag);

      if (act === 'copy-link') {
        if (await copyText(link)) { flag('glime_pd_copied', true); ctx.ui.toast('Referral link copied'); }
        else ctx.ui.toast('Could not copy. Please copy it manually.', true);
      } else if (act === 'copy-tpl') {
        var t = shareTemplates(link)[Number(el.getAttribute('data-i'))];
        if (t && await copyText(t.text)) { flag('glime_pd_copied', true); ctx.ui.toast('Message copied'); }
        else ctx.ui.toast('Could not copy. Please copy it manually.', true);
      } else if (act === 'share-wa') {
        window.open('https://wa.me/?text=' + encodeURIComponent(shareText()), '_blank', 'noopener');
      } else if (act === 'share-mail') {
        window.location.href = 'mailto:?subject=' + encodeURIComponent('Try GLIME for WhatsApp and Instagram') + '&body=' + encodeURIComponent(shareText());
      } else if (act === 'share-in') {
        window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(link), '_blank', 'noopener');
      } else if (act === 'share-native') {
        try { await navigator.share({ title: 'GLIME', text: shareText(), url: link }); } catch (err) { /* cancelled */ }
      }
    });

    root.addEventListener('input', function (e) {
      if (e.target.id === 'opdTag') {
        var v = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
        st.tag = v;
        if (e.target.value !== v) e.target.value = v;
        var box = root.querySelector('#opdRefLink');
        if (box) box.value = referralUrl(v);
      } else if (e.target.id === 'opdSearch') {
        st.refQuery = e.target.value;
        root.querySelector('#opdRefBody').innerHTML = referralRows();
      }
    });

    root.addEventListener('change', function (e) {
      if (e.target.id === 'opdFilter') {
        st.refFilter = e.target.value;
        root.querySelector('#opdRefBody').innerHTML = referralRows();
      }
    });

    /* ---------------- boot ---------------- */
    viewBox.innerHTML = '<div class="loading">Loading your partner dashboard\u2026</div>';
    await loadData();
    render();
  }

  window.GLIME_OTHERS.register({
    id: 'partner',
    label: 'Partner Program',
    order: 10,
    render: renderPartner
  });
})();
