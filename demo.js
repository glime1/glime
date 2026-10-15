/* =========================================================
   GLIME LIVE DEMO  (demo.html)
   Pure front-end simulation. No network calls, no backend.
========================================================= */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  var CANCEL = { cancelled: true };
  var epoch = 0;
  var fast = false;
  var busy = false;
  var stepIdx = 0;
  var autoOn = false;
  var autoTimer = null;

  var PRICE = 1299;
  var SHOP = 'Aarav Fashion Store';
  var PRODUCT = 'Blue Cotton Kurta';
  var DEFAULTS = { shop: SHOP, product: PRODUCT, price: PRICE };
  function q1() { return 'Hi! Is the ' + PRODUCT.toLowerCase() + ' available? What is the price?'; }
  function handle() { return (SHOP.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'yourstore').slice(0, 22); }
  var ESSENTIAL = ['wa', 'ig', 'razorpay', 'shiprocket'];
  var CONNECTORS = [
    { id: 'wa', name: 'WhatsApp Business', desc: 'Receive and answer customer chats', color: '#25d366', ab: 'WA', tag: 'REQUIRED' },
    { id: 'ig', name: 'Instagram', desc: 'Reply to DMs and comments, find leads', color: '#d62976', ab: 'IG', tag: 'REQUIRED' },
    { id: 'razorpay', name: 'Razorpay', desc: 'Send payment links, confirm payments', color: '#3395ff', ab: 'RP', tag: 'PAYMENTS' },
    { id: 'shiprocket', name: 'Shiprocket', desc: 'Book couriers and track parcels', color: '#7a5af8', ab: 'SR', tag: 'SHIPPING' },
    { id: 'shopify', name: 'Shopify', desc: 'Sync products and stock', color: '#5e8e3e', ab: 'SH', tag: 'OPTIONAL' },
    { id: 'gcal', name: 'Google Calendar', desc: 'Book appointments and calls', color: '#4285f4', ab: 'GC', tag: 'OPTIONAL' }
  ];
  var STAGES = ['Order confirmed', 'Courier booked', 'Picked up', 'In transit', 'Out for delivery', 'Delivered'];

  var st;
  function freshState(chan) {
    return {
      chan: chan || 'wa',
      clock: '11:42 PM',
      conn: { wa: false, ig: false, razorpay: false, shiprocket: false, shopify: false, gcal: false },
      log: [],
      lead: null,
      missed: 0,
      aiReplies: 0,
      order: null,
      paid: false,
      ship: -1,
      settling: false,
      settled: false,
      feed: [],
      view: 'inbox',
      hotKey: null,
      doneKeys: {}
    };
  }
  st = freshState('wa');

  function glimeOn() { return ESSENTIAL.every(function (k) { return st.conn[k] === true; }); }
  function fmt(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

  /* ---------------- timing helpers ---------------- */
  function wait(ms, e) {
    return new Promise(function (resolve, reject) {
      if (e !== epoch) { reject(CANCEL); return; }
      if (fast) { resolve(); return; }
      setTimeout(function () { if (e !== epoch) reject(CANCEL); else resolve(); }, ms);
    });
  }

  /* ---------------- DOM refs ---------------- */
  var phone = $('#phone');
  var chatBody = $('#chat-body');
  var chips = $('#chat-chips');
  var composer = $('#composer-input');
  var sendBtn = $('#hs-send');
  var dashMain = $('#dash-main');
  var dashNav = $('#dash-nav');
  var dashToast = $('#dash-toast');
  var stage = $('#stage');
  var finale = $('#finale');
  var capbar = $('.capbar');

  /* ---------------- phone ---------------- */
  function applyChan() {
    phone.setAttribute('data-chan', st.chan);
    $('#chan-wa').classList.toggle('on', st.chan === 'wa');
    $('#chan-ig').classList.toggle('on', st.chan === 'ig');
    $('#chan-wa').setAttribute('aria-pressed', String(st.chan === 'wa'));
    $('#chan-ig').setAttribute('aria-pressed', String(st.chan === 'ig'));
    $('#chan-badge').textContent = st.chan === 'wa' ? 'WhatsApp' : 'Instagram';
    $('#chat-name').textContent = st.chan === 'wa' ? SHOP : handle();
    setStatus('business account');
  }
  function setStatus(t) { $('#chat-status').textContent = st.clock + ' · ' + t; }

  function scrollChat() { chatBody.scrollTop = chatBody.scrollHeight; }

  function chatClear(introText) {
    chatBody.innerHTML = '';
    chips.innerHTML = '';
    composer.value = '';
    sendBtn.disabled = false;
    if (introText) appendHTML('<div class="sys">' + esc(introText) + '</div>');
  }
  function appendHTML(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    var node = d.firstElementChild;
    chatBody.appendChild(node);
    scrollChat();
    return node;
  }

  function trackHTML() {
    var rows = STAGES.map(function (s, i) { return '<div class="' + (i <= st.ship ? 'on' : '') + '">' + s + '</div>'; }).join('');
    var btn = st.ship >= 0 && st.ship < 5
      ? '<button type="button" class="advbtn" data-task="advance">⏩ Simulate next courier scan</button>' : '';
    return '<b>Track your order #1042</b><small>AWB SR204815 · via Shiprocket</small><div class="track-steps">' + rows + '</div>' + btn;
  }
  function payHTML() {
    return '<div class="pimg">🧾</div><div class="pbody"><b>Order #1042 · ' + esc(PRODUCT) + '</b>' +
      '<small>Deliver to Pune 411001</small>' +
      '<div class="line"><span>Item</span><span>' + fmt(PRICE) + '</span></div>' +
      '<div class="line"><span>Delivery</span><span>Free</span></div>' +
      '<div class="price">Total ' + fmt(PRICE) + '</div>' +
      '<button type="button" class="paybtn" data-task="pay"' + (st.paid ? ' disabled' : '') + '>' +
      (st.paid ? '✓ Paid' : 'Pay ' + fmt(PRICE) + ' · UPI / Card') + '</button></div>';
  }

  function renderPhoneMsg(m) {
    var t = '<time>' + esc(m.t || st.clock) + '</time>';
    if (m.kind === 'text') {
      return appendHTML('<div class="msg ' + (m.from === 'cust' ? 'out' : 'in') + '">' + esc(m.text) + t + '</div>');
    }
    if (m.kind === 'product') {
      return appendHTML('<div class="pcard"><div class="pimg">👕</div><div class="pbody"><b>' + esc(PRODUCT) + '</b><small>In stock</small><div class="price">' + fmt(PRICE) + '</div></div></div>');
    }
    if (m.kind === 'pay') { return appendHTML('<div class="pcard" id="paycard">' + payHTML() + '</div>'); }
    if (m.kind === 'track') { return appendHTML('<div class="pcard" id="trackcard">' + trackHTML() + '</div>'); }
    if (m.kind === 'sys') { return appendHTML('<div class="sys ' + (m.cls || '') + '">' + esc(m.text) + '</div>'); }
    if (m.kind === 'lost') {
      return appendHTML('<div class="lost"><b>Sale lost · ' + fmt(PRICE) + '</b>The customer went to another store.</div>');
    }
    return null;
  }
  function updateTrack() { var n = $('#trackcard'); if (n) n.innerHTML = trackHTML(); }
  function updatePay() { var n = $('#paycard'); if (n) n.innerHTML = payHTML(); }

  function addMsg(m) { st.log.push(m); renderPhoneMsg(m); }

  var typingNode = null;
  function showTyping() {
    hideTyping();
    typingNode = appendHTML('<div class="typing"><i></i><i></i><i></i></div>');
    setStatus('typing…');
  }
  function hideTyping() {
    if (typingNode && typingNode.parentNode) typingNode.parentNode.removeChild(typingNode);
    typingNode = null;
    setStatus('business account');
  }
  function setComposer(text) { composer.value = text || ''; }
  function setChips(list) {
    chips.innerHTML = (list || []).map(function (c) {
      return '<button type="button" data-task="' + c.task + '">' + esc(c.label) + '</button>';
    }).join('');
  }

  /* ---------------- dashboard ---------------- */
  var NAV = [
    { id: 'overview', label: 'Overview', ic: '▦' },
    { id: 'inbox', label: 'Inbox', ic: '✉' },
    { id: 'orders', label: 'Orders', ic: '🛍' },
    { id: 'payments', label: 'Payments', ic: '₹' },
    { id: 'connect', label: 'Connect', ic: '⚡' }
  ];

  function feedPush(text, cls) { st.feed.unshift({ text: text, cls: cls || '', t: st.clock }); }

  function renderNav() {
    var unread = !glimeOn() && st.log.some(function (m) { return m.from === 'cust'; }) ? 1 : 0;
    dashNav.innerHTML = '<div class="nav-brand"><img src="glime_logo_clean.svg" alt=""><span>GLIME</span></div>' +
      NAV.map(function (n) {
        return '<button type="button" data-view="' + n.id + '" class="' + (st.view === n.id ? 'on' : '') + '">' +
          '<span class="ic">' + n.ic + '</span>' + n.label +
          (n.id === 'inbox' && unread ? '<span class="nb">' + unread + '</span>' : '') + '</button>';
      }).join('');
  }

  function emptyState(title, text) {
    return '<div class="empty"><b>' + esc(title) + '</b>' + esc(text) + '</div>';
  }

  function viewOverview() {
    var on = glimeOn();
    var kpis = '<div class="kpis">' +
      '<div class="kpi ' + (st.paid ? 'good flash' : '') + '"><small>Revenue today</small><b>' + fmt(st.paid ? PRICE : 0) + '</b></div>' +
      '<div class="kpi"><small>Orders</small><b>' + (st.order ? 1 : 0) + '</b></div>' +
      '<div class="kpi"><small>Instant replies</small><b>' + st.aiReplies + '</b></div>' +
      '<div class="kpi ' + (st.missed ? 'bad' : '') + '"><small>Missed enquiries</small><b>' + st.missed + '</b></div>' +
      '</div>';
    var bank = '<div class="bank ' + (st.settled ? 'credited' : '') + '"><div class="bi">🏦</div><div><b>Your bank account ••4821</b><small>' +
      (st.settled ? 'Payout credited' : 'Waiting for the first delivered order') + '</small></div><div class="bal"><b>' + fmt(st.settled ? PRICE : 0) + '</b><small>received today</small></div></div>';
    var feed = st.feed.length
      ? '<ul class="feed">' + st.feed.slice(0, 7).map(function (f) {
        return '<li class="' + f.cls + '"><i></i><span>' + esc(f.text) + '</span><time>' + esc(f.t) + '</time></li>';
      }).join('') + '</ul>'
      : '<p style="color:var(--dim)">Nothing yet. Activity shows up here live.</p>';
    var week = [2400, 3100, 1800, 2900, 3600, 2200, st.paid ? PRICE : 0];
    var mx = Math.max.apply(null, week.concat([PRICE]));
    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Today'];
    var spark = on ? '<div class="card"><h4>Sales this week</h4><div class="spark">' + week.map(function (v, i) {
      return '<div class="sb' + (i === 6 ? ' today' : '') + '"><i style="height:' + Math.max(4, Math.round(v / mx * 100)) + '%"></i><span>' + days[i] + '</span></div>';
    }).join('') + '</div></div>' : '';
    var loss = !on && st.missed
      ? '<div class="card lossbox"><h4>What this is costing you</h4><b>' + fmt(PRICE * 30) + '</b><span> a month if just one enquiry a day goes unanswered. Illustration only.</span></div>'
      : '';
    return '<div class="pg-head"><h3 class="pg-title">Overview</h3><span class="pill ' + (on ? 'g' : 'r') + '">' + (on ? '● GLIME is live' : '● Not connected') + '</span></div>' +
      kpis + loss + (on ? bank : '') + spark + '<div class="card"><h4>Live activity</h4>' + feed + '</div>';
  }

  function threadBubbles() {
    return st.log.map(function (m) {
      if (m.kind === 'text') {
        return m.from === 'cust'
          ? '<div class="tb c">' + esc(m.text) + '</div>'
          : '<div class="tb b"><span class="ai">GLIME AI · REPLIED INSTANTLY</span>' + esc(m.text) + '</div>';
      }
      if (m.kind === 'product') return '<div class="tb b card2"><span class="ai">PRODUCT CARD SENT</span>' + esc(PRODUCT) + ' · ' + fmt(PRICE) + '</div>';
      if (m.kind === 'pay') return '<div class="tb b card2"><span class="ai">PAYMENT LINK SENT · RAZORPAY</span>Order #1042 · ' + fmt(PRICE) + (st.paid ? ' · PAID ✓' : ' · awaiting payment') + '</div>';
      if (m.kind === 'track') return '<div class="tb b card2"><span class="ai">TRACKING SENT</span>AWB SR204815 · live status updates on</div>';
      if (m.kind === 'sys') return '<div class="tsys ' + (m.cls || '') + '">' + esc(m.text) + '</div>';
      if (m.kind === 'lost') return '<div class="tsys lost">Sale lost · ' + fmt(PRICE) + '</div>';
      return '';
    }).join('');
  }

  function viewInbox() {
    var on = glimeOn();
    var convs = '<div class="convs">' +
      '<div class="conv on"><b>Christine' + (!on && st.log.length ? '<span class="pill r">1</span>' : '') + '</b><small>' +
      esc(st.log.length ? (st.log[st.log.length - 1].text || 'Conversation') : 'No messages yet') + '</small></div>' +
      (on ? '<div class="conv dim"><b>Rohan</b><small>Thanks! Parcel received 👍</small></div><div class="conv dim"><b>Meera</b><small>Is the silk dupatta back in stock?</small></div>' : '') +
      '</div>';
    var banner = !on
      ? '<div class="alertbar"><b>GLIME is not connected.</b> No automatic replies. The owner is offline since 10:05 PM, so every message waits.</div>'
      : '';
    var head = '<div class="thread-head"><b>Christine</b><span class="pill c">' + (st.chan === 'wa' ? 'WhatsApp' : 'Instagram') + '</span>' +
      (st.lead ? '<span class="pill a">🔥 Hot lead · ' + esc(st.lead) + '</span>' : '') +
      (st.aiReplies ? '<span class="pill g">⚡ Replied in 3 sec</span>' : '') + '</div>';
    var body = threadBubbles() || '<p style="color:var(--dim);margin:auto">No messages yet. Tap send on the phone.</p>';
    var foot = on
      ? '<div class="thread-foot"><span>🤖 GLIME AI is handling this chat</span><button type="button" class="dbtn ghost" disabled>Take over</button></div>'
      : '<div class="thread-foot bad"><span>⚠ Nobody is replying right now</span></div>';
    return '<div class="pg-head"><h3 class="pg-title">Inbox</h3><span class="pill ' + (on ? 'g' : 'r') + '">' + (on ? '● Live' : '● Offline') + '</span></div>' +
      banner + '<div class="inbox">' + convs + '<div class="thread">' + head + '<div class="thread-body" id="thread-body">' + body + '</div>' + foot + '</div></div>';
  }

  function viewOrders() {
    if (!glimeOn()) return '<div class="pg-head"><h3 class="pg-title">Orders</h3></div>' + emptyState('No orders yet', 'Connect your channels to start receiving orders from chats.');
    var rows = '';
    if (st.order) {
      rows += '<tr class="new"><td>#1042</td><td>Christine</td><td class="hide-s">' + esc(PRODUCT) + '</td><td class="strong">' + fmt(PRICE) + '</td>' +
        '<td>' + (st.paid ? '<span class="pill g">Paid</span>' : '<span class="pill a">Awaiting payment</span>') + '</td>' +
        '<td>' + (st.ship >= 0 ? '<span class="pill c">' + STAGES[st.ship] + '</span>' : '<span class="pill">Not shipped</span>') + '</td></tr>';
    }
    rows += '<tr><td>#1041</td><td>Rohan</td><td class="hide-s">Linen Shirt (L)</td><td class="strong">' + fmt(1499) + '</td><td><span class="pill g">Paid</span></td><td><span class="pill">Delivered</span></td></tr>' +
      '<tr><td>#1040</td><td>Meera</td><td class="hide-s">Silk Dupatta</td><td class="strong">' + fmt(899) + '</td><td><span class="pill g">Paid</span></td><td><span class="pill">Delivered</span></td></tr>';
    var table = '<div class="card scroll-x"><table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th class="hide-s">Item</th><th>Amount</th><th>Payment</th><th>Shipment</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    var ship = '';
    if (st.order && st.paid) {
      var tl = STAGES.map(function (s, i) { return '<div class="' + (i <= st.ship ? 'on' : '') + '">' + s + '</div>'; }).join('');
      var action = '';
      if (st.ship < 0) action = '<button type="button" class="dbtn" data-task="ship-book">Book courier automatically</button>';
      else if (st.ship < 5) action = '<button type="button" class="dbtn ghost" data-task="advance">⏩ Simulate next courier scan</button>';
      else action = '<span class="pill g">✓ Delivered to customer</span>';
      ship = '<div class="card"><h4>Shipment · Order #1042</h4>' +
        (st.ship < 0 ? '<p style="color:var(--muted)">Payment received. Ready to ship to Pune 411001.</p>' : '<div class="tl-ship">' + tl + '</div>') +
        '<div class="ship-meta">' + (st.ship >= 0 ? '<span>Courier assigned by Shiprocket</span><code>AWB SR204815</code>' : '') + action + '</div></div>';
    }
    return '<div class="pg-head"><h3 class="pg-title">Orders</h3><span class="pill g">Auto-created from chats</span></div>' + table + ship;
  }

  function viewPayments() {
    if (!glimeOn()) return '<div class="pg-head"><h3 class="pg-title">Payments</h3></div>' + emptyState('No payments yet', 'Connect Razorpay to collect payments inside chats.');
    var collected = st.paid ? PRICE : 0;
    var hold = st.paid && !st.settled ? PRICE : 0;
    var inBank = st.settled ? PRICE : 0;
    var kpis = '<div class="kpis">' +
      '<div class="kpi"><small>Collected from customers</small><b>' + fmt(collected) + '</b></div>' +
      '<div class="kpi ' + (hold ? '' : '') + '"><small>On the way to you</small><b>' + fmt(hold) + '</b></div>' +
      '<div class="kpi ' + (inBank ? 'good flash' : '') + '"><small>In your bank</small><b id="bank-num">' + fmt(inBank) + '</b></div></div>';
    var bank = '<div class="bank ' + (st.settled ? 'credited' : '') + '"><div class="bi">🏦</div><div><b>Your bank account ••4821</b><small>' +
      (st.settled ? 'Credited just now · Order #1042' : (st.ship === 5 ? 'Delivered. Ready to pay out' : 'Payout releases after delivery')) + '</small></div>' +
      '<div class="bal"><b>' + (st.settled ? '+ ' + fmt(PRICE) : '—') + '</b><small>' + (st.settled ? 'credited' : 'pending') + '</small></div></div>';
    var act = '';
    if (st.paid && st.ship === 5 && !st.settled) {
      act = '<button type="button" class="dbtn" data-task="settle"' + (st.settling ? ' disabled' : '') + '>' + (st.settling ? '<span class="spin"></span>Sending to your bank…' : 'Pay out to my bank account') + '</button>';
    } else if (st.paid && !st.settled) {
      act = '<span class="pill a">Payout releases once the parcel is delivered</span>';
    }
    var items = '';
    if (st.settled) items += '<li><span>🏦</span><span><b>Payout to bank ••4821</b> · Order #1042</span><span class="amt in">+ ' + fmt(PRICE) + '</span></li>';
    if (st.paid) items += '<li><span>💳</span><span><b>Payment received</b> · Order #1042 · Christine</span><span class="amt in">+ ' + fmt(PRICE) + '</span></li>';
    items += '<li><span>🏦</span><span><b>Payout</b> · Order #1041 · Rohan</span><span class="amt">' + fmt(1499) + '</span></li>';
    return '<div class="pg-head"><h3 class="pg-title">Payments</h3>' + act + '</div>' + kpis + bank + '<div class="card"><h4>Ledger</h4><ul class="ledger">' + items + '</ul></div>';
  }

  function viewConnect() {
    var n = ESSENTIAL.filter(function (k) { return st.conn[k] === true; }).length;
    var total = CONNECTORS.filter(function (c) { return st.conn[c.id] === true; }).length;
    var cards = CONNECTORS.map(function (c) {
      var s = st.conn[c.id];
      var action = s === true ? '<span class="done">✓ Connected</span>'
        : s === 'busy' ? '<button type="button" class="dbtn" disabled><span class="spin"></span>Connecting…</button>'
        : '<button type="button" class="dbtn" data-task="c-' + c.id + '">Connect ' + esc(c.name.split(' ')[0]) + '</button>';
      return '<div class="conn ' + (s === true ? 'ok' : '') + '"><div class="conn-top"><span class="cbadge" style="background:' + c.color + '">' + c.ab + '</span>' +
        '<div><b>' + esc(c.name) + '</b><small>' + esc(c.desc) + '</small></div></div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' + action + '<span class="tag">' + c.tag + '</span></div></div>';
    }).join('');
    return '<div class="pg-head"><h3 class="pg-title">Connect your business</h3><span class="pill ' + (n === 4 ? 'g' : 'a') + '">' + total + ' of ' + CONNECTORS.length + ' connected</span></div>' +
      '<div class="card"><h4>Setup progress</h4><div class="meter"><i style="width:' + (n / 4 * 100) + '%"></i></div>' +
      '<p style="margin-top:8px;color:var(--muted);font-size:12px">Connect WhatsApp, Instagram, Razorpay and Shiprocket to run the whole flow: chat, order, payment, shipment.</p></div>' +
      '<div class="conn-grid">' + cards + '</div>';
  }

  var VIEWS = { overview: viewOverview, inbox: viewInbox, orders: viewOrders, payments: viewPayments, connect: viewConnect };

  function render() {
    renderNav();
    dashMain.innerHTML = (VIEWS[st.view] || viewOverview)();
    var tb = $('#thread-body');
    if (tb) tb.scrollTop = tb.scrollHeight;
    markHot();
    updateTabsAlert();
  }

  function markHot() {
    $$('.hot').forEach(function (n) { n.classList.remove('hot'); });
    if (!st.hotKey) return;
    $$('[data-task="' + st.hotKey + '"]').forEach(function (n) { n.classList.add('hot'); });
  }

  var toastTimer = null;
  function notify(text) {
    if (fast) return;
    dashToast.textContent = text;
    dashToast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dashToast.classList.remove('on'); }, 2600);
  }

  function updateTabsAlert() {
    var dashTab = $('[data-dev="dash"].tab');
    var phoneTab = $('[data-dev="phone"].tab');
    if (!dashTab) return;
    dashTab.classList.toggle('alert', false);
    phoneTab.classList.toggle('alert', false);
  }

  function showDev(dev) {
    stage.setAttribute('data-dev', dev);
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-dev') === dev;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
    });
  }
  function isNarrow() { return window.matchMedia('(max-width: 999px)').matches; }

  function burst() {
    if (fast) return;
    var d = $('#dash');
    var colors = ['#22d3ee', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];
    for (var i = 0; i < 44; i++) {
      var c = document.createElement('i');
      c.className = 'cf';
      c.style.left = (20 + Math.random() * 60) + '%';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--dx', (Math.random() * 280 - 140).toFixed(0) + 'px');
      c.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      c.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      d.appendChild(c);
      (function (n) { setTimeout(function () { if (n.parentNode) n.parentNode.removeChild(n); }, 2200); })(c);
    }
  }
  function scrollToStage() {
    var target = isNarrow() ? $('.tabs') : stage;
    var y = target.getBoundingClientRect().top + window.scrollY - (isNarrow() ? 70 : 84);
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  }

  /* ---------------- steps ---------------- */
  var STEPS = [
    {
      label: 'Problem', cls: 'problem',
      kicker: 'The problem', title: '11:42 PM. A customer messages. Nobody replies.',
      text: 'You are the customer. Tap send on the phone and see what happens when the owner is asleep, busy or off the phone.',
      done: 'Three hours of silence and the sale is gone to another store. This happens to every business that replies by hand.',
      bad: true,
      setup: function () {
        st.view = 'inbox';
        st.clock = '11:42 PM';
        chatClear('Customer view · Sample business');
        setComposer(q1());
        applyChan();
      },
      tasks: [{
        key: 'send', where: 'phone',
        run: async function (w) {
          var txt = q1();
          setComposer('');
          addMsg({ kind: 'text', from: 'cust', text: txt, t: st.clock });
          feedPush('New enquiry from Christine', '');
          render();
          await w(1100);
          var times = ['12:30 AM', '1:15 AM', '2:40 AM'];
          for (var i = 0; i < times.length; i++) {
            st.clock = times[i];
            setStatus('last seen recently');
            addMsg({ kind: 'sys', text: times[i] + ' · still no reply', t: st.clock });
            render();
            await w(1000);
          }
          addMsg({ kind: 'text', from: 'cust', text: 'Okay, never mind. I will order from another store.', t: st.clock });
          await w(700);
          addMsg({ kind: 'lost', t: st.clock });
          st.missed = 1;
          feedPush('Missed enquiry: Christine, no reply for 3 hours', 'bad');
          render();
          notify('Missed enquiry · ' + fmt(PRICE) + ' lost');
        }
      }]
    },
    {
      label: 'Connect', cls: '',
      kicker: 'Connect', title: 'Now connect your channels, one tap each',
      text: 'This is your GLIME dashboard. Tap Connect on WhatsApp, Instagram, Razorpay and Shiprocket. That is the whole setup.',
      done: 'Chats, payments and shipping are now wired into one place. GLIME is live.',
      mode: 'any',
      setup: function () { st.view = 'connect'; },
      tasks: ESSENTIAL.map(function (id) {
        return {
          key: 'c-' + id, where: 'dash',
          run: async function (w) {
            st.conn[id] = 'busy';
            render();
            await w(850);
            st.conn[id] = true;
            var c = CONNECTORS.filter(function (x) { return x.id === id; })[0];
            feedPush(c.name + ' connected', 'good');
            render();
            notify(c.name + ' connected ✓');
          }
        };
      })
    },
    {
      label: 'Reply', cls: '',
      kicker: 'Instant reply', title: 'Same customer. Same message. Instant answer.',
      text: 'Tap send again. GLIME replies in seconds with the right product, size, stock and price, and saves the lead.',
      done: 'Replied in 3 seconds, lead captured, and nobody typed a word.',
      setup: function () {
        st.view = 'inbox';
        st.clock = '11:42 PM';
        st.log = [];
        chatClear('The same night, with GLIME connected');
        setComposer(q1());
        applyChan();
      },
      tasks: [{
        key: 'send', where: 'phone',
        run: async function (w) {
          setComposer('');
          addMsg({ kind: 'text', from: 'cust', text: q1(), t: st.clock });
          feedPush('New enquiry from Christine', '');
          render();
          await w(600);
          showTyping();
          await w(1400);
          hideTyping();
          st.clock = '11:42 PM';
          addMsg({ kind: 'text', from: 'biz', text: 'Hi Christine! 👋 Yes, the ' + PRODUCT + ' is in stock. It is ' + fmt(PRICE) + ' with free delivery. Shall I book it for you?', t: st.clock });
          addMsg({ kind: 'product' });
          st.aiReplies += 1;
          st.lead = PRODUCT;
          feedPush('GLIME replied to Christine in 3 sec · lead saved', 'good');
          render();
          notify('Replied in 3 sec · lead saved');
        }
      }]
    },
    {
      label: 'Order', cls: '',
      kicker: 'Order and payment', title: 'From enquiry to a paid order, inside the chat',
      text: 'The customer confirms. GLIME takes the delivery details, sends a payment link, and confirms the order the moment it is paid.',
      done: 'Order #1042 created and paid. No forms, no screenshots, no chasing for payment.',
      setup: function () {
        st.view = 'inbox';
        setChips([{ label: 'Yes, book it. Deliver to Pune 411001', task: 'confirm' }]);
      },
      tasks: [
        {
          key: 'confirm', where: 'phone',
          run: async function (w) {
            setChips([]);
            addMsg({ kind: 'text', from: 'cust', text: 'Yes, book it. Deliver to Pune 411001', t: st.clock });
            render();
            await w(600);
            showTyping();
            await w(1300);
            hideTyping();
            addMsg({ kind: 'text', from: 'biz', text: 'Booked! 🎉 Delivering to Pune 411001. Please complete the payment to confirm your order:', t: st.clock });
            addMsg({ kind: 'pay' });
            st.order = { id: 1042 };
            feedPush('Order #1042 created · payment link sent', '');
            render();
          }
        },
        {
          key: 'pay', where: 'phone',
          run: async function (w) {
            var b = $('.paybtn');
            if (b) { b.disabled = true; b.textContent = 'Processing…'; }
            await w(1300);
            st.paid = true;
            updatePay();
            addMsg({ kind: 'sys', text: 'Payment received · ' + fmt(PRICE), cls: 'pay' });
            showTyping();
            await w(900);
            hideTyping();
            addMsg({ kind: 'text', from: 'biz', text: 'Payment received ✅ Order #1042 is confirmed. I will send tracking the moment it ships.', t: st.clock });
            feedPush('Payment received ' + fmt(PRICE) + ' · Order #1042', 'good');
            st.view = 'orders';
            render();
            notify('New paid order · ' + fmt(PRICE));
          }
        }
      ]
    },
    {
      label: 'Ship', cls: '',
      kicker: 'Shipment', title: 'GLIME books the courier and keeps the customer updated',
      text: 'Tap Book courier on the dashboard. Shiprocket assigns a courier and AWB, and the customer gets live tracking in the same chat.',
      done: 'Picked up and moving. No more "where is my order?" calls.',
      setup: function () { st.view = 'orders'; },
      tasks: [{
        key: 'ship-book', where: 'dash',
        run: async function (w) {
          st.ship = 1;
          st.view = 'orders';
          render();
          await w(1000);
          st.ship = 2;
          addMsg({ kind: 'text', from: 'biz', text: 'Your order is on its way! 🚚 Track it here:', t: st.clock });
          addMsg({ kind: 'track' });
          feedPush('Courier booked via Shiprocket · AWB SR204815', '');
          feedPush('Order #1042 picked up', '');
          render();
          notify('Courier booked · tracking sent to customer');
        }
      }]
    },
    {
      label: 'Paid', cls: '',
      kicker: 'Money in your account', title: 'Delivered. Now the money reaches your account.',
      text: 'Tap to move the parcel forward until it is delivered. Then pay out to your bank and watch the balance update.',
      done: fmt(PRICE) + ' credited to your bank account. One customer, from first message to money, fully automatic.',
      setup: function () { st.view = 'orders'; },
      tasks: [
        {
          key: 'advance', where: 'dash',
          run: async function (w) {
            for (var s = 3; s <= 5; s++) {
              await w(950);
              st.ship = s;
              updateTrack();
              if (s === 4) {
                addMsg({ kind: 'text', from: 'biz', text: 'Out for delivery today 📦 Please keep your phone handy.', t: st.clock });
                feedPush('Order #1042 out for delivery', '');
              }
              if (s === 5) {
                addMsg({ kind: 'text', from: 'biz', text: 'Delivered ✅ Thank you for shopping with us! I will check in with you in 2 days for feedback.', t: st.clock });
                feedPush('Order #1042 delivered', 'good');
              }
              render();
            }
            await w(700);
            st.view = 'payments';
            render();
            notify('Parcel delivered · payout ready');
          }
        },
        {
          key: 'settle', where: 'dash',
          run: async function (w) {
            st.settling = true;
            render();
            await w(1500);
            st.settling = false;
            st.settled = true;
            feedPush(fmt(PRICE) + ' credited to your bank account ••4821', 'good');
            render();
            var el = $('#bank-num');
            if (el && !fast) {
              for (var i = 1; i <= 16; i++) { await w(35); el.textContent = fmt(Math.round(PRICE * i / 16)); }
            }
            burst();
            notify(fmt(PRICE) + ' credited to your account ✓');
          }
        }
      ]
    }
  ];

  /* ---------------- engine ---------------- */
  function pending(step) {
    return step.tasks.filter(function (t) { return !st.doneKeys[stepIdx + ':' + t.key]; });
  }
  function nextHot(step) {
    var p = pending(step);
    return p.length ? p[0].key : null;
  }
  function isDone(i) {
    var s = STEPS[i];
    return s.tasks.every(function (t) { return st.doneKeys[i + ':' + t.key]; });
  }

  async function runTask(task, quiet) {
    if (busy) return;
    busy = true;
    var e = epoch;
    var w = function (ms) { return wait(ms, e); };
    st.hotKey = null;
    markHot();
    try {
      await task.run(w);
      if (e !== epoch) throw CANCEL;
      st.doneKeys[stepIdx + ':' + task.key] = true;
      var step = STEPS[stepIdx];
      st.hotKey = nextHot(step);
      if (st.hotKey) {
        var nt = step.tasks.filter(function (t) { return t.key === st.hotKey; })[0];
        if (nt && isNarrow() && !quiet) showDev(nt.where);
      }
      render();
    } catch (err) {
      if (err !== CANCEL) { throw err; }
    } finally {
      if (e === epoch) { busy = false; }
    }
    if (e === epoch) refreshUI(false);
  }

  async function runPending() {
    var step = STEPS[stepIdx];
    var list = pending(step);
    for (var i = 0; i < list.length; i++) {
      var e = epoch;
      await runTask(list[i]);
      if (e !== epoch) return;
    }
  }

  function enterStep(i, quiet) {
    stepIdx = i;
    var s = STEPS[i];
    s.setup();
    st.hotKey = nextHot(s);
    if (!quiet && isNarrow() && st.hotKey) {
      var t = s.tasks.filter(function (x) { return x.key === st.hotKey; })[0];
      if (t) showDev(t.where);
    }
    render();
    refreshUI(true);
  }

  function refreshUI(swap) {
    var s = STEPS[stepIdx];
    var done = isDone(stepIdx);
    $('#step-kicker').textContent = 'Step ' + (stepIdx + 1) + ' of ' + STEPS.length + ' · ' + s.kicker;
    $('#step-heading').textContent = s.title;
    var txt = $('#step-text');
    txt.textContent = done ? '✓ ' + s.done : s.text;
    txt.classList.toggle('ok', done);
    capbar.classList.toggle('bad', !!s.bad);
    if (swap) {
      var ct = $('.cap-text');
      ct.classList.remove('swap'); void ct.offsetWidth; ct.classList.add('swap');
    }

    var rail = $('#steps');
    $$('li', rail).forEach(function (li, idx) {
      li.classList.toggle('now', idx === stepIdx);
      li.classList.toggle('done', idx < stepIdx || (idx === stepIdx && done));
    });

    var last = stepIdx === STEPS.length - 1;
    var next = $('#btn-next');
    next.disabled = last && done;
    if (last && done) next.textContent = 'Finished ✓';
    else if (!done) next.textContent = 'Show me →';
    else next.textContent = 'Next step →';
    next.classList.toggle('hot', false);
    $('#btn-back').disabled = stepIdx === 0 && !st.doneKeys['0:send'];
    finale.classList.toggle('lit', last && done);
    var fl = $('#finale-line');
    if (fl) fl.textContent = last && done
      ? SHOP + ' just sold ' + PRODUCT + ' for ' + fmt(PRICE) + ' from one chat, and nobody typed a word.'
      : '';
  }

  async function goTo(i) {
    stopAuto();
    epoch++;
    busy = false;
    var chan = st.chan;
    st = freshState(chan);
    chatBody.innerHTML = '';
    chips.innerHTML = '';
    fast = true;
    try {
      for (var j = 0; j < i; j++) {
        enterStep(j, true);
        var list = pending(STEPS[j]);
        for (var k = 0; k < list.length; k++) { await runTask(list[k], true); }
        $$('.msg,.pcard,.sys,.lost,.typing').forEach(function (n) { n.style.animation = 'none'; });
      }
    } finally {
      fast = false;
    }
    st.log = i === 2 ? [] : st.log;
    enterStep(i, false);
    $$('.msg,.pcard,.sys,.lost').forEach(function (n) { n.style.animation = ''; });
    applyChan();
  }

  async function onNext() {
    if (busy) return;
    var s = STEPS[stepIdx];
    if (pending(s).length) { await runPending(); return; }
    if (stepIdx < STEPS.length - 1) { enterStep(stepIdx + 1); window.scrollTo({ top: Math.max(0, capbar.getBoundingClientRect().top + window.scrollY - 100), behavior: 'smooth' }); }
  }
  function onBack() { if (busy) return; goTo(Math.max(0, stepIdx - 1)); }

  /* ---------------- auto-play ---------------- */
  function stopAuto() {
    autoOn = false;
    clearTimeout(autoTimer);
    var b = $('#btn-auto');
    b.setAttribute('aria-pressed', 'false');
    b.textContent = '▶ Auto-play';
  }
  function startAuto() {
    autoOn = true;
    var b = $('#btn-auto');
    b.setAttribute('aria-pressed', 'true');
    b.textContent = '❚❚ Pause';
    scrollToStage();
    autoTimer = setTimeout(autoStep, 700);
  }
  async function autoStep() {
    if (!autoOn) return;
    var e = epoch;
    if (busy) { autoTimer = setTimeout(autoStep, 400); return; }
    var s = STEPS[stepIdx];
    if (pending(s).length) {
      await runPending();
      if (e !== epoch || !autoOn) return;
      autoTimer = setTimeout(autoStep, 2200);
      return;
    }
    if (stepIdx < STEPS.length - 1) {
      enterStep(stepIdx + 1);
      scrollToStage();
      autoTimer = setTimeout(autoStep, 1400);
    } else {
      stopAuto();
      setTimeout(function () {
        if (e === epoch && isDone(STEPS.length - 1)) finale.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 1800);
    }
  }

  /* ---------------- wiring ---------------- */
  function buildRail() {
    $('#steps').innerHTML = STEPS.map(function (s, i) {
      return '<li class="' + s.cls + '"><button type="button" data-step="' + i + '" aria-label="Go to step ' + (i + 1) + ': ' + esc(s.kicker) + '">' +
        '<span class="bar"></span><span class="lbl">' + (i + 1) + ' · ' + esc(s.label) + '</span></button></li>';
    }).join('');
  }

  function loadCustom() {
    try {
      var o = JSON.parse(localStorage.getItem('glime-demo-custom') || 'null');
      if (o) applyCustom(o, true);
    } catch (e) { /* storage unavailable */ }
  }
  function applyCustom(o, silent) {
    var shop = String(o.shop || '').trim().slice(0, 28) || DEFAULTS.shop;
    var prod = String(o.product || '').trim().slice(0, 28) || DEFAULTS.product;
    var price = parseInt(o.price, 10);
    if (!(price >= 1 && price <= 99999)) price = DEFAULTS.price;
    SHOP = shop; PRODUCT = prod; PRICE = price;
    $('#dash-who').textContent = SHOP;
    $('#cu-shop').value = shop === DEFAULTS.shop ? '' : shop;
    $('#cu-product').value = prod === DEFAULTS.product ? '' : prod;
    $('#cu-price').value = price === DEFAULTS.price ? '' : String(price);
    if (!silent) {
      try { localStorage.setItem('glime-demo-custom', JSON.stringify({ shop: SHOP, product: PRODUCT, price: PRICE })); } catch (e) { /* ignore */ }
    }
  }

  function init() {
    buildRail();
    loadCustom();
    $('#custom-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      applyCustom({ shop: $('#cu-shop').value, product: $('#cu-product').value, price: $('#cu-price').value });
      var m = $('#custom-msg');
      m.textContent = '✓ Demo updated for ' + SHOP;
      setTimeout(function () { m.textContent = ''; }, 2400);
      goTo(stepIdx);
    });
    $('#custom-reset').addEventListener('click', function () {
      applyCustom({});
      try { localStorage.removeItem('glime-demo-custom'); } catch (e) { /* ignore */ }
      goTo(stepIdx);
    });

    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-task]');
      if (t) {
        var key = t.getAttribute('data-task');
        if (busy) return;
        var step = STEPS[stepIdx];
        var task = step.tasks.filter(function (x) { return x.key === key; })[0];
        if (!task || st.doneKeys[stepIdx + ':' + key]) return;
        if (step.mode !== 'any' && pending(step)[0].key !== key) return;
        runTask(task);
        return;
      }
      var opt = ev.target.closest('[data-task^="c-"]');
      if (opt) return;
      var v = ev.target.closest('[data-view]');
      if (v) { st.view = v.getAttribute('data-view'); render(); return; }
      var c = ev.target.closest('[data-chan]');
      if (c && c.classList.contains('chan')) { st.chan = c.getAttribute('data-chan'); applyChan(); render(); return; }
      var tab = ev.target.closest('.tab');
      if (tab) { showDev(tab.getAttribute('data-dev')); return; }
      var sb = ev.target.closest('[data-step]');
      if (sb) { if (!busy) goTo(parseInt(sb.getAttribute('data-step'), 10)); return; }
    });

    /* Optional connectors (Shopify, Calendar) are free to tap at any time. */
    document.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-task="c-shopify"],[data-task="c-gcal"]');
      if (!t || busy) return;
      var id = t.getAttribute('data-task').slice(2);
      st.conn[id] = 'busy'; render();
      setTimeout(function () { st.conn[id] = true; feedPush(id === 'shopify' ? 'Shopify connected' : 'Google Calendar connected', 'good'); render(); }, 800);
    });

    $('#btn-next').addEventListener('click', onNext);
    $('#btn-back').addEventListener('click', onBack);
    $('#btn-restart').addEventListener('click', function () { goTo(0); });
    $('#btn-auto').addEventListener('click', function () { if (autoOn) stopAuto(); else startAuto(); });

    applyChan();
    enterStep(0, true);
    showDev('phone');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
