
/*
 * GLIME Website Analytics — v3.0.0
 * Website: https://glime.online
 *
 * Tracks:
 * - Unique visitors and sessions
 * - Page views and visitor journey
 * - UTM traffic attribution
 * - Referrer and landing page
 * - Device, browser and OS (server-side)
 * - Click tracking
 * - Scroll depth
 * - Active time
 * - Conversion events
 */

(() => {
  'use strict';

  if (window.__GLIME_WEBSITE_ANALYTICS_LOADED__) return;
  window.__GLIME_WEBSITE_ANALYTICS_LOADED__ = true;

  const ENDPOINT =
    'https://ufoulgbiqgjriwapuopc.supabase.co/functions/v1/website-analytics';

  const VISITOR_KEY = 'glime_visitor_id';
  const SESSION_KEY = 'glime_analytics_session';

  const SESSION_IDLE_MS = 30 * 60 * 1000;
  const HEARTBEAT_MS = 30 * 1000;
  const ENGAGEMENT_FLUSH_MS = 10 * 1000;
  const MAX_PAGE_LENGTH = 160;

  const INTERNAL_HOSTS = new Set([
    'glime.online',
    'www.glime.online'
  ]);

  let memoryVisitorId = null;
  let memorySession = null;

  let activeSecondsPending = 0;
  let lastActiveTick = performance.now();

  let wasVisible =
    document.visibilityState === 'visible';

  let maxScrollPending = 0;
  let lastScrollSent = -1;

  let pendingClicks = [];
  let pendingConversions = [];

  let engagementInFlight = false;

  function makeUuid() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === 'function'
    ) {
      return window.crypto.randomUUID();
    }

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
      .replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x'
          ? r
          : ((r & 0x3) | 0x8);

        return v.toString(16);
      });
  }

  function storageGet(storage, key) {
    try {
      return storage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(storage, key, value) {
    try {
      storage.setItem(key, value);
    } catch (_) {}
  }

  function getVisitorId() {
    if (memoryVisitorId) return memoryVisitorId;

    let id = storageGet(
      window.localStorage,
      VISITOR_KEY
    );

    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = makeUuid();

      storageSet(
        window.localStorage,
        VISITOR_KEY,
        id
      );
    }

    memoryVisitorId = id;

    return id;
  }

  function readSession() {
    if (memorySession) return memorySession;

    const raw = storageGet(
      window.sessionStorage,
      SESSION_KEY
    );

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);

      if (
        parsed &&
        typeof parsed.id === 'string' &&
        /^[0-9a-f-]{36}$/i.test(parsed.id) &&
        Number.isFinite(
          Number(parsed.last_activity)
        )
      ) {
        memorySession = parsed;
        return parsed;
      }
    } catch (_) {}

    return null;
  }

  function writeSession(session) {
    memorySession = session;

    storageSet(
      window.sessionStorage,
      SESSION_KEY,
      JSON.stringify(session)
    );
  }

  function getSessionState() {
    const now = Date.now();

    let session = readSession();
    let isNew = false;

    if (
      !session ||
      now - Number(session.last_activity || 0) >
        SESSION_IDLE_MS
    ) {
      session = {
        id: makeUuid(),
        last_activity: now
      };

      isNew = true;
    } else {
      session.last_activity = now;
    }

    writeSession(session);

    return {
      session,
      isNew
    };
  }

  function getPagePath() {
    return String(
      window.location.pathname || '/'
    ).slice(0, MAX_PAGE_LENGTH) || '/';
  }

  function cleanText(value, maxLength) {
    if (typeof value !== 'string') return null;

    const result = value
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, maxLength);

    return result || null;
  }

  function getReferrerHost() {
    try {
      if (!document.referrer) return null;

      const ref = new URL(document.referrer);

      if (
        ref.protocol !== 'http:' &&
        ref.protocol !== 'https:'
      ) {
        return null;
      }

      const host = ref.hostname.toLowerCase();

      if (INTERNAL_HOSTS.has(host)) return null;

      return cleanText(host, 180);

    } catch (_) {
      return null;
    }
  }

  function classifyReferrer(host) {
    if (!host) {
      return {
        source: 'direct',
        medium: 'none'
      };
    }

    const search = [
      'google.',
      'bing.com',
      'yahoo.',
      'duckduckgo.com',
      'yandex.',
      'baidu.com'
    ];

    const social = [
      'facebook.com',
      'fb.com',
      'instagram.com',
      't.co',
      'twitter.com',
      'x.com',
      'linkedin.com',
      'youtube.com',
      'youtu.be',
      'tiktok.com',
      'pinterest.',
      'reddit.com',
      'threads.net',
      'whatsapp.com'
    ];

    if (
      search.some(domain => host.includes(domain))
    ) {
      return {
        source: host,
        medium: 'organic'
      };
    }

    if (
      social.some(domain =>
        host === domain ||
        host.endsWith('.' + domain)
      )
    ) {
      return {
        source: host,
        medium: 'social'
      };
    }

    return {
      source: host,
      medium: 'referral'
    };
  }

  function getAttribution() {
    const params = new URLSearchParams(
      window.location.search || ''
    );

    const referrerHost = getReferrerHost();

    const inferred = classifyReferrer(
      referrerHost
    );

    let adClickType = null;

    if (
      params.has('gclid') ||
      params.has('gbraid') ||
      params.has('wbraid')
    ) {
      adClickType = 'google';
    } else if (params.has('fbclid')) {
      adClickType = 'meta';
    } else if (params.has('msclkid')) {
      adClickType = 'microsoft';
    } else if (params.has('ttclid')) {
      adClickType = 'tiktok';
    } else if (params.has('li_fat_id')) {
      adClickType = 'linkedin';
    }

    return {
      source:
        cleanText(params.get('utm_source'), 100) ||
        inferred.source,

      medium:
        cleanText(params.get('utm_medium'), 100) ||
        inferred.medium,

      campaign: cleanText(
        params.get('utm_campaign'),
        160
      ),

      term: cleanText(
        params.get('utm_term'),
        160
      ),

      content: cleanText(
        params.get('utm_content'),
        160
      ),

      referrer_host: referrerHost,

      landing_path: getPagePath(),

      ad_click_type: adClickType
    };
  }

  async function post(payload) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify(payload),

        credentials: 'omit',
        cache: 'no-store',
        keepalive: true
      });

      return response.ok;

    } catch (_) {
      return false;
    }
  }

  function basePayload(action, session) {
    return {
      action,

      visitor_id: getVisitorId(),

      session_id: session.id,

      page: getPagePath()
    };
  }

  function sendPageView() {
    const state = getSessionState();

    const payload = basePayload(
      state.isNew ? 'start' : 'page',
      state.session
    );

    if (state.isNew) {
      payload.attribution = getAttribution();
    }

    post(payload);
  }

  function sendHeartbeat() {
    if (
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    const state = getSessionState();

    if (state.isNew) {
      const payload = basePayload(
        'start',
        state.session
      );

      payload.attribution = getAttribution();

      post(payload);

    } else {
      post(
        basePayload(
          'heartbeat',
          state.session
        )
      );
    }
  }

  function updateScrollDepth() {
    const doc = document.documentElement;
    const body = document.body;

    const scrollHeight = Math.max(
      doc ? doc.scrollHeight : 0,
      body ? body.scrollHeight : 0
    );

    const viewport =
      window.innerHeight ||
      (doc ? doc.clientHeight : 0);

    const maxScrollable = Math.max(
      1,
      scrollHeight - viewport
    );

    const scrollTop =
      window.scrollY ||
      (doc ? doc.scrollTop : 0) ||
      0;

    const percent = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          (scrollTop / maxScrollable) * 100
        )
      )
    );

    if (percent > maxScrollPending) {
      maxScrollPending = percent;
    }
  }

  function collectActiveSeconds() {
    const now = performance.now();

    const elapsed = Math.max(
      0,
      Math.floor(
        (now - lastActiveTick) / 1000
      )
    );

    if (wasVisible) {
      activeSecondsPending += Math.min(
        elapsed,
        60
      );
    }

    lastActiveTick = now;

    wasVisible =
      document.visibilityState === 'visible';
  }

  function getClickRecord(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    const element = target.closest(
      'a,button,[role="button"],[data-analytics]'
    );

    if (!element) return null;

    if (
      element.closest('form') &&
      element.matches('input,textarea,select')
    ) {
      return null;
    }

    if (element.isContentEditable) {
      return null;
    }

    const explicit =
      element.getAttribute('data-analytics');

    const aria =
      element.getAttribute('aria-label');

    const title =
      element.getAttribute('title');

    const text = (
      element.textContent || ''
    ).replace(/\s+/g, ' ').trim();

    const label = cleanText(
      explicit ||
      aria ||
      title ||
      text ||
      element.tagName.toLowerCase(),
      80
    );

    if (!label) return null;

    let type = element.tagName.toLowerCase();
    let destination = null;

    if (
      element instanceof HTMLAnchorElement &&
      element.href
    ) {
      try {
        const url = new URL(
          element.href,
          window.location.href
        );

        destination =
          url.origin === window.location.origin
            ? url.pathname.slice(0, MAX_PAGE_LENGTH)
            : url.hostname.slice(0, 100);

      } catch (_) {}

      type = 'link';
    }

    return {
      label,
      type,
      destination
    };
  }

  function queueClick(event) {
    const record = getClickRecord(event.target);

    if (!record || pendingClicks.length >= 50) {
      return;
    }

    pendingClicks.push(record);
  }

  function queueConversion(name) {
    const conversion = cleanText(
      String(name || ''),
      80
    );

    if (
      !conversion ||
      pendingConversions.length >= 20
    ) {
      return false;
    }

    pendingConversions.push(conversion);

    flushEngagement();

    return true;
  }

  async function flushEngagement() {
    if (engagementInFlight) return;

    engagementInFlight = true;

    collectActiveSeconds();

    const clicks = pendingClicks.splice(0, 25);

    const conversions =
      pendingConversions.splice(0, 10);

    const activeDelta = Math.min(
      activeSecondsPending,
      120
    );

    const scroll =
      maxScrollPending > lastScrollSent
        ? maxScrollPending
        : null;

    if (
      !clicks.length &&
      !conversions.length &&
      !activeDelta &&
      scroll === null
    ) {
      engagementInFlight = false;
      return;
    }

    activeSecondsPending = Math.max(
      0,
      activeSecondsPending - activeDelta
    );

    if (scroll !== null) {
      lastScrollSent = scroll;
    }

    const state = getSessionState();

    if (state.isNew) {
      const startPayload = basePayload(
        'start',
        state.session
      );

      startPayload.attribution =
        getAttribution();

      await post(startPayload);
    }

    const payload = basePayload(
      'engagement',
      state.session
    );

    payload.click_events = clicks;

    payload.conversions = conversions;

    payload.active_seconds_delta =
      activeDelta;

    if (scroll !== null) {
      payload.max_scroll = scroll;
    }

    try {
      await post(payload);

    } finally {
      engagementInFlight = false;
    }
  }

  // Initial page tracking
  sendPageView();

  updateScrollDepth();

  // Click tracking
  document.addEventListener(
    'click',
    queueClick,
    true
  );

  // Scroll tracking
  window.addEventListener(
    'scroll',
    updateScrollDepth,
    { passive: true }
  );

  // Heartbeat
  const heartbeatTimer =
    window.setInterval(
      sendHeartbeat,
      HEARTBEAT_MS
    );

  // Engagement batching
  const engagementTimer =
    window.setInterval(
      flushEngagement,
      ENGAGEMENT_FLUSH_MS
    );

  // Visibility tracking
  document.addEventListener(
    'visibilitychange',
    () => {
      collectActiveSeconds();

      if (
        document.visibilityState === 'visible'
      ) {
        sendHeartbeat();
      } else {
        flushEngagement();
      }
    }
  );

  // Page exit
  window.addEventListener(
    'pagehide',
    () => {
      collectActiveSeconds();
      flushEngagement();
    }
  );

  // SPA navigation tracking
  let lastTrackedPath = getPagePath();

  let routeCheckQueued = false;

  function checkRouteChange() {
    routeCheckQueued = false;

    const currentPath = getPagePath();

    if (currentPath === lastTrackedPath) {
      return;
    }

    lastTrackedPath = currentPath;

    sendPageView();

    updateScrollDepth();
  }

  function queueRouteCheck() {
    if (routeCheckQueued) return;

    routeCheckQueued = true;

    if (
      typeof window.queueMicrotask === 'function'
    ) {
      window.queueMicrotask(checkRouteChange);

    } else {
      Promise.resolve().then(checkRouteChange);
    }
  }

  // History API
  const originalPushState =
    window.history.pushState;

  const originalReplaceState =
    window.history.replaceState;

  if (typeof originalPushState === 'function') {
    window.history.pushState = function () {
      const result =
        originalPushState.apply(
          this,
          arguments
        );

      queueRouteCheck();

      return result;
    };
  }

  if (
    typeof originalReplaceState === 'function'
  ) {
    window.history.replaceState = function () {
      const result =
        originalReplaceState.apply(
          this,
          arguments
        );

      queueRouteCheck();

      return result;
    };
  }

  window.addEventListener(
    'popstate',
    queueRouteCheck
  );

  window.addEventListener(
    'hashchange',
    queueRouteCheck
  );

  // Public analytics API
  window.GLIME_WEBSITE_ANALYTICS =
    Object.freeze({

      version: '3.0.0',

      getPagePath,

      trackConversion(name) {
        return queueConversion(name);
      },

      flush() {
        return flushEngagement();
      },

      stop() {
        window.clearInterval(
          heartbeatTimer
        );

        window.clearInterval(
          engagementTimer
        );

        document.removeEventListener(
          'click',
          queueClick,
          true
        );

        window.removeEventListener(
          'scroll',
          updateScrollDepth
        );
      }

    });

})();
    
