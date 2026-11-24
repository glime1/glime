/* =========================================================
   GLIME OTHERS > EXPORT NETWORK  (locked)
   ---------------------------------------------------------
   Deep link: others.html#uae-export   (id kept so old links still work)

   This section is LOCKED for every client. It opens only after a
   GLIME admin approves that client.

   Flow
     1. A distributor applies on export-program.html (public page).
     2. A GLIME admin verifies the application and approves it.
     3. Approved distributors appear here, for approved clients only.
     4. The client searches, opens a listing and requests an introduction.
     5. Requests are tracked under "My requests".

   Direct contact details (phone, email, website) are NEVER returned to
   the client by these RPCs. Introductions go through GLIME.

   Backend (to be built). Every RPC is security definer and must check
   that the caller is an approved client (same rule as access below).

   export_network_my_access() -> true | { approved: true }
     The lock fails closed: if the RPC does not exist, errors out, or
     returns anything other than approved, the client sees the locked screen.

   export_network_directory(
       p_search text, p_country text, p_language text, p_category text,
       p_limit int, p_offset int ) -> jsonb
     p_country is an ISO 3166-1 alpha-2 code. Empty string = no filter.
     Returns APPROVED distributors only:
     {
       "total": 120,
       "items": [{
         "id": "uuid", "company_name": "", "business_type": "",
         "country": "United Arab Emirates", "country_code": "AE", "city": "",
         "about": "", "categories": [""], "languages": [""],
         "primary_language": "", "order_value": "", "payment_terms": [""],
         "shipping_terms": [""], "established_year": 2008,
         "licence_verified": true, "verified_at": "2026-11-24T10:00:00Z",
         "my_request_status": null | "requested" | "in_progress" |
                              "active" | "declined" | "closed"
       }],
       "facets": {
         "countries":  [{ "code": "AE", "name": "United Arab Emirates" }],
         "languages":  [""],
         "categories": [""]
       }
     }

   export_network_request_intro( p_distributor_id uuid, p_note text ) -> jsonb
     Records the client's interest. { "ok": true, "status": "requested" }
     Raises: already_requested, not_approved, not_found.

   export_network_my_requests() -> jsonb array
     [{ "id", "distributor_id", "company_name", "country", "country_code",
        "city", "status", "note", "created_at" }]
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var esc = function (v) { return window.GLIME_OTHERS.ui.escapeHtml(v); };
  var PAGE_SIZE = 24;

  /* ---------------- access gate (unchanged behaviour) ---------------- */
  async function isApproved(api) {
    try {
      var res = await api.supabase.rpc('export_network_my_access');
      if (res.error) return false;
      var d = res.data;
      if (Array.isArray(d)) d = d[0];
      if (d === true) return true;
      return !!(d && typeof d === 'object' && d.approved === true);
    } catch (e) {
      return false;
    }
  }

  /* ---------------- small helpers ---------------- */
  function arr(v) { return Array.isArray(v) ? v.filter(Boolean) : []; }
  function flag(cc) {
    if (!/^[A-Za-z]{2}$/.test(cc || '')) return '';
    var u = cc.toUpperCase();
    return String.fromCodePoint(127397 + u.charCodeAt(0), 127397 + u.charCodeAt(1));
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return p.map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?';
  }
  function fmtDate(v) {
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function where(it) {
    var f = flag(it.country_code);
    var place = [it.city, it.country].filter(Boolean).join(', ');
    return (f ? f + ' ' : '') + place;
  }
  function rpcMissing(err) {
    return !!err && /could not find the function|pgrst202|42883/i.test(((err.code || '') + ' ' + (err.message || '')));
  }
  function errText(err) {
    var t = ((err && err.message) || '').toLowerCase();
    if (/already_requested/.test(t)) return 'You have already requested an introduction to this company.';
    if (/not_approved/.test(t)) return 'Your account is not approved for the Export Network.';
    if (/not_found/.test(t)) return 'This listing is no longer available.';
    if (rpcMissing(err)) return 'This feature is not available yet.';
    return 'Something went wrong. Please try again.';
  }

  var STATUS = {
    requested:   { label: 'Requested',   cls: 'info' },
    in_progress: { label: 'In progress', cls: 'warn' },
    active:      { label: 'Connected',   cls: 'ok' },
    declined:    { label: 'Declined',    cls: 'bad' },
    closed:      { label: 'Closed',      cls: '' }
  };
  function statusChip(s) {
    var m = STATUS[s] || { label: s || 'Requested', cls: 'info' };
    return '<span class="exn-chip ' + m.cls + '">' + esc(m.label) + '</span>';
  }

  /* ---------------- styles (scoped to .exn) ---------------- */
  function ensureStyles() {
    if (document.getElementById('exn-style')) return;
    var s = document.createElement('style');
    s.id = 'exn-style';
    s.textContent =
      '.exn .tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}' +
      '.exn .tab{border:1px solid var(--bd);background:transparent;color:var(--mu);border-radius:10px;padding:9px 15px;font-size:.8rem;font-weight:800}' +
      '.exn .tab.active{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.08)}' +
      'html[data-theme="light"] .exn .tab.active{color:#0e7490;border-color:rgba(14,116,144,.45);background:rgba(14,116,144,.09)}' +
      '.exn .filters{display:grid;grid-template-columns:minmax(0,2fr) repeat(3,minmax(0,1fr)) auto;gap:10px;margin-bottom:12px}' +
      '.exn .filters input,.exn .filters select,.exn .modal textarea{width:100%;background:var(--surf2);color:var(--tx);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;font:inherit;font-size:.82rem;min-width:0}' +
      '.exn .filters input:focus-visible,.exn .filters select:focus-visible,.exn .modal textarea:focus-visible,.exn button:focus-visible{outline:2px solid var(--cy);outline-offset:2px}' +
      '.exn .meta{display:flex;justify-content:space-between;align-items:center;color:var(--mu);font-size:.76rem;margin-bottom:10px;min-height:20px}' +
      '.exn .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px}' +
      '.exn .dcard{background:var(--surf);border:1px solid var(--bd);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:11px;min-width:0}' +
      '.exn .dtop{display:flex;gap:12px;align-items:flex-start}' +
      '.exn .av{width:44px;height:44px;border-radius:12px;background:linear-gradient(105deg,var(--gr),var(--cy));color:#031014;font-weight:800;display:grid;place-items:center;flex:none;font-size:.9rem}' +
      '.exn .dname{font-size:.96rem;font-weight:800;line-height:1.25;word-break:break-word}' +
      '.exn .dloc{color:var(--mu);font-size:.76rem;margin-top:2px}' +
      '.exn .badges{display:flex;flex-wrap:wrap;gap:6px}' +
      '.exn-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--bd);color:var(--mu);border-radius:99px;padding:3px 9px;font-size:.68rem;font-weight:800;line-height:1.4}' +
      '.exn-chip.ok{color:var(--gr);border-color:rgba(80,245,168,.4);background:rgba(80,245,168,.07)}' +
      '.exn-chip.info{color:var(--cy);border-color:rgba(82,232,255,.4);background:rgba(82,232,255,.07)}' +
      '.exn-chip.warn{color:#ffc857;border-color:rgba(255,200,87,.4);background:rgba(255,200,87,.07)}' +
      '.exn-chip.bad{color:var(--rd);border-color:rgba(255,130,145,.4);background:rgba(255,130,145,.07)}' +
      'html[data-theme="light"] .exn-chip.ok{color:#047857}html[data-theme="light"] .exn-chip.info{color:#0e7490}html[data-theme="light"] .exn-chip.warn{color:#b45309}' +
      '.exn .dline{font-size:.76rem;color:var(--mu)}.exn .dline b{color:var(--tx);font-weight:700}' +
      '.exn .tags{display:flex;flex-wrap:wrap;gap:5px}' +
      '.exn .tag{background:var(--surf2);border:1px solid var(--bd);border-radius:8px;padding:3px 8px;font-size:.7rem;color:var(--tx)}' +
      '.exn .dactions{display:flex;gap:8px;margin-top:auto;padding-top:4px}' +
      '.exn .dactions .btn{flex:1;padding:9px 10px}' +
      '.exn .more{text-align:center;margin:16px 0 4px}' +
      '.exn .reqrow{display:flex;gap:12px;align-items:center;justify-content:space-between;background:var(--surf);border:1px solid var(--bd);border-radius:14px;padding:13px 15px;margin-bottom:10px;flex-wrap:wrap}' +
      '.exn .reqrow .rn{font-weight:800;font-size:.9rem}.exn .reqrow .rs{color:var(--mu);font-size:.74rem}' +
      '.exn .modal-bg{position:fixed;inset:0;background:rgba(2,8,12,.72);z-index:2147480500;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.exn .modal{background:var(--surf);border:1px solid var(--bd);border-radius:18px;width:min(560px,100%);max-height:88vh;overflow:auto;padding:20px}' +
      '.exn .modal h3{font-size:1.1rem;margin-bottom:2px}' +
      '.exn .modal .sec{margin-top:14px}.exn .modal .sec h4{font-size:.72rem;color:var(--mu);font-weight:800;margin-bottom:6px}' +
      '.exn .modal p{font-size:.84rem;color:var(--tx)}' +
      '.exn .modal .mbar{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap}' +
      '@media(max-width:900px){.exn .filters{grid-template-columns:1fr 1fr}.exn .filters .q{grid-column:1/-1}}' +
      '@media(max-width:520px){.exn .filters{grid-template-columns:1fr}.exn .grid{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }

  /* ---------------- views ---------------- */
  function head() {
    return '<div class="section-head">' +
      '<h2>Export Network</h2>' +
      '<p>Find verified distributors and ask GLIME to introduce you.</p>' +
    '</div>';
  }

  function lockedView() {
    return head() +
      '<div class="card" style="text-align:center;padding:38px 20px">' +
        '<div style="font-size:2.4rem;line-height:1" aria-hidden="true">\uD83D\uDD12</div>' +
        '<h2 style="font-size:1.1rem;margin:12px 0 6px">This section is locked</h2>' +
        '<p style="color:var(--mu);font-size:.82rem;max-width:460px;margin:0 auto">' +
          'The Export Network opens only after GLIME approves your account.' +
        '</p>' +
      '</div>';
  }

  /* ---------------- main screen ---------------- */
  function mountApproved(ctx) {
    ensureStyles();
    var api = ctx.api;
    var root = ctx.container;
    var S = {
      tab: 'directory',
      q: '', country: '', language: '', category: '',
      items: [], total: 0, facets: { countries: [], languages: [], categories: [] },
      loading: false, error: '', token: 0, timer: null
    };

    root.innerHTML = '<div class="exn">' + head() +
      '<div class="tabs" role="tablist">' +
        '<button type="button" class="tab active" role="tab" data-tab="directory" aria-selected="true">Directory</button>' +
        '<button type="button" class="tab" role="tab" data-tab="requests" aria-selected="false">My requests</button>' +
      '</div>' +
      '<div id="exnBody"></div>' +
    '</div>';

    var body = root.querySelector('#exnBody');

    root.querySelector('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-tab]') : null;
      if (!b || b.getAttribute('data-tab') === S.tab) return;
      S.tab = b.getAttribute('data-tab');
      [].forEach.call(root.querySelectorAll('.tab'), function (t) {
        var on = t.getAttribute('data-tab') === S.tab;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      show();
    });

    function show() { if (S.tab === 'directory') showDirectory(); else showRequests(); }

    /* ----- directory ----- */
    function optionList(placeholder, list, cur) {
      return '<option value="">' + esc(placeholder) + '</option>' + list.map(function (o) {
        return '<option value="' + esc(o.value) + '"' + (o.value === cur ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('');
    }
    function facetOpts(list) {
      return arr(list).map(function (x) {
        return typeof x === 'string' ? { value: x, label: x } : { value: x.code || x.value || x.name, label: x.name || x.label || x.code };
      });
    }

    function showDirectory() {
      body.innerHTML =
        '<div class="filters">' +
          '<input class="q" type="search" id="exnQ" placeholder="Search by company, product or city" aria-label="Search distributors" value="' + esc(S.q) + '" maxlength="80">' +
          '<select id="exnCountry" aria-label="Country"></select>' +
          '<select id="exnLang" aria-label="Language"></select>' +
          '<select id="exnCat" aria-label="Product category"></select>' +
          '<button type="button" class="btn" id="exnClear">Clear</button>' +
        '</div>' +
        '<div class="meta"><span id="exnCount"></span></div>' +
        '<div id="exnList"></div>';
      fillFilters();

      body.querySelector('#exnQ').addEventListener('input', function (e) {
        S.q = e.target.value;
        clearTimeout(S.timer);
        S.timer = setTimeout(function () { load(false); }, 350);
      });
      body.querySelector('#exnCountry').addEventListener('change', function (e) { S.country = e.target.value; load(false); });
      body.querySelector('#exnLang').addEventListener('change', function (e) { S.language = e.target.value; load(false); });
      body.querySelector('#exnCat').addEventListener('change', function (e) { S.category = e.target.value; load(false); });
      body.querySelector('#exnClear').addEventListener('click', function () {
        S.q = ''; S.country = ''; S.language = ''; S.category = '';
        body.querySelector('#exnQ').value = '';
        fillFilters();
        load(false);
      });
      body.querySelector('#exnList').addEventListener('click', onListClick);
      load(false);
    }

    function fillFilters() {
      var c = body.querySelector('#exnCountry'), l = body.querySelector('#exnLang'), k = body.querySelector('#exnCat');
      if (!c) return;
      c.innerHTML = optionList('All countries', facetOpts(S.facets.countries), S.country);
      l.innerHTML = optionList('All languages', facetOpts(S.facets.languages), S.language);
      k.innerHTML = optionList('All categories', facetOpts(S.facets.categories), S.category);
    }

    async function load(append) {
      var listEl = body.querySelector('#exnList');
      var countEl = body.querySelector('#exnCount');
      if (!listEl) return;
      var my = ++S.token;
      S.loading = true; S.error = '';
      if (!append) {
        S.items = [];
        listEl.innerHTML = '<div class="loading">Loading distributors\u2026</div>';
        countEl.textContent = '';
      }
      var res;
      try {
        res = await api.supabase.rpc('export_network_directory', {
          p_search: S.q.trim(), p_country: S.country, p_language: S.language, p_category: S.category,
          p_limit: PAGE_SIZE, p_offset: append ? S.items.length : 0
        });
      } catch (e) { res = { error: e }; }
      if (my !== S.token || S.tab !== 'directory') return;
      S.loading = false;

      if (res.error) {
        console.error('Export directory error:', res.error);
        if (append) { ctx.ui.toast('Could not load more distributors.', true); renderList(); return; }
        listEl.innerHTML = '<div class="error">' + esc(rpcMissing(res.error) ? 'The distributor directory is not available yet.' : 'Could not load distributors.') +
          ' <button type="button" class="btn" id="exnRetry" style="margin-left:8px">Try again</button></div>';
        var r = listEl.querySelector('#exnRetry'); if (r) r.onclick = function () { load(false); };
        return;
      }
      var d = res.data;
      if (Array.isArray(d)) d = d[0];
      d = d || {};
      var got = arr(d.items);
      S.items = append ? S.items.concat(got) : got;
      S.total = typeof d.total === 'number' ? d.total : S.items.length;
      if (d.facets && !append) {
        S.facets = { countries: arr(d.facets.countries), languages: arr(d.facets.languages), categories: arr(d.facets.categories) };
        fillFilters();
      }
      renderList();
    }

    function card(it) {
      var cats = arr(it.categories), langs = arr(it.languages);
      var catTags = cats.slice(0, 3).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join('') +
        (cats.length > 3 ? '<span class="tag">+' + (cats.length - 3) + ' more</span>' : '');
      var req = it.my_request_status
        ? '<span style="display:flex;align-items:center;justify-content:center;flex:1">' + statusChip(it.my_request_status) + '</span>'
        : '<button type="button" class="btn primary" data-act="intro" data-id="' + esc(it.id) + '">Request introduction</button>';
      return '<article class="dcard">' +
        '<div class="dtop"><div class="av" aria-hidden="true">' + esc(initials(it.company_name)) + '</div>' +
          '<div style="min-width:0"><div class="dname">' + esc(it.company_name) + '</div>' +
          '<div class="dloc">' + esc(where(it)) + '</div></div></div>' +
        '<div class="badges"><span class="exn-chip ok">Verified by GLIME</span>' +
          (it.licence_verified ? '<span class="exn-chip info">Licence checked</span>' : '') +
          (it.business_type ? '<span class="exn-chip">' + esc(it.business_type) + '</span>' : '') + '</div>' +
        (catTags ? '<div class="tags">' + catTags + '</div>' : '') +
        (langs.length ? '<div class="dline"><b>Speaks:</b> ' + esc(langs.join(', ')) + '</div>' : '') +
        (it.order_value ? '<div class="dline"><b>Typical order:</b> ' + esc(it.order_value) + '</div>' : '') +
        '<div class="dactions"><button type="button" class="btn" data-act="view" data-id="' + esc(it.id) + '">Details</button>' + req + '</div>' +
      '</article>';
    }

    function renderList() {
      var listEl = body.querySelector('#exnList');
      var countEl = body.querySelector('#exnCount');
      if (!listEl) return;
      countEl.textContent = S.total + (S.total === 1 ? ' distributor' : ' distributors');
      if (!S.items.length) {
        var filtered = S.q || S.country || S.language || S.category;
        listEl.innerHTML = '<div class="empty">' + (filtered
          ? 'No distributors match these filters. Try a different country, language or category.'
          : 'No verified distributors are listed yet. New listings appear here after GLIME approves them.') + '</div>';
        return;
      }
      listEl.innerHTML = '<div class="grid">' + S.items.map(card).join('') + '</div>' +
        (S.items.length < S.total ? '<div class="more"><button type="button" class="btn" data-act="more">Show more</button></div>' : '');
    }

    function find(id) {
      for (var i = 0; i < S.items.length; i++) if (String(S.items[i].id) === String(id)) return S.items[i];
      return null;
    }

    function onListClick(e) {
      var b = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!b) return;
      var act = b.getAttribute('data-act');
      if (act === 'more') { b.disabled = true; load(true); return; }
      var it = find(b.getAttribute('data-id'));
      if (!it) return;
      if (act === 'view') openDetails(it);
      if (act === 'intro') openIntro(it);
    }

    /* ----- modals ----- */
    function modal(html) {
      var bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
      function close() { document.removeEventListener('keydown', onKey); if (bg.parentNode) bg.parentNode.removeChild(bg); }
      function onKey(e) { if (e.key === 'Escape') close(); }
      bg.addEventListener('mousedown', function (e) { if (e.target === bg) close(); });
      document.addEventListener('keydown', onKey);
      root.querySelector('.exn').appendChild(bg);
      var first = bg.querySelector('button, textarea');
      if (first) first.focus();
      return { el: bg, close: close };
    }
    function tagsOf(list) { return arr(list).map(function (c) { return '<span class="tag">' + esc(c) + '</span>'; }).join(''); }

    function openDetails(it) {
      var rows = '';
      if (it.about) rows += '<div class="sec"><h4>About</h4><p>' + esc(it.about) + '</p></div>';
      if (arr(it.categories).length) rows += '<div class="sec"><h4>Buys</h4><div class="tags">' + tagsOf(it.categories) + '</div></div>';
      if (arr(it.languages).length) rows += '<div class="sec"><h4>Languages</h4><p>' + esc(arr(it.languages).join(', ')) +
        (it.primary_language ? '<br>Preferred for messages: <b>' + esc(it.primary_language) + '</b>' : '') + '</p></div>';
      if (it.order_value) rows += '<div class="sec"><h4>Typical order</h4><p>' + esc(it.order_value) + '</p></div>';
      if (arr(it.payment_terms).length) rows += '<div class="sec"><h4>Payment terms</h4><div class="tags">' + tagsOf(it.payment_terms) + '</div></div>';
      if (arr(it.shipping_terms).length) rows += '<div class="sec"><h4>Shipping terms</h4><div class="tags">' + tagsOf(it.shipping_terms) + '</div></div>';
      var ver = [];
      if (it.established_year) ver.push('Established ' + it.established_year);
      if (it.verified_at) ver.push('Verified by GLIME on ' + fmtDate(it.verified_at));
      var m = modal(
        '<h3>' + esc(it.company_name) + '</h3>' +
        '<div class="dloc">' + esc(where(it)) + '</div>' +
        '<div class="badges" style="margin-top:10px"><span class="exn-chip ok">Verified by GLIME</span>' +
          (it.licence_verified ? '<span class="exn-chip info">Licence checked</span>' : '') +
          (it.business_type ? '<span class="exn-chip">' + esc(it.business_type) + '</span>' : '') + '</div>' +
        rows +
        (ver.length ? '<div class="sec"><h4>Verification</h4><p>' + esc(ver.join('. ')) + '.</p></div>' : '') +
        '<div class="sec"><p style="color:var(--mu);font-size:.76rem">Contact details are kept private. GLIME sets up the introduction for you.</p></div>' +
        '<div class="mbar"><button type="button" class="btn" data-m="close">Close</button>' +
          (it.my_request_status ? '' : '<button type="button" class="btn primary" data-m="intro">Request introduction</button>') + '</div>'
      );
      m.el.addEventListener('click', function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-m');
        if (a === 'close') m.close();
        if (a === 'intro') { m.close(); openIntro(it); }
      });
    }

    function openIntro(it) {
      var m = modal(
        '<h3>Request an introduction</h3>' +
        '<div class="dloc">' + esc(it.company_name) + ', ' + esc(where(it)) + '</div>' +
        '<div class="sec"><h4>Which products do you want to offer? (optional)</h4>' +
          '<textarea id="exnNote" rows="4" maxlength="500" placeholder="For example: basmati rice and spices, minimum order 5 tons."></textarea></div>' +
        '<div class="sec"><p style="color:var(--mu);font-size:.76rem">GLIME will arrange the introduction. Your request appears under My requests.</p></div>' +
        '<div class="mbar"><button type="button" class="btn" data-m="close">Cancel</button>' +
        '<button type="button" class="btn primary" data-m="send">Send request</button></div>'
      );
      m.el.addEventListener('click', async function (e) {
        var a = e.target.getAttribute && e.target.getAttribute('data-m');
        if (a === 'close') { m.close(); return; }
        if (a !== 'send') return;
        var btn = e.target;
        btn.disabled = true; btn.textContent = 'Sending\u2026';
        var note = (m.el.querySelector('#exnNote').value || '').trim();
        var res;
        try {
          res = await api.supabase.rpc('export_network_request_intro', { p_distributor_id: it.id, p_note: note });
        } catch (err) { res = { error: err }; }
        if (res.error) {
          console.error('Introduction request error:', res.error);
          ctx.ui.toast(errText(res.error), true);
          btn.disabled = false; btn.textContent = 'Send request';
          return;
        }
        it.my_request_status = 'requested';
        m.close();
        ctx.ui.toast('Request sent');
        if (S.tab === 'directory') renderList();
      });
    }

    /* ----- my requests ----- */
    async function showRequests() {
      body.innerHTML = '<div class="loading">Loading your requests\u2026</div>';
      var res;
      try { res = await api.supabase.rpc('export_network_my_requests'); } catch (e) { res = { error: e }; }
      if (S.tab !== 'requests') return;
      if (res.error) {
        console.error('Export requests error:', res.error);
        body.innerHTML = '<div class="error">' + esc(rpcMissing(res.error) ? 'Requests are not available yet.' : 'Could not load your requests.') + '</div>';
        return;
      }
      var rows = arr(res.data);
      if (!rows.length) {
        body.innerHTML = '<div class="empty">You have not requested any introductions yet. Open the Directory, pick a distributor and choose Request introduction.</div>';
        return;
      }
      body.innerHTML = rows.map(function (r) {
        return '<div class="reqrow"><div style="min-width:0"><div class="rn">' + esc(r.company_name) + '</div>' +
          '<div class="rs">' + esc(where(r)) + (r.created_at ? ' &middot; Requested ' + esc(fmtDate(r.created_at)) : '') + '</div>' +
          (r.note ? '<div class="rs" style="margin-top:3px">' + esc(r.note) + '</div>' : '') + '</div>' +
          statusChip(r.status) + '</div>';
      }).join('');
    }

    show();
  }

  /* ---------------- register ---------------- */
  window.GLIME_OTHERS.register({
    id: 'uae-export',
    label: 'Export Network',
    order: 40,
    render: async function (ctx) {
      ctx.container.innerHTML = '<div class="loading">Checking access\u2026</div>';
      var ok = await isApproved(ctx.api);
      if (!ok) { ctx.container.innerHTML = lockedView(); return; }
      mountApproved(ctx);
    }
  });
})();
