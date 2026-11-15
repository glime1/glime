/* =========================================================
   GLIME — CREATOR CONNECTOR CARD (Settings > Connector and Connector Hub)
   ---------------------------------------------------------
   Built the same way as connector-telegram-addon.js, with one big difference:
   Telegram is a switch the client flips in their own browser. Creator is
   decided by the GLIME team, so the truth lives in the backend and this card
   only reads it and shows the right state:

     No application yet -> short text + "Apply as a creator" form
     Pending            -> "Under review" + passcode to put in the bio/description
     Approved           -> "Approved" + "Open Creator" (creator.html)
     Rejected           -> reason + "Edit and apply again" (a new passcode is issued)

   Ownership check: after applying, the server gives the creator a passcode
   (for example GLIME-3F9A2C). The creator pastes it in their Instagram bio or
   YouTube channel description for 1-2 days. The GLIME team opens the profile
   from the admin Creators tab, sees the same passcode, and approves.

   Backend this card expects (names can be changed in CFG below):
     table  public.creator_applications   (one row per signed-in user)
            auth_user_id, full_name, instagram_url, youtube_url, followers,
            category, course_name, status ('pending'|'approved'|'rejected'),
            reject_reason, verify_code, created_at, updated_at
            RLS: a user may only SELECT their own row. A user must NOT be able
            to INSERT/UPDATE the status column directly.
     rpc    client_submit_creator_application(
              p_full_name, p_instagram_url, p_youtube_url,
              p_followers, p_category, p_course_name)
            Creates or updates the caller's row, always sets status to
            'pending' and creates the passcode on the server.
   If the table or the function does not exist yet, the card shows
   "not available yet" and nothing else on the Connector page is affected.

   When the status is "approved" this card stores a small per-user hint in
   localStorage (glime_creator_ok_<auth user id>) and fires the
   'glime-creator-connector' event, so glime-creator-nav-addon.js can show the
   sidebar link without waiting for the network. The hint is only for display.
   The real permission must be checked by the backend on creator.html's data.

   Loaded on demand; if it fails, the rest of the Connector page is unaffected.
   Uses the shared Connector styles (gcx-*) from connector-ui.js.
   ========================================================= */
(function () {
  'use strict';
  if (window.GLIME_CREATOR) return;

  var CFG = {
    TABLE: 'creator_applications',
    RPC_APPLY: 'client_submit_creator_application',
    PAGE: 'creator.html',
    PREFIX: 'glime_creator_ok_',
    EVENT: 'glime-creator-connector'
  };

  var CATEGORIES = [
    'AI & Technology', 'Yoga & Fitness', 'Beauty & Makeup', 'Business & Marketing',
    'Education & Exams', 'Cooking', 'Music & Art', 'Other'
  ];

  var STAR = 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z';

  var CSS =
    '.gcr-form{display:grid;gap:12px;margin:12px 0 4px}' +
    '.gcr-form label{display:grid;gap:4px;font-size:.82rem;font-weight:600}' +
    '.gcr-form input,.gcr-form select{width:100%;min-height:42px;padding:0 12px;border:1px solid rgba(127,127,127,.4);' +
    'border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:.9rem;box-sizing:border-box}' +
    '.gcr-form select option{color:#000}' +
    '.gcr-form input:focus-visible,.gcr-form select:focus-visible{outline:2px solid #00f0ff;outline-offset:2px}' +
    '.gcr-form small{font-weight:400;opacity:.7}' +
    '.gcr-fe{color:#ff6b6b;font-size:.78rem;font-weight:600}' +
    '.gcr-sum{margin:10px 0 0;padding:0;list-style:none;font-size:.84rem;display:grid;gap:4px}' +
    '.gcr-sum li{display:flex;gap:8px;flex-wrap:wrap}' +
    '.gcr-sum b{opacity:.7;font-weight:600}' +
    '.gcr-note{margin:10px 0 0;padding:10px 12px;border-radius:10px;border:1px dashed rgba(127,127,127,.5);font-size:.84rem}' +
    '.gcr-link{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}' +
    '.gcr-code{margin:12px 0 0;padding:14px;border-radius:12px;border:1px solid rgba(245,166,35,.55);background:rgba(245,166,35,.08)}' +
    '.gcr-code small{display:block;font-size:.76rem;opacity:.8;margin-bottom:6px}' +
    '.gcr-code strong{display:block;font-size:1.35rem;letter-spacing:.08em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
    'word-break:break-all;user-select:all}' +
    '.gcr-code p{margin:10px 0 0;font-size:.82rem;line-height:1.5}' +
    '.gcr-code .gcx-btn{margin-top:10px}';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function injectCss() {
    if (document.getElementById('gcrStyle')) return;
    var s = document.createElement('style');
    s.id = 'gcrStyle';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* Display hint for the sidebar link (see header). */
  function setHint(uid, on) {
    if (!uid) return;
    try {
      if (on) localStorage.setItem(CFG.PREFIX + uid, '1');
      else localStorage.removeItem(CFG.PREFIX + uid);
    } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent(CFG.EVENT, { detail: { on: !!on } })); } catch (e) { /* ignore */ }
  }

  function isMissing(err) {
    if (!err) return false;
    var code = String(err.code || '');
    var msg = String(err.message || '').toLowerCase();
    return code === 'PGRST202' || code === 'PGRST205' || code === '42P01' || code === '42883' ||
      msg.indexOf('could not find') > -1 || msg.indexOf('does not exist') > -1;
  }

  /* ---------- form checks ---------- */
  function cleanUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
    return v;
  }

  function hostOf(u) {
    try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch (e) { return ''; }
  }

  function validate(d) {
    var e = {};
    var name = String(d.full_name || '').trim();
    if (name.length < 2) e.full_name = 'Enter your name.';

    var ig = cleanUrl(d.instagram_url), yt = cleanUrl(d.youtube_url);
    if (!ig && !yt) {
      e.instagram_url = 'Add your Instagram or YouTube link (at least one).';
    }
    if (ig) {
      var ih = hostOf(ig);
      if (!(ih === 'instagram.com' || ih === 'instagr.am' || /\.instagram\.com$/.test(ih))) {
        e.instagram_url = 'This does not look like an Instagram link.';
      }
    }
    if (yt) {
      var yh = hostOf(yt);
      if (!(yh === 'youtube.com' || yh === 'youtu.be' || /\.youtube\.com$/.test(yh))) {
        e.youtube_url = 'This does not look like a YouTube link.';
      }
    }

    var f = String(d.followers == null ? '' : d.followers).replace(/[,\s]/g, '');
    if (!/^\d{1,10}$/.test(f)) e.followers = 'Enter your followers as a number, for example 12000.';

    if (!d.category || CATEGORIES.indexOf(d.category) < 0) e.category = 'Choose a category.';
    if (String(d.course_name || '').trim().length < 3) e.course_name = 'Enter the name of the course you want to sell.';
    return e;
  }

  function mount(container, opts) {
    opts = opts || {};
    var sb = opts.sb;
    var UI = window.GLIME_CONNECTOR_UI;
    if (!container || container._gcxCr || !sb) return;
    container._gcxCr = true;
    if (UI && UI.injectStyles) UI.injectStyles();
    injectCss();
    container.classList.add('gcx');

    var st = {
      uid: '', loading: true, row: null, unavailable: false, loadErr: '',
      form: false, busy: false, msg: '', errs: {}, draft: {}, copied: false
    };

    function stateName() {
      if (st.unavailable) return 'unavailable';
      if (st.loading) return 'loading';
      if (st.loadErr) return 'error';
      if (!st.row) return 'none';
      var s = String(st.row.status || '').toLowerCase();
      if (s === 'approved') return 'approved';
      if (s === 'rejected') return 'rejected';
      return 'pending';
    }

    function fmtFollowers(n) {
      var x = Number(n);
      return isFinite(x) ? x.toLocaleString('en-IN') : '';
    }

    function summaryHtml(r) {
      var rows = [
        ['Name', r.full_name],
        ['Instagram', r.instagram_url],
        ['YouTube', r.youtube_url],
        ['Followers', fmtFollowers(r.followers)],
        ['Category', r.category],
        ['Course', r.course_name]
      ].filter(function (x) { return x[1]; });
      return '<ul class="gcr-sum">' + rows.map(function (x) {
        return '<li><b>' + esc(x[0]) + ':</b><span>' + esc(x[1]) + '</span></li>';
      }).join('') + '</ul>';
    }

    /* Where the passcode must be placed, based on the links the creator gave. */
    function whereText(r) {
      var ig = r && r.instagram_url, yt = r && r.youtube_url;
      if (ig && yt) return 'your Instagram bio or your YouTube channel description (any one is enough)';
      if (ig) return 'your Instagram bio';
      return 'your YouTube channel description';
    }

    function codeHtml(r) {
      var code = r && r.verify_code ? String(r.verify_code) : '';
      if (!code) return '';
      return '<div class="gcr-code">' +
        '<small>Your verification passcode</small>' +
        '<strong>' + esc(code) + '</strong>' +
        '<p>Add this passcode to ' + esc(whereText(r)) + ' and keep it there for <b>1–2 days</b> so our team can check that the account is yours and review your application. You can remove it after you are approved.</p>' +
        '<button type="button" class="gcx-btn" data-cr-act="copy" data-code="' + esc(code) + '">' + (st.copied ? 'Copied ✓' : 'Copy passcode') + '</button>' +
      '</div>';
    }

    function fieldHtml(key, label, type, hint, extra) {
      var v = st.draft[key] == null ? '' : st.draft[key];
      var err = st.errs[key] ? '<span class="gcr-fe" role="alert">' + esc(st.errs[key]) + '</span>' : '';
      var input;
      if (type === 'select') {
        input = '<select data-cr-f="' + key + '" name="' + key + '"' + (st.errs[key] ? ' aria-invalid="true"' : '') + '>' +
          '<option value="">Choose…</option>' +
          CATEGORIES.map(function (c) {
            return '<option value="' + esc(c) + '"' + (c === v ? ' selected' : '') + '>' + esc(c) + '</option>';
          }).join('') + '</select>';
      } else {
        input = '<input data-cr-f="' + key + '" name="' + key + '" type="' + type + '" value="' + esc(v) + '"' +
          (extra || '') + (st.errs[key] ? ' aria-invalid="true"' : '') + '>';
      }
      return '<label>' + esc(label) + (hint ? ' <small>' + esc(hint) + '</small>' : '') + input + err + '</label>';
    }

    function formHtml() {
      return '<form class="gcr-form" data-cr-form novalidate>' +
        (st.msg ? '<div class="gcx-status err" role="alert">' + esc(st.msg) + '</div>' : '') +
        fieldHtml('full_name', 'Your name', 'text', '', ' autocomplete="name" maxlength="80"') +
        fieldHtml('instagram_url', 'Instagram profile link', 'url', '(optional if you add YouTube)', ' inputmode="url" placeholder="https://instagram.com/yourname"') +
        fieldHtml('youtube_url', 'YouTube channel link', 'url', '(optional if you add Instagram)', ' inputmode="url" placeholder="https://youtube.com/@yourchannel"') +
        fieldHtml('followers', 'Total followers', 'text', '', ' inputmode="numeric" placeholder="12000"') +
        fieldHtml('category', 'Category', 'select', '') +
        fieldHtml('course_name', 'Course you want to sell', 'text', '', ' maxlength="120" placeholder="e.g. Learn AI tools in 7 days"') +
        '<div class="gcr-note">After you submit, we give you a <b>verification passcode</b>. You will add it to your Instagram bio or YouTube channel description for 1–2 days so our team can confirm the account is yours.</div>' +
        '<div class="gcx-actions">' +
          '<button type="submit" class="gcx-btn primary"' + (st.busy ? ' disabled' : '') + '>' + (st.busy ? 'Sending…' : 'Submit application') + '</button> ' +
          '<button type="button" class="gcx-btn" data-cr-act="cancel"' + (st.busy ? ' disabled' : '') + '>Cancel</button>' +
        '</div>' +
      '</form>';
    }

    function draw() {
      if (!container.isConnected) return;
      var sn = stateName();
      var on = sn === 'approved';
      var badge = { loading: 'Checking…', unavailable: 'Not available', error: 'Unknown', none: 'Not applied',
        pending: 'Pending', approved: 'Approved ✓', rejected: 'Rejected' }[sn];
      var body = '', actions = '';

      if (sn === 'loading') {
        body = '<p class="gcx-desc">Checking your creator status…</p>';
      } else if (sn === 'unavailable') {
        body = '<p class="gcx-desc">The Creator program is not available for your account yet. Please check again later.</p>';
      } else if (sn === 'error') {
        body = '<div class="gcx-status err" role="alert">' + esc(st.loadErr) + '</div>';
        actions = '<button type="button" class="gcx-btn primary" data-cr-act="refresh">Try again</button>';
      } else if (st.form) {
        body = '<p class="gcx-desc">Tell us about your audience and the course you want to sell. Our team will review your application.</p>' + formHtml();
      } else if (sn === 'none') {
        body = '<p class="gcx-desc">Sell your own course through GLIME. Apply as a creator, and when our team approves you, Creator appears in your menu.</p>';
        actions = '<button type="button" class="gcx-btn primary" data-cr-act="apply">Apply as a creator</button>';
      } else if (sn === 'pending') {
        body = '<p class="gcx-desc">Your application is under review. When it is approved, Creator will appear in your menu automatically.</p>' +
          codeHtml(st.row) + summaryHtml(st.row);
        actions = '<button type="button" class="gcx-btn" data-cr-act="refresh">Refresh status</button>';
      } else if (sn === 'approved') {
        body = '<p class="gcx-desc">You are approved as a creator. Open the Creator page to manage your course.</p>';
        actions = '<a class="gcx-btn primary gcr-link" href="' + esc(CFG.PAGE) + '">Open Creator</a>';
      } else if (sn === 'rejected') {
        var why = st.row && st.row.reject_reason ? String(st.row.reject_reason).trim() : '';
        body = '<p class="gcx-desc">Your application was not approved this time.</p>' +
          (why ? '<div class="gcr-note"><b>Reason:</b> ' + esc(why) + '</div>' : '') + summaryHtml(st.row);
        actions = '<button type="button" class="gcx-btn primary" data-cr-act="apply">Edit and apply again</button>';
      }

      var err = '';
      container.innerHTML =
        '<section class="gcx-group" aria-label="Creator">' +
          '<h3 class="gcx-group-title">Creator</h3>' + err +
          '<div class="gcx-grid">' +
            '<article class="gcx-card" data-provider="creator" data-state="' + (on ? 'connected' : 'not_connected') + '">' +
              '<div class="gcx-top">' +
                '<span class="gcx-ico gcx-logo" style="color:#f5a623" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="' + STAR + '"/></svg></span>' +
                '<div class="gcx-titles"><h4 class="gcx-name">Creator</h4>' +
                  '<span class="gcx-badge' + (on ? ' on' : '') + '">' + esc(badge) + '</span></div>' +
              '</div>' +
              body +
              (actions && !st.form ? '<div class="gcx-actions">' + actions + '</div>' : '') +
            '</article>' +
          '</div>' +
        '</section>';
    }

    /* silent = refresh without flashing "Checking…" */
    function load(silent) {
      if (!st.uid) return Promise.resolve();
      if (!silent) { st.loading = true; st.loadErr = ''; draw(); }
      return sb.from(CFG.TABLE)
        .select('status,reject_reason,verify_code,full_name,instagram_url,youtube_url,followers,category,course_name,updated_at')
        .eq('auth_user_id', st.uid)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(function (res) {
          st.loading = false;
          if (res.error) {
            if (isMissing(res.error)) { st.unavailable = true; st.loadErr = ''; }
            else if (!silent || !st.row) { st.loadErr = 'We could not check your creator status. Please try again.'; }
            return;
          }
          st.unavailable = false;
          st.loadErr = '';
          st.row = res.data || null;
          setHint(st.uid, !!(st.row && String(st.row.status).toLowerCase() === 'approved'));
        })
        .catch(function () {
          st.loading = false;
          if (!silent || !st.row) st.loadErr = 'We could not check your creator status. Please try again.';
        })
        .then(function () { if (!st.form) draw(); });
    }

    function openForm() {
      var r = st.row || {};
      st.draft = {
        full_name: r.full_name || '',
        instagram_url: r.instagram_url || '',
        youtube_url: r.youtube_url || '',
        followers: r.followers != null ? String(r.followers) : '',
        category: r.category || '',
        course_name: r.course_name || ''
      };
      st.errs = {};
      st.msg = '';
      st.form = true;
      draw();
      var first = container.querySelector('[data-cr-f="full_name"]');
      if (first) first.focus();
    }

    function submit() {
      if (st.busy) return;
      st.errs = validate(st.draft);
      st.msg = '';
      var keys = Object.keys(st.errs);
      if (keys.length) {
        draw();
        var bad = container.querySelector('[data-cr-f="' + keys[0] + '"]');
        if (bad) bad.focus();
        return;
      }
      st.busy = true;
      draw();
      var ig = cleanUrl(st.draft.instagram_url), yt = cleanUrl(st.draft.youtube_url);
      sb.rpc(CFG.RPC_APPLY, {
        p_full_name: String(st.draft.full_name).trim(),
        p_instagram_url: ig || null,
        p_youtube_url: yt || null,
        p_followers: Number(String(st.draft.followers).replace(/[,\s]/g, '')),
        p_category: st.draft.category,
        p_course_name: String(st.draft.course_name).trim()
      }).then(function (res) {
        st.busy = false;
        if (res.error) {
          st.msg = isMissing(res.error)
            ? 'The Creator program is not available for your account yet.'
            : 'Your application could not be sent. Please try again.';
          if (isMissing(res.error)) { st.unavailable = true; st.form = false; }
          draw();
          return;
        }
        st.form = false;
        st.copied = false;
        return load(false);
      }).catch(function () {
        st.busy = false;
        st.msg = 'Your application could not be sent. Please check your internet and try again.';
        draw();
      });
    }

    function copyCode(code, btn) {
      if (!code) return;
      function done() {
        st.copied = true;
        if (btn) btn.textContent = 'Copied \u2713';
        setTimeout(function () { st.copied = false; if (btn && btn.isConnected) btn.textContent = 'Copy passcode'; }, 2000);
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done, function () { window.prompt('Copy this passcode:', code); });
          return;
        }
      } catch (e) { /* fall through */ }
      window.prompt('Copy this passcode:', code);
    }

    container.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-cr-act]');
      if (!b || !container.contains(b)) return;
      var act = b.getAttribute('data-cr-act');
      if (act === 'apply') openForm();
      else if (act === 'cancel') { st.form = false; st.msg = ''; draw(); }
      else if (act === 'refresh') load(false);
      else if (act === 'copy') copyCode(b.getAttribute('data-code'), b);
    });

    container.addEventListener('input', function (ev) {
      var f = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-cr-f');
      if (f) st.draft[f] = ev.target.value;
    });
    container.addEventListener('change', function (ev) {
      var f = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-cr-f');
      if (f) st.draft[f] = ev.target.value;
    });

    container.addEventListener('submit', function (ev) {
      if (!ev.target.closest('[data-cr-form]')) return;
      ev.preventDefault();
      submit();
    });

    /* Pick up an approval made while this page was open in the background. */
    function onVisible() {
      if (!container.isConnected) { document.removeEventListener('visibilitychange', onVisible); return; }
      if (!document.hidden && st.uid && !st.busy && !st.form && !st.unavailable) load(true);
    }
    document.addEventListener('visibilitychange', onVisible);

    draw();
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (!s || !s.user) { st.loading = false; st.unavailable = true; draw(); return; }
      st.uid = s.user.id;
      return load(false);
    }).catch(function (e) { console.error('GLIME Creator connector error:', e); });
  }

  window.GLIME_CREATOR = { mount: mount };
})();
