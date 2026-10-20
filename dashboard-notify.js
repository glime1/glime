/*
 * GLIME dashboard notification switch (frontend only).
 * - Small on/off switch in the dashboard header (#notifyToggle).
 * - When ON, new sign-ups (and any source added to NOTIFY_SOURCES)
 *   show an in-page toast and a browser notification.
 * - The ON/OFF choice is remembered in this browser (localStorage).
 * Uses the global `supabaseClient` created in dashboard.html.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'glime_notify_enabled';
    var channel = null;

    /*
     * Events that trigger a notification.
     * Add another { table, title, body } item here to notify on more events.
     */
    var NOTIFY_SOURCES = [
        {
            table: 'client_data',
            title: 'New sign up',
            body: function (row) {
                var who = row.business_name || row.full_name || row.name || row.client_name || 'A new client';
                return row.email ? who + ' (' + row.email + ') just signed up.' : who + ' just signed up.';
            }
        }
    ];

    function injectStyles() {
        var css = '' +
            '.notify-switch{display:inline-flex;align-items:center;gap:10px;margin-bottom:10px;cursor:pointer;user-select:none;font-size:.78rem;font-weight:600;color:var(--muted,#9ca3af)}' +
            '.notify-switch input{position:absolute;opacity:0;width:0;height:0}' +
            '.notify-slider{position:relative;width:38px;height:22px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid var(--border,rgba(255,255,255,.07));transition:.2s;flex-shrink:0}' +
            '.notify-slider::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s}' +
            '.notify-switch input:checked + .notify-slider{background:linear-gradient(135deg,var(--green,#00ff88),var(--cyan,#00f0ff));border-color:transparent}' +
            '.notify-switch input:checked + .notify-slider::after{transform:translateX(16px);background:#061018}' +
            '.notify-switch input:focus-visible + .notify-slider{outline:2px solid var(--cyan,#00f0ff);outline-offset:2px}' +
            '.notify-switch.is-on .notify-switch-label{color:var(--green,#00ff88)}' +
            '#glimeToastHost{position:fixed;right:16px;bottom:16px;z-index:8000;display:flex;flex-direction:column;gap:10px;max-width:min(360px,calc(100vw - 32px))}' +
            '.glime-toast{background:var(--card,#111827);border:1px solid rgba(0,255,136,.3);border-radius:12px;padding:12px 14px;box-shadow:0 10px 30px rgba(0,0,0,.45);color:var(--text,#fff);animation:glimeToastIn .25s ease}' +
            '.glime-toast strong{display:block;font-size:.85rem;margin-bottom:3px}' +
            '.glime-toast span{display:block;font-size:.78rem;color:var(--muted,#9ca3af);line-height:1.5;overflow-wrap:anywhere}' +
            '@keyframes glimeToastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';

        var style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function toast(title, message) {
        var host = document.getElementById('glimeToastHost');

        if (!host) {
            host = document.createElement('div');
            host.id = 'glimeToastHost';
            host.setAttribute('aria-live', 'polite');
            document.body.appendChild(host);
        }

        var box = document.createElement('div');
        box.className = 'glime-toast';

        var t = document.createElement('strong');
        t.textContent = title;

        var m = document.createElement('span');
        m.textContent = message;

        box.appendChild(t);
        box.appendChild(m);
        host.appendChild(box);

        setTimeout(function () {
            box.remove();
        }, 6000);
    }

    function notify(title, message) {
        toast(title, message);

        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, {
                    body: message,
                    icon: 'glime_logo_clean.svg'
                });
            }
        } catch (error) {
            console.warn('Browser notification failed:', error);
        }
    }

    function startListening() {
        if (channel || typeof supabaseClient === 'undefined') {
            return;
        }

        try {
            channel = supabaseClient.channel('glime-dashboard-notify');

            NOTIFY_SOURCES.forEach(function (source) {
                channel.on(
                    'postgres_changes',
                    { event: 'INSERT', schema: 'public', table: source.table },
                    function (payload) {
                        notify(source.title, source.body(payload.new || {}));
                    }
                );
            });

            channel.subscribe();
        } catch (error) {
            console.warn('Notification listener failed:', error);
            channel = null;
        }
    }

    function stopListening() {
        if (!channel) {
            return;
        }

        try {
            supabaseClient.removeChannel(channel);
        } catch (error) {
            console.warn('Notification listener stop failed:', error);
        }

        channel = null;
    }

    function saveState(on) {
        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (_) {}
    }

    function loadState() {
        try {
            return localStorage.getItem(STORAGE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function paint(toggle, on) {
        toggle.checked = on;

        var wrap = document.getElementById('notifySwitchWrap');

        if (wrap) {
            wrap.classList.toggle('is-on', on);
        }
    }

    function init() {
        var toggle = document.getElementById('notifyToggle');

        if (!toggle) {
            return;
        }

        injectStyles();

        var on = loadState();
        paint(toggle, on);

        if (on) {
            startListening();
        }

        toggle.addEventListener('change', function () {
            var enable = toggle.checked;

            saveState(enable);
            paint(toggle, enable);

            if (!enable) {
                stopListening();
                toast('Notifications off', 'You will not get sign-up alerts.');
                return;
            }

            startListening();

            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission().then(function (result) {
                    if (result === 'granted') {
                        toast('Notifications on', 'You will be alerted when someone signs up.');
                    } else {
                        toast('Notifications on', 'Browser alerts are blocked, so you will see alerts on this page only.');
                    }
                });
            } else if ('Notification' in window && Notification.permission === 'denied') {
                toast('Notifications on', 'Browser alerts are blocked, so you will see alerts on this page only.');
            } else {
                toast('Notifications on', 'You will be alerted when someone signs up.');
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
