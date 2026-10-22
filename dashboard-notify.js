/*
 * GLIME notification centre (frontend only).
 *
 * Adds a bell with an unread badge, a notification list panel and the
 * "Alerts" on/off switch to the dashboard header (markup lives in dashboard.html:
 * #notifySwitchWrap / #notifyToggle). Uses the global `supabaseClient`.
 *
 * ---------------------------------------------------------------------------
 * BACKEND CONTRACT  (build this later - the frontend needs no change)
 *
 * Table  public.glime_notifications   (one row per recipient)
 *   id          uuid  primary key default gen_random_uuid()
 *   user_id     uuid  not null          -- auth.users.id of the recipient
 *   type        text  not null          -- whatsapp_message | instagram_message |
 *                                          admin | signup | contact_lead |
 *                                          billing | system   (unknown = generic)
 *   title       text  not null
 *   body        text                    -- message preview
 *   link_url    text                    -- optional: relative page or https URL
 *   data        jsonb                   -- optional: { "sender_name": "...", ... }
 *   read_at     timestamptz             -- null = unread
 *   created_at  timestamptz not null default now()
 *
 * RLS: SELECT and UPDATE (read_at) allowed where user_id = auth.uid().
 *      INSERT only from the server (service role / triggers / edge functions).
 * Realtime: add the table to the supabase_realtime publication.
 * Admin broadcast: insert one row per client with type = 'admin'.
 * Web push (later): the service worker can post
 *      { type: 'glime-notification', notification: <row> }
 *   to the page and it is added to the list (include the row `id` to avoid duplicates).
 *
 * Until the table exists the panel shows a "not connected yet" message.
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    var TABLE = 'glime_notifications';
    var COLUMNS = 'id,type,title,body,link_url,data,read_at,created_at';
    var PAGE_SIZE = 20;
    var MAX_ITEMS = 200;
    var POLL_MS = 60000;
    var ALERT_KEY = 'glime_notify_enabled';

    var TYPES = {
        whatsapp_message: { icon: '💬', label: 'WhatsApp', link: 'whatsapp-sales-specialist.html' },
        instagram_message: { icon: '📸', label: 'Instagram', link: 'instagram-sales-specialist.html' },
        admin: { icon: '📢', label: 'GLIME Team' },
        signup: { icon: '🆕', label: 'New sign up' },
        contact_lead: { icon: '📩', label: 'New enquiry' },
        billing: { icon: '💳', label: 'Billing', link: 'billing.html' },
        system: { icon: '🔔', label: 'Update' }
    };

    var state = {
        userId: null,
        items: [],
        byId: {},
        unread: 0,
        hasMore: false,
        status: 'idle', // idle | loading | ready | unavailable | error
        loadingMore: false,
        filter: 'all',
        open: false,
        realtimeOk: false,
        realtimeWasDown: false,
        channel: null,
        timer: null
    };

    var els = {};

    /* ---------- helpers ---------- */

    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text !== undefined && text !== null) { n.textContent = text; }
        return n;
    }

    function truncate(s, max) {
        s = String(s == null ? '' : s);
        return s.length > max ? s.slice(0, max - 1) + '…' : s;
    }

    function typeInfo(type) {
        return Object.prototype.hasOwnProperty.call(TYPES, type) ? TYPES[type] : TYPES.system;
    }

    function normalize(row) {
        var type = String(row.type || 'system');
        var info = typeInfo(type);
        return {
            id: String(row.id),
            type: type,
            title: truncate(row.title || info.label, 140),
            body: truncate(row.body || '', 500),
            link_url: row.link_url || null,
            data: row.data && typeof row.data === 'object' ? row.data : {},
            read_at: row.read_at || null,
            created_at: row.created_at || new Date().toISOString()
        };
    }

    function fmtTime(iso) {
        var t = Date.parse(iso);
        if (isNaN(t)) { return ''; }
        var s = Math.max(0, Math.floor((Date.now() - t) / 1000));
        if (s < 45) { return 'Just now'; }
        var m = Math.floor(s / 60);
        if (m < 60) { return m + 'm ago'; }
        var h = Math.floor(m / 60);
        if (h < 24) { return h + 'h ago'; }
        var d = Math.floor(h / 24);
        if (d < 7) { return d + 'd ago'; }
        var dt = new Date(t);
        var opts = { day: 'numeric', month: 'short' };
        if (dt.getFullYear() !== new Date().getFullYear()) { opts.year = 'numeric'; }
        return dt.toLocaleDateString('en-IN', opts);
    }

    function safeLink(item) {
        var raw = item.link_url || (item.data && item.data.link) || typeInfo(item.type).link;
        if (!raw) { return null; }
        try {
            var u = new URL(String(raw), window.location.href);
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
        } catch (_) {
            return null;
        }
    }

    function isMissingTable(err) {
        var code = (err && err.code) || '';
        var msg = String((err && err.message) || '').toLowerCase();
        return code === 'PGRST205' || code === '42P01' || code === '42501' ||
            msg.indexOf('does not exist') > -1 ||
            msg.indexOf('schema cache') > -1 ||
            msg.indexOf('could not find the table') > -1;
    }

    function isLocalOnly(item) {
        return String(item.id).indexOf('push-') === 0;
    }

    /* ---------- styles ---------- */

    function injectStyles() {
        var css = '' +
            '.notify-switch{display:inline-flex;align-items:center;gap:10px;cursor:pointer;user-select:none;font-size:.78rem;font-weight:600;color:var(--muted,#9ca3af)}' +
            '.notify-switch input{position:absolute;opacity:0;width:0;height:0}' +
            '.notify-slider{position:relative;width:38px;height:22px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid var(--border,rgba(255,255,255,.07));transition:.2s;flex-shrink:0}' +
            '.notify-slider::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}' +
            '.notify-switch input:checked + .notify-slider{background:linear-gradient(135deg,var(--green,#00ff88),var(--cyan,#00f0ff));border-color:transparent}' +
            '.notify-switch input:checked + .notify-slider::after{transform:translateX(16px);background:#061018}' +
            '.notify-switch input:focus-visible + .notify-slider{outline:2px solid var(--cyan,#00f0ff);outline-offset:2px}' +
            '.notify-switch.is-on .notify-switch-label{color:var(--green,#00ff88)}' +

            '.notify-row{position:relative;display:flex;align-items:center;justify-content:flex-end;gap:14px;margin-bottom:10px}' +
            '.notify-bell{position:relative;width:40px;height:40px;border-radius:12px;border:1px solid var(--border,rgba(255,255,255,.07));background:rgba(255,255,255,.06);color:var(--text,#fff);font-size:1.05rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:.2s;padding:0}' +
            '.notify-bell:hover,.notify-bell[aria-expanded="true"]{background:rgba(0,240,255,.1);border-color:rgba(0,240,255,.3)}' +
            '.notify-bell:focus-visible{outline:2px solid var(--cyan,#00f0ff);outline-offset:2px}' +
            '.notify-badge{position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:var(--danger,#ff4757);color:#fff;font-size:.65rem;font-weight:700;display:none;align-items:center;justify-content:center;line-height:1}' +
            '.notify-badge.show{display:inline-flex}' +

            '.notify-panel{position:absolute;top:calc(100% + 8px);right:0;width:380px;max-width:calc(100vw - 24px);max-height:min(560px,75vh);display:none;flex-direction:column;background:var(--card,#111827);border:1px solid var(--border,rgba(255,255,255,.07));border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:3000;text-align:left;overflow:hidden;outline:none}' +
            '.notify-panel.open{display:flex}' +
            '.notify-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border,rgba(255,255,255,.07))}' +
            '.notify-head h3{margin:0;font-size:.95rem}' +
            '.notify-link-btn{background:none;border:0;color:var(--cyan,#00f0ff);font-size:.75rem;font-weight:700;cursor:pointer;padding:4px 6px;border-radius:6px}' +
            '.notify-link-btn:disabled{color:var(--muted,#9ca3af);cursor:default;opacity:.6}' +
            '.notify-link-btn:focus-visible,.notify-tab:focus-visible,.notify-item:focus-visible{outline:2px solid var(--cyan,#00f0ff);outline-offset:2px}' +
            '.notify-tabs{display:flex;gap:6px;padding:10px 16px 0}' +
            '.notify-tab{border:1px solid var(--border,rgba(255,255,255,.07));background:transparent;color:var(--muted,#9ca3af);padding:5px 12px;border-radius:999px;font-size:.74rem;font-weight:600;cursor:pointer}' +
            '.notify-tab[aria-selected="true"]{color:#061018;background:linear-gradient(135deg,var(--green,#00ff88),var(--cyan,#00f0ff));border-color:transparent}' +
            '.notify-list{list-style:none;margin:0;padding:8px;overflow-y:auto;flex:1 1 auto;overscroll-behavior:contain}' +
            '.notify-item{position:relative;display:flex;gap:11px;width:100%;text-align:left;padding:11px 10px;border-radius:12px;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit}' +
            '.notify-item:hover{background:rgba(255,255,255,.05)}' +
            '.notify-item.unread{background:rgba(0,240,255,.06)}' +
            '.notify-item[data-type="admin"]{box-shadow:inset 3px 0 0 var(--green,#00ff88)}' +
            '.notify-ico{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.07);display:inline-flex;align-items:center;justify-content:center;font-size:1rem;flex-shrink:0}' +
            '.notify-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}' +
            '.notify-meta{display:flex;justify-content:space-between;gap:8px;font-size:.68rem;color:var(--muted,#9ca3af)}' +
            '.notify-tag{font-weight:700;letter-spacing:.3px;text-transform:uppercase;color:var(--cyan,#00f0ff);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '.notify-time{white-space:nowrap;flex-shrink:0}' +
            '.notify-title{font-size:.84rem;font-weight:600;overflow-wrap:anywhere}' +
            '.notify-body{font-size:.78rem;color:var(--muted,#9ca3af);line-height:1.45;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
            '.notify-dot{width:8px;height:8px;border-radius:50%;background:var(--green,#00ff88);flex-shrink:0;margin-top:6px}' +
            '.notify-state{padding:26px 20px;text-align:center;color:var(--muted,#9ca3af);font-size:.8rem;line-height:1.6}' +
            '.notify-foot{display:flex;justify-content:center;padding:6px 8px 10px;border-top:1px solid var(--border,rgba(255,255,255,.07))}' +
            '.notify-foot[hidden],.notify-state[hidden],.notify-foot .notify-link-btn[hidden]{display:none}' +
            '.notify-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +

            '#glimeToastHost{position:fixed;right:16px;bottom:16px;z-index:8000;display:flex;flex-direction:column;gap:10px;max-width:min(360px,calc(100vw - 32px))}' +
            '.glime-toast{background:var(--card,#111827);border:1px solid rgba(0,255,136,.3);border-radius:12px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);color:var(--text,#fff);animation:glimeToastIn .25s ease;cursor:pointer}' +
            '.glime-toast strong{display:block;font-size:.85rem;margin-bottom:3px;overflow-wrap:anywhere}' +
            '.glime-toast span{display:block;font-size:.78rem;color:var(--muted,#9ca3af);line-height:1.5;overflow-wrap:anywhere}' +
            '@keyframes glimeToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
            '@media (prefers-reduced-motion:reduce){.glime-toast{animation:none}.notify-slider,.notify-slider::after,.notify-bell{transition:none}}' +
            '@media (max-width:900px){.notify-row{justify-content:flex-start}}' +
            '@media (max-width:640px){.notify-panel{position:fixed;left:12px;right:12px;top:auto;bottom:12px;width:auto;max-width:none;max-height:78vh}}';

        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---------- toast + alerts ---------- */

    function toast(title, message, onClick) {
        var host = document.getElementById('glimeToastHost');

        if (!host) {
            host = el('div');
            host.id = 'glimeToastHost';
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }

        var box = el('div', 'glime-toast');
        box.appendChild(el('strong', null, title));
        if (message) { box.appendChild(el('span', null, message)); }

        var timer = setTimeout(function () { box.remove(); }, message && message.length > 90 ? 11000 : 6000);

        box.addEventListener('click', function () {
            clearTimeout(timer);
            box.remove();
            if (onClick) { onClick(); }
        });

        host.appendChild(box);
    }

    function alertsEnabled() {
        try { return localStorage.getItem(ALERT_KEY) === '1'; } catch (_) { return false; }
    }

    function pushStatus() {
        try {
            if (window.GlimePush && typeof window.GlimePush.status === 'function') {
                return window.GlimePush.status();
            }
        } catch (_) {}
        return Promise.resolve('off');
    }

    function hasSavedChoice() {
        try { return localStorage.getItem(ALERT_KEY) !== null; } catch (_) { return true; }
    }

    function systemNotify(item, body) {
        var link = safeLink(item);
        var url = link && link.origin === window.location.origin
            ? link.pathname + link.search + link.hash
            : '/dashboard.html';
        var opts = { body: body, icon: '/glime_logo_clean.svg', tag: 'glime-' + item.id, data: { url: url } };

        function viaConstructor() {
            var n = new Notification(item.title, opts);
            n.onclick = function () { window.focus(); openPanel(); n.close(); };
        }

        if ('serviceWorker' in navigator) {
            return navigator.serviceWorker.getRegistration('/').then(function (reg) {
                if (reg && typeof reg.showNotification === 'function') {
                    return reg.showNotification(item.title, opts);
                }
                viaConstructor();
            });
        }
        try { viaConstructor(); } catch (e) { return Promise.reject(e); }
        return Promise.resolve();
    }

    function alertUser(item) {
        if (!alertsEnabled()) { return; }
        var body = truncate(item.body, 140);

        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
            pushStatus().then(function (s) {
                var covered = s === 'on' && (item.type === 'whatsapp_message' ||
                    item.type === 'instagram_message' || item.type === 'admin');
                if (covered) { return; }
                return systemNotify(item, body);
            }).catch(function (error) {
                console.warn('Browser notification failed:', error);
                toast(item.title, body, openPanel);
            });
            return;
        }
        toast(item.title, body, openPanel);
    }

    function alertMany(items) {
        if (!items.length) { return; }
        if (items.length > 3) {
            if (alertsEnabled()) {
                toast(items.length + ' new notifications', 'Tap to view them.', openPanel);
            }
            return;
        }
        items.forEach(alertUser);
    }

    /* ---------- data ---------- */

    function fetchPage(beforeIso) {
        var q = supabaseClient
            .from(TABLE)
            .select(COLUMNS)
            .eq('user_id', state.userId)
            .order('created_at', { ascending: false })
            .limit(PAGE_SIZE + 1);

        if (beforeIso) { q = q.lt('created_at', beforeIso); }
        return q;
    }

    function countUnread() {
        return supabaseClient
            .from(TABLE)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', state.userId)
            .is('read_at', null)
            .then(function (r) { return r.error ? null : (r.count || 0); });
    }

    function sortItems() {
        state.items.sort(function (a, b) {
            return Date.parse(b.created_at) - Date.parse(a.created_at);
        });
    }

    function mergeRows(rows) {
        var added = [];

        rows.forEach(function (row) {
            if (row.id === undefined || row.id === null) { return; }
            var n = normalize(row);
            var cur = state.byId[n.id];

            if (cur) {
                cur.read_at = n.read_at;
                cur.title = n.title;
                cur.body = n.body;
            } else {
                state.byId[n.id] = n;
                state.items.push(n);
                added.push(n);
            }
        });

        sortItems();

        while (state.items.length > MAX_ITEMS) {
            var dropped = state.items.pop();
            delete state.byId[dropped.id];
            state.hasMore = true;
        }

        return added;
    }

    function recountLocal() {
        return state.items.filter(function (i) { return !i.read_at; }).length;
    }

    async function loadInitial() {
        if (!state.userId || state.status === 'loading') { return; }

        state.status = 'loading';
        render();

        try {
            var results = await Promise.all([fetchPage(null), countUnread()]);
            var res = results[0];

            if (res.error) {
                state.status = isMissingTable(res.error) ? 'unavailable' : 'error';
                if (state.status === 'error') { console.warn('Notifications load failed:', res.error); }
                render();
                return;
            }

            var rows = res.data || [];
            state.items = [];
            state.byId = {};
            state.hasMore = rows.length > PAGE_SIZE;
            mergeRows(rows.slice(0, PAGE_SIZE));
            state.unread = results[1] === null ? recountLocal() : results[1];
            state.status = 'ready';
            startRealtime();
            render();
        } catch (error) {
            console.warn('Notifications load failed:', error);
            state.status = 'error';
            render();
        }
    }

    async function loadMore() {
        if (state.loadingMore || !state.hasMore || !state.items.length) { return; }

        state.loadingMore = true;
        render();

        try {
            var oldest = state.items[state.items.length - 1];
            var res = await fetchPage(oldest.created_at);

            if (res.error) { throw res.error; }

            var rows = res.data || [];
            state.hasMore = rows.length > PAGE_SIZE;
            mergeRows(rows.slice(0, PAGE_SIZE));
        } catch (error) {
            console.warn('Older notifications failed:', error);
            toast('Could not load older notifications', 'Please try again.');
        }

        state.loadingMore = false;
        render();
    }

    async function refresh() {
        if (!state.userId || state.status !== 'ready') { return; }

        try {
            var results = await Promise.all([fetchPage(null), countUnread()]);
            if (results[0].error) { return; }

            var added = mergeRows((results[0].data || []).slice(0, PAGE_SIZE));
            state.unread = results[1] === null ? recountLocal() : results[1];
            render();
            alertMany(added.filter(function (i) { return !i.read_at; }));
        } catch (error) {
            console.warn('Notifications refresh failed:', error);
        }
    }

    /* ---------- realtime ---------- */

    function startRealtime() {
        if (state.channel || !state.userId) { return; }

        try {
            var filter = 'user_id=eq.' + state.userId;

            state.channel = supabaseClient
                .channel('glime-notifications-' + state.userId)
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: TABLE, filter: filter }, onInsert)
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: TABLE, filter: filter }, onUpdate)
                .subscribe(function (status) {
                    var ok = status === 'SUBSCRIBED';

                    if (ok && state.realtimeWasDown) {
                        state.realtimeWasDown = false;
                        refresh();
                    }
                    if (!ok && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')) {
                        state.realtimeWasDown = true;
                    }
                    state.realtimeOk = ok;
                });
        } catch (error) {
            console.warn('Notification realtime failed:', error);
            state.channel = null;
        }
    }

    function stopRealtime() {
        if (!state.channel) { return; }
        try { supabaseClient.removeChannel(state.channel); } catch (_) {}
        state.channel = null;
        state.realtimeOk = false;
    }

    function onInsert(payload) {
        addItem(payload && payload.new, true);
    }

    function onUpdate(payload) {
        var row = payload && payload.new;
        if (!row || row.id === undefined) { return; }

        var cur = state.byId[String(row.id)];

        if (!cur) {
            countUnread().then(function (c) {
                if (c !== null) { state.unread = c; render(); }
            });
            return;
        }

        var wasUnread = !cur.read_at;
        var n = normalize(row);
        cur.read_at = n.read_at;
        cur.title = n.title;
        cur.body = n.body;

        if (wasUnread && cur.read_at) { state.unread = Math.max(0, state.unread - 1); }
        if (!wasUnread && !cur.read_at) { state.unread += 1; }
        render();
    }

    function addItem(row, withAlert) {
        if (!row) { return null; }
        if (row.id === undefined || row.id === null) {
            row.id = 'push-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        }
        if (state.byId[String(row.id)]) { return null; }

        var added = mergeRows([row]);
        var item = added[0];
        if (!item) { return null; }

        if (!item.read_at) { state.unread += 1; }
        render();
        if (withAlert && !item.read_at) { alertUser(item); }
        return item;
    }

    /* ---------- actions ---------- */

    async function markRead(item) {
        if (item.read_at) { return; }

        var prev = item.read_at;
        item.read_at = new Date().toISOString();
        state.unread = Math.max(0, state.unread - 1);
        render();

        if (isLocalOnly(item)) { return; }

        var res = await supabaseClient
            .from(TABLE)
            .update({ read_at: item.read_at })
            .eq('id', item.id)
            .eq('user_id', state.userId)
            .is('read_at', null);

        if (res.error) {
            item.read_at = prev;
            state.unread += 1;
            render();
            toast('Could not update', 'Please try again.');
        }
    }

    async function markAllRead() {
        var targets = state.items.filter(function (i) { return !i.read_at; });
        if (!targets.length && state.unread === 0) { return; }

        var prevUnread = state.unread;
        var stamp = new Date().toISOString();

        targets.forEach(function (i) { i.read_at = stamp; });
        state.unread = 0;
        render();

        var res = await supabaseClient
            .from(TABLE)
            .update({ read_at: stamp })
            .eq('user_id', state.userId)
            .is('read_at', null);

        if (res.error) {
            targets.forEach(function (i) { i.read_at = null; });
            state.unread = prevUnread;
            render();
            toast('Could not mark all as read', 'Please try again.');
        }
    }

    function onItemClick(item) {
        markRead(item);

        var url = safeLink(item);
        closePanel(false);

        if (!url) { return; }

        if (url.origin === window.location.origin) {
            window.location.href = url.href;
        } else {
            window.open(url.href, '_blank', 'noopener');
        }
    }

    /* ---------- UI ---------- */

    function buildItem(item) {
        var info = typeInfo(item.type);
        var li = el('li');
        var btn = el('button', 'notify-item' + (item.read_at ? '' : ' unread'));
        btn.type = 'button';
        btn.setAttribute('data-type', item.type);

        var ico = el('span', 'notify-ico', info.icon);
        ico.setAttribute('aria-hidden', 'true');

        var main = el('span', 'notify-main');
        var meta = el('span', 'notify-meta');
        var sender = item.data && typeof item.data.sender_name === 'string' ? item.data.sender_name.trim() : '';
        meta.appendChild(el('span', 'notify-tag', info.label + (sender ? ' · ' + truncate(sender, 30) : '')));

        var time = el('time', 'notify-time', fmtTime(item.created_at));
        time.title = new Date(item.created_at).toLocaleString();
        meta.appendChild(time);

        main.appendChild(meta);
        if (!item.read_at) { main.appendChild(el('span', 'notify-sr', 'Unread. ')); }
        main.appendChild(el('span', 'notify-title', item.title));
        if (item.body) { main.appendChild(el('span', 'notify-body', item.body)); }

        btn.appendChild(ico);
        btn.appendChild(main);

        if (!item.read_at) {
            var dot = el('span', 'notify-dot');
            dot.setAttribute('aria-hidden', 'true');
            btn.appendChild(dot);
        }

        btn.addEventListener('click', function () { onItemClick(item); });
        li.appendChild(btn);
        return li;
    }

    function updateBadge() {
        var n = state.unread;
        els.badge.textContent = n > 99 ? '99+' : String(n);
        els.badge.classList.toggle('show', n > 0);
        els.bell.setAttribute('aria-label', n > 0 ? 'Notifications, ' + n + ' unread' : 'Notifications');
    }

    function render() {
        if (!els.list) { return; }

        updateBadge();

        var shown = state.items.filter(function (i) {
            return state.filter === 'all' || !i.read_at;
        });

        var top = els.list.scrollTop;
        els.list.textContent = '';
        shown.forEach(function (i) { els.list.appendChild(buildItem(i)); });
        els.list.scrollTop = top;

        els.markAll.disabled = state.unread === 0;

        var msg = '';
        var retry = false;

        if ((state.status === 'idle' || state.status === 'loading') && !state.items.length) {
            msg = 'Loading notifications…';
        } else if (state.status === 'unavailable') {
            msg = 'Notifications are not connected yet. They will show up here automatically once they are switched on for your account.';
        } else if (state.status === 'error') {
            msg = 'Could not load notifications.';
            retry = true;
        } else if (!shown.length) {
            msg = state.filter === 'unread'
                ? 'You are all caught up.'
                : 'No notifications yet. New WhatsApp and Instagram messages and updates from GLIME will appear here.';
        }

        els.state.textContent = msg;
        els.state.hidden = !msg;
        els.retry.hidden = !retry;

        var showMore = state.status === 'ready' && state.hasMore;
        els.more.hidden = !showMore;
        els.more.disabled = state.loadingMore;
        els.more.textContent = state.loadingMore ? 'Loading…' : 'Load older';
        els.foot.hidden = !(showMore || retry);
    }

    function setFilter(filter) {
        state.filter = filter;
        els.tabAll.setAttribute('aria-selected', filter === 'all' ? 'true' : 'false');
        els.tabUnread.setAttribute('aria-selected', filter === 'unread' ? 'true' : 'false');
        render();
    }

    function openPanel() {
        if (state.open || !els.panel) { return; }

        state.open = true;
        els.panel.classList.add('open');
        els.bell.setAttribute('aria-expanded', 'true');
        render();

        if (state.userId) {
            if (state.status === 'ready') {
                refresh();
            } else if (state.status !== 'loading') {
                loadInitial();
            }
        }

        els.panel.focus();
    }

    function closePanel(returnFocus) {
        if (!state.open) { return; }

        state.open = false;
        els.panel.classList.remove('open');
        els.bell.setAttribute('aria-expanded', 'false');
        if (returnFocus) { els.bell.focus(); }
    }

    function buildUI() {
        var toggle = document.getElementById('notifyToggle');
        var wrap = document.getElementById('notifySwitchWrap');
        if (!toggle || !wrap || !wrap.parentNode) { return false; }

        var row = wrap.parentNode;
        row.className = (row.className + ' notify-row').trim();

        var label = wrap.querySelector('.notify-switch-label');
        if (label) { label.textContent = 'Alerts'; }
        wrap.title = 'Pop-up and browser alerts when a new notification arrives';
        toggle.setAttribute('aria-label', 'Turn pop-up alerts for new notifications on or off');

        var bell = el('button', 'notify-bell');
        bell.type = 'button';
        bell.id = 'notifyBell';
        bell.setAttribute('aria-label', 'Notifications');
        bell.setAttribute('aria-haspopup', 'dialog');
        bell.setAttribute('aria-expanded', 'false');
        bell.setAttribute('aria-controls', 'notifyPanel');

        var bellIcon = el('span', null, '🔔');
        bellIcon.setAttribute('aria-hidden', 'true');
        var badge = el('span', 'notify-badge', '0');
        bell.appendChild(bellIcon);
        bell.appendChild(badge);

        var panel = el('div', 'notify-panel');
        panel.id = 'notifyPanel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Notifications');
        panel.tabIndex = -1;

        var head = el('div', 'notify-head');
        head.appendChild(el('h3', null, 'Notifications'));
        var markAll = el('button', 'notify-link-btn', 'Mark all as read');
        markAll.type = 'button';
        markAll.disabled = true;
        head.appendChild(markAll);

        var tabs = el('div', 'notify-tabs');
        tabs.setAttribute('role', 'tablist');
        var tabAll = el('button', 'notify-tab', 'All');
        var tabUnread = el('button', 'notify-tab', 'Unread');
        tabAll.type = 'button';
        tabUnread.type = 'button';
        tabAll.setAttribute('role', 'tab');
        tabUnread.setAttribute('role', 'tab');
        tabAll.setAttribute('aria-selected', 'true');
        tabUnread.setAttribute('aria-selected', 'false');
        tabs.appendChild(tabAll);
        tabs.appendChild(tabUnread);

        var list = el('ul', 'notify-list');
        var stateBox = el('div', 'notify-state');
        stateBox.setAttribute('role', 'status');

        var foot = el('div', 'notify-foot');
        var more = el('button', 'notify-link-btn', 'Load older');
        more.type = 'button';
        var retry = el('button', 'notify-link-btn', 'Try again');
        retry.type = 'button';
        retry.hidden = true;
        foot.appendChild(more);
        foot.appendChild(retry);

        panel.appendChild(head);
        panel.appendChild(tabs);
        panel.appendChild(list);
        panel.appendChild(stateBox);
        panel.appendChild(foot);

        row.insertBefore(bell, wrap);
        row.appendChild(panel);

        els = {
            row: row, toggle: toggle, wrap: wrap, bell: bell, badge: badge, panel: panel,
            list: list, state: stateBox, foot: foot, more: more, retry: retry,
            markAll: markAll, tabAll: tabAll, tabUnread: tabUnread
        };

        bell.addEventListener('click', function () {
            if (state.open) { closePanel(false); } else { openPanel(); }
        });
        markAll.addEventListener('click', markAllRead);
        more.addEventListener('click', loadMore);
        retry.addEventListener('click', loadInitial);
        tabAll.addEventListener('click', function () { setFilter('all'); });
        tabUnread.addEventListener('click', function () { setFilter('unread'); });

        document.addEventListener('click', function (e) {
            if (state.open && !row.contains(e.target)) { closePanel(false); }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && state.open) { closePanel(true); }
        });

        return true;
    }

    /* ---------- alert switch ---------- */

    function paintSwitch(on) {
        els.toggle.checked = on;
        els.wrap.classList.toggle('is-on', on);
    }

    function saveSwitch(on) {
        try { localStorage.setItem(ALERT_KEY, on ? '1' : '0'); } catch (_) {}
    }

    function requestPermission(cb) {
        try {
            var r = Notification.requestPermission(cb);
            if (r && typeof r.then === 'function') { r.then(cb); }
        } catch (_) {
            cb('denied');
        }
    }

    function failMessage(reason) {
        if (reason === 'blocked') {
            return 'Notifications are blocked for glime.online in this browser. Tap the lock icon next to the address bar, open Permissions, set Notifications to Allow, then switch Alerts on again. Until then alerts show on this page only.';
        }
        if (reason === 'unsupported') {
            return 'This browser cannot show phone notifications, so alerts will show on this page only. Please open GLIME in Chrome (Android) or add it to the Home Screen (iPhone).';
        }
        if (reason === 'dismissed') {
            return 'Notification permission was not given, so alerts will show on this page only. Switch Alerts on again and tap Allow.';
        }
        if (reason === 'signed-out') {
            return 'Please sign in again, then switch Alerts on.';
        }
        return 'Could not connect phone notifications right now. Alerts will show on this page only. Please try again.';
    }

    function bindSwitch() {
        paintSwitch(alertsEnabled());

        setTimeout(function () {
            if (hasSavedChoice()) { return; }
            pushStatus().then(function (s) {
                if (s === 'on' && !hasSavedChoice()) { saveSwitch(true); paintSwitch(true); }
            });
        }, 3500);

        els.toggle.addEventListener('change', function () {
            var on = els.toggle.checked;
            saveSwitch(on);
            paintSwitch(on);

            if (!on) {
                try {
                    if (window.GlimePush && typeof window.GlimePush.disable === 'function') {
                        window.GlimePush.disable();
                    }
                } catch (_) {}
                toast('Alerts off', 'Phone and browser alerts are off. New notifications will only appear in the bell.');
                return;
            }

            var good = 'You will get WhatsApp and Instagram message alerts on this phone, even when the website is closed.';

            if (window.GlimePush && typeof window.GlimePush.enable === 'function') {
                window.GlimePush.enable().then(function (r) {
                    toast('Alerts on', r && r.ok ? good : failMessage(r && r.reason));
                }).catch(function () {
                    toast('Alerts on', failMessage('error'));
                });
                return;
            }

            if (!('Notification' in window)) {
                toast('Alerts on', failMessage('unsupported'));
            } else if (Notification.permission === 'default') {
                requestPermission(function (result) {
                    toast('Alerts on', result === 'granted' ? good : failMessage(result === 'denied' ? 'blocked' : 'dismissed'));
                });
            } else {
                toast('Alerts on', Notification.permission === 'granted' ? good : failMessage('blocked'));
            }
        });
    }

    /* ---------- init ---------- */

    function init() {
        if (typeof supabaseClient === 'undefined') { return; }

        injectStyles();
        if (!buildUI()) { return; }

        bindSwitch();
        render();

        supabaseClient.auth.getSession().then(function (r) {
            var session = r && r.data && r.data.session;
            if (!session || !session.user) { return; }
            state.userId = session.user.id;
            loadInitial();
        });

        state.timer = setInterval(function () {
            if (document.hidden) { return; }
            if (state.open) { render(); }
            if (state.status === 'ready' && !state.realtimeOk) { refresh(); }
        }, POLL_MS);

        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) { refresh(); }
        });
        window.addEventListener('online', refresh);
        window.addEventListener('pagehide', stopRealtime);

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', function (e) {
                var d = e && e.data;
                if (d && d.type === 'glime-notification' && d.notification) {
                    addItem(d.notification, true);
                }
            });
        }

        window.GlimeNotifications = {
            open: openPanel,
            close: function () { closePanel(false); },
            refresh: refresh,
            add: function (row) { return addItem(row, true); },
            unread: function () { return state.unread; }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
