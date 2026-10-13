/* =========================================================
   GLIME SHARED PHOTO SYSTEM  (glime-avatar.js)
   ---------------------------------------------------------
   One place that manages every profile photo on the platform:
     owner        Owner DP              (entity_id = client_id)
     business     Business logo         (entity_id = client_id)
     customer     Customer photo        (entity_id = customers.id)
     lead         Lead photo            (entity_id = leads.id)
     whatsapp_conversation   WhatsApp chat photo / DP  (entity_id = whatsapp_conversations.id)
     instagram_conversation  Instagram chat photo / DP (entity_id = instagram_conversations.id)

   Pages never build photo markup or talk to storage themselves.
   They only include this file; it finds the avatar elements on the
   page (see PRESETS below), paints the photo when one exists and
   keeps the normal coloured initials when it does not.

   ---------------------------------------------------------
   BACKEND CONTRACT  (everything the frontend expects)
   ---------------------------------------------------------
   READ (already exists)
     table   public.profile_media
             columns used: client_id, entity_type, entity_id,
                           media_role, storage_path, updated_at
             RLS: authenticated SELECT for the owner's client
     storage bucket "client-assets" (private)
             object path : {client_id}/avatars/{entity_type}/{entity_id}-{timestamp}.jpg
             policies    : insert / update / select / delete on own {client_id}/ folder
     The page reads rows, then createSignedUrls() (1 hour, refreshed
     automatically) to show the image.

   WRITE (to be created in Supabase)
     rpc glime_set_profile_media(
           p_entity_type text, p_entity_id text, p_storage_path text,
           p_mime_type text,   p_size_bytes bigint,
           p_width_px integer, p_height_px integer) returns uuid
         - resolves client_id from auth.uid() (client_data.auth_user_id)
         - checks p_storage_path starts with '{client_id}/avatars/'
         - checks the entity belongs to that client
           (owner/business: p_entity_id = client_id)
         - upserts profile_media on (client_id, entity_type, entity_id, media_role)
           media_role = 'logo' for business, 'avatar' for everything else
           source_type = 'upload'

     rpc glime_remove_profile_media(p_entity_type text, p_entity_id text)
           returns text            -- the removed storage_path (or null)
         - deletes the profile_media row for that entity

   PROVIDER PHOTOS (optional, backend side)
     A backend job may write rows with source_type = 'provider_cache'
     (provider 'whatsapp' / 'instagram') pointing to an object in the
     same bucket. The frontend shows them with no change.

   ---------------------------------------------------------
   PUBLIC API   window.GlimePhoto
   ---------------------------------------------------------
     ready()                         -> Promise<boolean>
     url(type, id)                   -> signed image url or null
     has(type, id)                   -> boolean
     pick(type, id, name)            -> opens the upload / remove dialog
     upload(type, id, file)          -> Promise (resize + storage + rpc)
     remove(type, id)                -> Promise
     avatarHtml(type, id, name, o)   -> markup string for templates
     apply(root)                     -> repaint avatars now
     addRules([...])                 -> extra page rules
     on(fn)                          -> listen for changes
   Any element with  data-gp-type="customer" data-gp-id="<id>"
   (+ optional data-gp-edit) is handled automatically.
========================================================= */
(function () {
  'use strict';
  if (window.GlimePhoto) return;

  var SUPABASE_URL = 'https://ufoulgbiqgjriwapuopc.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';
  var BUCKET = 'client-assets';
  var TABLE = 'profile_media';
  var RPC_SET = 'glime_set_profile_media';
  var RPC_REMOVE = 'glime_remove_profile_media';
  var OUT_PX = 480;
  var MAX_INPUT = 10 * 1024 * 1024;
  var OK_MIME = ['image/jpeg', 'image/png', 'image/webp'];
  var SIGN_SECONDS = 3600;
  var TYPES = {
    owner: 'Owner photo',
    business: 'Business logo',
    customer: 'Customer photo',
    lead: 'Lead photo',
    whatsapp_conversation: 'WhatsApp photo',
    instagram_conversation: 'Instagram photo'
  };

  var sb = null, clientId = null, readyP = null, loggedIn = false;
  var photos = {};            /* "type:id" -> { path, url } */
  var listeners = [];
  var rules = [];

  /* ---------- small helpers ---------- */
  function key(t, id) { return t + ':' + id; }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function q(sel, root) { return (root || document).querySelector(sel); }
  function attr(el, sel, name) {
    var n = el && el.closest ? el.closest(sel) : null;
    return n ? n.getAttribute(name) : null;
  }
  function txt(sel) { var n = q(sel); return n ? n.textContent.trim() : ''; }
  var COLORS = ['#1f9d6e', '#3b6fd8', '#a35ad6', '#d9772b', '#c2467a', '#2b8fb3', '#7d8f1f', '#cc4b4b'];
  function color(seed) {
    var h = 0, s = String(seed || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return COLORS[h % COLORS.length];
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return p.map(function (x) { return x.charAt(0).toUpperCase(); }).join('') || '?';
  }

  /* ---------- supabase ---------- */
  function client() {
    if (sb) return sb;
    if (!window.supabase || !window.supabase.createClient) return null;
    /* Same project + same stored session as the page. No token refresh here:
       the page's own client keeps the session fresh. */
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false }
    });
    return sb;
  }

  function waitForSupabase() {
    return new Promise(function (resolve) {
      var tries = 0;
      (function check() {
        if (client()) return resolve(true);
        if (++tries > 40) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  }

  async function signPaths(paths) {
    var out = {};
    for (var i = 0; i < paths.length; i += 100) {
      var chunk = paths.slice(i, i + 100);
      var r = await sb.storage.from(BUCKET).createSignedUrls(chunk, SIGN_SECONDS);
      if (r.error) { console.warn('[GlimePhoto] sign', r.error); continue; }
      (r.data || []).forEach(function (d) { if (d && d.signedUrl && d.path) out[d.path] = d.signedUrl; });
    }
    return out;
  }

  async function loadAll() {
    var rows = [], from = 0, size = 1000;
    for (;;) {
      var r = await sb.from(TABLE).select('entity_type,entity_id,storage_path,updated_at')
        .eq('client_id', clientId).range(from, from + size - 1);
      if (r.error) { console.warn('[GlimePhoto] load', r.error); break; }
      rows = rows.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
      from += size;
    }
    var next = {};
    rows.forEach(function (row) { next[key(row.entity_type, row.entity_id)] = { path: row.storage_path, url: null }; });
    var signed = await signPaths(Object.keys(next).map(function (k) { return next[k].path; }));
    Object.keys(next).forEach(function (k) { next[k].url = signed[next[k].path] || null; });
    photos = next;
  }

  function init() {
    if (readyP) return readyP;
    readyP = (async function () {
      if (!(await waitForSupabase())) return false;
      var s = await sb.auth.getSession();
      var sess = s && s.data && s.data.session;
      if (!sess) return false;
      var r = await sb.from('client_data').select('client_id').eq('auth_user_id', sess.user.id).maybeSingle();
      if (r.error || !r.data) return false;
      clientId = r.data.client_id;
      loggedIn = true;
      await loadAll();
      setInterval(function () { loadAll().then(function () { paintAll(); }); }, (SIGN_SECONDS - 600) * 1000);
      return true;
    })().catch(function (e) { console.warn('[GlimePhoto]', e); return false; });
    return readyP;
  }

  function emit(type, id) {
    listeners.forEach(function (fn) { try { fn(type, id); } catch (e) { /* ignore */ } });
    try { window.dispatchEvent(new CustomEvent('glime:photos-changed', { detail: { type: type, id: id } })); } catch (e) { /* ignore */ }
    paintAll();
  }

  /* ---------- reading ---------- */
  function url(type, id) { var p = photos[key(type, id)]; return (p && p.url) || null; }
  function has(type, id) { return !!url(type, id); }

  /* ---------- writing ---------- */
  function toJpeg(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var s = Math.min(img.naturalWidth, img.naturalHeight), out = Math.min(OUT_PX, s);
        var cv = document.createElement('canvas'); cv.width = cv.height = out;
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, out, out);
        cv.toBlob(function (b) {
          URL.revokeObjectURL(u);
          if (b) resolve({ blob: b, w: out, h: out }); else reject(new Error('Could not process this image.'));
        }, 'image/jpeg', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('This image could not be read. Use JPG, PNG or WebP.')); };
      img.src = u;
    });
  }

  function backendMessage(err, fn) {
    var m = String((err && (err.message || err.error_description)) || err || '');
    if ((err && err.code === 'PGRST202') || /could not find the function|does not exist/i.test(m)) {
      return 'Photo backend is not ready yet (missing function ' + fn + ').';
    }
    return m || 'Photo could not be saved.';
  }

  async function upload(type, id, file) {
    if (!TYPES[type]) throw new Error('Unknown photo type.');
    if (!(await init())) throw new Error('Please sign in again.');
    if (!file) throw new Error('No file selected.');
    if (OK_MIME.indexOf(file.type) < 0) throw new Error('Use a JPG, PNG or WebP image.');
    if (file.size > MAX_INPUT) throw new Error('Image is larger than 10 MB.');

    var img = await toJpeg(file);
    var safeId = String(id).replace(/[^A-Za-z0-9_-]/g, '_');
    var path = clientId + '/avatars/' + type + '/' + safeId + '-' + Date.now() + '.jpg';
    var old = photos[key(type, id)];

    var up = await sb.storage.from(BUCKET).upload(path, img.blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
    if (up.error) throw new Error(up.error.message || 'Upload failed.');

    var rpc = await sb.rpc(RPC_SET, {
      p_entity_type: type, p_entity_id: String(id), p_storage_path: path,
      p_mime_type: 'image/jpeg', p_size_bytes: img.blob.size, p_width_px: img.w, p_height_px: img.h
    });
    if (rpc.error) {
      await sb.storage.from(BUCKET).remove([path]).catch(function () { /* ignore */ });
      throw new Error(backendMessage(rpc.error, RPC_SET));
    }

    var signed = await signPaths([path]);
    photos[key(type, id)] = { path: path, url: signed[path] || URL.createObjectURL(img.blob) };
    if (old && old.path && old.path !== path) {
      sb.storage.from(BUCKET).remove([old.path]).catch(function () { /* ignore */ });
    }
    emit(type, id);
  }

  async function remove(type, id) {
    if (!(await init())) throw new Error('Please sign in again.');
    var old = photos[key(type, id)];
    var rpc = await sb.rpc(RPC_REMOVE, { p_entity_type: type, p_entity_id: String(id) });
    if (rpc.error) throw new Error(backendMessage(rpc.error, RPC_REMOVE));
    var p = (typeof rpc.data === 'string' && rpc.data) || (old && old.path);
    if (p) sb.storage.from(BUCKET).remove([p]).catch(function () { /* ignore */ });
    delete photos[key(type, id)];
    emit(type, id);
  }

  /* ---------- painting ---------- */
  var PROPS = ['background-image', 'color', 'font-size'];

  function paintEl(el, rule) {
    var id = rule.id ? rule.id(el) : null;
    if (!id) return;
    var type = typeof rule.type === 'function' ? rule.type(el) : rule.type;
    var u = url(type, id);

    if (u) {
      if (el.getAttribute('data-gp-url') !== u) {
        el.style.setProperty('background-image', 'url("' + u + '")', 'important');
        el.style.setProperty('color', 'transparent', 'important');
        el.style.setProperty('font-size', '0', 'important');
        el.setAttribute('data-gp-url', u);
        el.classList.add('gp-img');
      }
    } else if (el.hasAttribute('data-gp-url')) {
      PROPS.forEach(function (p) { el.style.removeProperty(p); });
      el.removeAttribute('data-gp-url');
      el.classList.remove('gp-img');
    }

    if (rule.edit) {
      el.classList.add('gp-edit');
      el.setAttribute('data-gp-type', type);
      el.setAttribute('data-gp-id', id);
      el.setAttribute('data-gp-name', rule.name ? (rule.name(el) || '') : '');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('title', 'Change ' + (TYPES[type] || 'photo').toLowerCase());
    }
  }

  function paintAll(root) {
    if (!loggedIn) return;
    rules.forEach(function (rule) {
      var list;
      try { list = (root || document).querySelectorAll(rule.sel); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (el) { paintEl(el, rule); });
    });
  }

  var timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { paintAll(); }, 40);
  }

  /* ---------- page rules ---------- */
  var ownerId = function () { return clientId; };
  var OWNER_VIEW = '#gasAvatar, #acctAv, #meAv, #topAv, [data-glime-owner-photo]';

  var BASE_RULES = [
    { sel: OWNER_VIEW, type: 'owner', id: ownerId },
    { sel: '#gasAvatar, [data-glime-owner-photo="edit"]', type: 'owner', id: ownerId, edit: true, name: function () { return 'Owner'; } },
    { sel: '[data-glime-business-logo]', type: 'business', id: ownerId },
    {
      sel: '[data-gp-type][data-gp-id]:not(.gp-edit)',
      type: function (el) { return el.getAttribute('data-gp-type'); },
      id: function (el) { return el.getAttribute('data-gp-id'); },
      edit: false
    }
  ];

  var PRESETS = {
    'follow-up.html': [
      { sel: '.lcard[data-lead] .av', type: 'lead', id: function (el) { return attr(el, '.lcard', 'data-lead'); } },
      { sel: '.tog-row .av', type: 'lead', id: function (el) { var i = el.closest('.tog-row'); i = i && i.querySelector('[data-toggle-lead]'); return i && i.getAttribute('data-toggle-lead'); } },
      {
        sel: '.row-card .av', type: 'lead',
        id: function (el) { var r = el.closest('.row-card'); var b = r && r.querySelector('[data-act="open"],[data-act="draft"]'); return b && b.getAttribute('data-id'); }
      },
      {
        sel: '.lp-person .av', type: 'lead', edit: true,
        id: function () { var c = q('.lcard.sel-on'); return c && c.getAttribute('data-lead'); },
        name: function () { return txt('.lp-person b'); }
      }
    ],
    'customer.html': [
      { sel: '.crow[data-id] .av', type: 'customer', id: function (el) { return attr(el, '.crow', 'data-id'); } },
      {
        sel: '#detail .av.lg', type: 'customer', edit: true,
        id: function () {
          var c = q('.crow.sel');
          return (c && c.getAttribute('data-id')) || new URLSearchParams(location.search).get('id');
        },
        name: function () { return txt('#detail h3'); }
      }
    ],
    'whatsapp-sales-specialist.html': [
      { sel: '.conv[data-id] .avatar', type: 'whatsapp_conversation', id: function (el) { return attr(el, '.conv', 'data-id'); } },
      {
        sel: '#avatar', type: 'whatsapp_conversation', edit: true,
        id: function () { var c = q('.conv.active'); return c && c.getAttribute('data-id'); },
        name: function () { return txt('#name'); }
      }
    ],
    'instagram-sales-specialist.html': [
      { sel: '.conversation-item[data-id] .avatar', type: 'instagram_conversation', id: function (el) { return attr(el, '.conversation-item', 'data-id'); } },
      {
        sel: '#avatar', type: 'instagram_conversation', edit: true,
        id: function () { var c = q('.conversation-item.active'); return c && c.getAttribute('data-id'); },
        name: function () { return txt('#name'); }
      }
    ]
  };

  function page() {
    var seg = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!seg) return 'index.html';
    return /\.[a-z0-9]+$/.test(seg) ? seg : seg + '.html';
  }
  rules = BASE_RULES.concat(PRESETS[page()] || []);

  function addRules(list) { rules = rules.concat(list || []); schedule(); }

  /* ---------- markup helper for templates ---------- */
  function avatarHtml(type, id, name, o) {
    o = o || {};
    var size = o.size || 40, u = url(type, id);
    var radius = type === 'business' ? Math.round(size * 0.28) + 'px' : '50%';
    var base = 'display:inline-flex;align-items:center;justify-content:center;flex:none;width:' + size + 'px;height:' + size + 'px;' +
      'border-radius:' + radius + ';font-weight:700;color:#fff;overflow:hidden;';
    if (u) {
      return '<span class="gp-avatar gp-img ' + esc(o.cls || '') + '" style="' + base + 'background:#0b141d url(&quot;' + esc(u) + '&quot;) center/cover no-repeat;font-size:0" aria-label="' + esc(name || '') + '"></span>';
    }
    return '<span class="gp-avatar ' + esc(o.cls || '') + '" style="' + base + 'background:linear-gradient(135deg,' + color(name || id) + ',#0b141d);font-size:' + Math.round(size * 0.38) + 'px">' + esc(initials(name)) + '</span>';
  }

  /* ---------- styles ---------- */
  var CAM = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23031014' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 8h3l2-3h6l2 3h3v11H4z'/%3E%3Ccircle cx='12' cy='13' r='3.5'/%3E%3C/svg%3E\")";
  var CSS =
    '.gp-img{background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}' +
    ':where(.gp-edit){position:relative;cursor:pointer}' +
    '.gp-edit::after{content:"";position:absolute;right:0;bottom:0;width:30%;height:30%;min-width:16px;min-height:16px;max-width:26px;max-height:26px;' +
    'border-radius:50%;background:#19e68c ' + CAM + ' center/62% no-repeat;border:2px solid rgba(7,16,22,.92);box-sizing:border-box;opacity:.95}' +
    '.gp-edit:hover::after,.gp-edit:focus-visible::after{opacity:1;transform:scale(1.08)}' +
    '.gp-edit:focus-visible{outline:2px solid #19e68c;outline-offset:2px}' +
    '.gp-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(3,8,12,.72);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)}' +
    '.gp-box{width:min(380px,100%);background:#101b29;color:#f4fbfd;border:1px solid rgba(184,222,234,.16);border-radius:20px;padding:22px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Inter,Manrope,Arial,sans-serif;text-align:center}' +
    '.gp-box h3{font-size:1.05rem;margin:0 0 4px}' +
    '.gp-box p{margin:0;color:#9cabb9;font-size:.76rem;line-height:1.5}' +
    '.gp-prev{width:150px;height:150px;border-radius:50%;margin:18px auto 14px;display:flex;align-items:center;justify-content:center;font-size:3rem;font-weight:800;color:#fff;background-size:cover;background-position:center;border:3px solid rgba(25,230,140,.5)}' +
    '.gp-prev.sq{border-radius:28px}' +
    '.gp-row{display:flex;gap:9px;justify-content:center;flex-wrap:wrap;margin-top:6px}' +
    '.gp-btn{border:1px solid rgba(184,222,234,.18);background:transparent;color:#f4fbfd;border-radius:11px;padding:10px 15px;font:inherit;font-size:.8rem;font-weight:700;cursor:pointer}' +
    '.gp-btn.pri{background:linear-gradient(105deg,#50f5a8,#52e8ff);color:#031014;border:0}' +
    '.gp-btn.bad{color:#ff8291;border-color:rgba(255,130,145,.4)}' +
    '.gp-btn:disabled{opacity:.5;cursor:default}' +
    '.gp-msg{min-height:18px;margin-top:12px;font-size:.74rem;color:#9cabb9}' +
    '.gp-msg.err{color:#ff8291}.gp-msg.ok{color:#50f5a8}';

  function injectStyle() {
    if (document.getElementById('gp-style')) return;
    var s = document.createElement('style'); s.id = 'gp-style'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ---------- dialog ---------- */
  var dlg = null;
  function closeDialog() { if (dlg) { dlg.remove(); dlg = null; document.removeEventListener('keydown', onEsc, true); } }
  function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); closeDialog(); } }

  async function pick(type, id, name) {
    if (!TYPES[type] || !id) return;
    injectStyle();
    closeDialog();
    var label = TYPES[type];
    var ok = await init();

    var overlay = document.createElement('div');
    overlay.className = 'gp-overlay';
    overlay.innerHTML =
      '<div class="gp-box" role="dialog" aria-modal="true" aria-label="' + esc(label) + '">' +
      '<h3>' + esc(label) + '</h3>' +
      '<p>' + esc(name || '') + (name ? ' · ' : '') + 'JPG, PNG or WebP, up to 10 MB. It is cropped to a square automatically.</p>' +
      '<div class="gp-prev' + (type === 'business' ? ' sq' : '') + '" id="gpPrev"></div>' +
      '<div class="gp-row"><button type="button" class="gp-btn pri" id="gpUp"></button>' +
      '<button type="button" class="gp-btn bad" id="gpRm">Remove</button>' +
      '<button type="button" class="gp-btn" id="gpClose">Close</button></div>' +
      '<div class="gp-msg" id="gpMsg" role="status"></div>' +
      '<input type="file" id="gpFile" accept="image/jpeg,image/png,image/webp" hidden></div>';
    document.body.appendChild(overlay);
    dlg = overlay;
    document.addEventListener('keydown', onEsc, true);

    var prev = overlay.querySelector('#gpPrev'), up = overlay.querySelector('#gpUp'), rm = overlay.querySelector('#gpRm');
    var msg = overlay.querySelector('#gpMsg'), file = overlay.querySelector('#gpFile');

    function setMsg(t, cls) { msg.textContent = t || ''; msg.className = 'gp-msg' + (cls ? ' ' + cls : ''); }
    function refresh() {
      var u = url(type, id);
      if (u) { prev.style.background = 'url("' + u + '") center/cover no-repeat'; prev.textContent = ''; }
      else { prev.style.background = 'linear-gradient(135deg,' + color(name || id) + ',#0b141d)'; prev.textContent = initials(name || label); }
      up.textContent = u ? 'Change photo' : 'Upload photo';
      rm.style.display = u ? '' : 'none';
    }
    refresh();

    if (!ok) { setMsg('Please sign in again to manage photos.', 'err'); up.disabled = true; rm.disabled = true; }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDialog(); });
    overlay.querySelector('#gpClose').addEventListener('click', closeDialog);
    up.addEventListener('click', function () { file.click(); });
    file.addEventListener('change', async function () {
      var f = file.files && file.files[0]; file.value = '';
      if (!f) return;
      up.disabled = rm.disabled = true; setMsg('Uploading…');
      try { await upload(type, id, f); refresh(); setMsg('Photo saved.', 'ok'); }
      catch (e) { setMsg(e.message || 'Photo could not be saved.', 'err'); }
      up.disabled = rm.disabled = false;
    });
    rm.addEventListener('click', async function () {
      if (!window.confirm('Remove this photo?')) return;
      up.disabled = rm.disabled = true; setMsg('Removing…');
      try { await remove(type, id); refresh(); setMsg('Photo removed.', 'ok'); }
      catch (e) { setMsg(e.message || 'Photo could not be removed.', 'err'); }
      up.disabled = rm.disabled = false;
    });
    up.focus();
  }

  /* ---------- boot ---------- */
  function start() {
    injectStyle();
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('.gp-edit');
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      pick(el.getAttribute('data-gp-type'), el.getAttribute('data-gp-id'), el.getAttribute('data-gp-name'));
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target.classList && e.target.classList.contains('gp-edit') ? e.target : null;
      if (!el) return;
      e.preventDefault(); e.stopPropagation();
      pick(el.getAttribute('data-gp-type'), el.getAttribute('data-gp-id'), el.getAttribute('data-gp-name'));
    }, true);

    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    init().then(function () { paintAll(); });
  }

  window.GlimePhoto = {
    version: 1,
    ready: init,
    url: url,
    has: has,
    pick: pick,
    upload: upload,
    remove: remove,
    avatarHtml: avatarHtml,
    apply: paintAll,
    addRules: addRules,
    on: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    clientId: function () { return clientId; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
