/* GLIME lightweight website analytics — Phase 2 */
(() => {
  'use strict';

  const ENDPOINT =
    'https://ufoulgbiqgjriwapuopc.supabase.co/functions/v1/website-analytics';

  const VISITOR_KEY = 'glime_visitor_id';
  const SESSION_KEY = 'glime_analytics_session';

  const HEARTBEAT_MS = 30000;
  const SESSION_IDLE_MS = 30 * 60 * 1000;

  function uuid() {
    if (window.crypto && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
      /[xy]/g,
      function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x'
          ? r
          : (r & 3 | 8);

        return v.toString(16);
      }
    );
  }

  function getVisitorId() {
    let id = localStorage.getItem(VISITOR_KEY);

    if (!id) {
      id = uuid();
      localStorage.setItem(VISITOR_KEY, id);
    }

    return id;
  }

  function getSession() {
    const now = Date.now();
    let session = null;

    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      session = raw ? JSON.parse(raw) : null;
    } catch (_) {
      session = null;
    }

    if (
      !session ||
      !session.id ||
      now - Number(session.last_activity || 0) > SESSION_IDLE_MS
    ) {
      session = {
        id: uuid(),
        last_activity: now
      };
    }

    session.last_activity = now;

    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify(session)
      );
    } catch (_) {}

    return session;
  }

  function send(action) {
    const visitorId = getVisitorId();
    const session = getSession();

    const payload = JSON.stringify({
      action: action,
      visitor_id: visitorId,
      session_id: session.id,
      page: (location.pathname || '/').slice(0, 160)
    });

    try {
      if (
        action === 'leave' &&
        navigator.sendBeacon
      ) {
        navigator.sendBeacon(
          ENDPOINT,
          new Blob(
            [payload],
            { type: 'application/json' }
          )
        );

        return;
      }

      fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        keepalive: action === 'leave'
      }).catch(() => {});
    } catch (_) {}
  }

  /* Start / record current page */
  send('start');

  /* Keep session alive while visitor remains on page */
  const heartbeat = setInterval(() => {
    send('heartbeat');
  }, HEARTBEAT_MS);

  /* Visitor returns to the tab */
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'visible') {
        send('heartbeat');
      }
    }
  );

  /* Visitor leaves the page */
  window.addEventListener(
    'beforeunload',
    () => {
      clearInterval(heartbeat);
      send('leave');
    }
  );

})();
