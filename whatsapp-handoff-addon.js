/* =========================================================
   GLIME — WhatsApp Handoff Addon
   File: whatsapp-handoff-addon.js

   Purpose:
   Instagram / Lead page से WhatsApp Specialist पर आने के बाद:
   1. Lead ID से conversation खोजे
   2. Phone number से conversation खोजे
   3. Conversation automatically select करे
   4. Handoff URL parameters remove करे
   5. Core WhatsApp specialist को modify न करे

   Supported URL:
   whatsapp-sales-specialist.html?lead=LEAD_ID&phone=9876543210

   ========================================================= */

(() => {
  'use strict';

  const HANDOFF_TIMEOUT = 12000;
  const RETRY_INTERVAL = 300;

  let handoffCompleted = false;
  let handoffTimer = null;

  /* =========================================================
     DOM HELPERS
     ========================================================= */

  const $ = (id) => {
    return document.getElementById(id);
  };


  /* =========================================================
     PHONE NORMALIZATION
     ========================================================= */

  function normalizePhone(value) {
    if (!value) return '';

    let digits = String(value)
      .replace(/\D/g, '');

    if (!digits) return '';

    /*
      India:
      9876543210
      +91 9876543210
      919876543210
    */

    if (
      digits.length === 10 &&
      /^[6-9]/.test(digits)
    ) {
      return '91' + digits;
    }

    if (
      digits.length === 11 &&
      digits.startsWith('0')
    ) {
      return '91' + digits.substring(1);
    }

    if (
      digits.length === 12 &&
      digits.startsWith('91')
    ) {
      return digits;
    }

    return digits;
  }


  /* =========================================================
     URL PARAMS
     ========================================================= */

  function getHandoffParams() {
    try {
      const params =
        new URLSearchParams(
          window.location.search
        );

      return {
        leadId:
          String(
            params.get('lead') || ''
          ).trim(),

        phone:
          normalizePhone(
            params.get('phone') || ''
          )
      };
    } catch (error) {
      console.warn(
        '[GLIME HANDOFF] Failed to read URL params',
        error
      );

      return {
        leadId: '',
        phone: ''
      };
    }
  }


  /* =========================================================
     CHECK WHETHER HANDOFF IS REQUIRED
     ========================================================= */

  function hasHandoffParams() {
    const params =
      getHandoffParams();

    return Boolean(
      params.leadId ||
      params.phone
    );
  }


  /* =========================================================
     HANDOFF BANNER
     ========================================================= */

  function createBanner() {
    if ($('glimeHandoffBanner')) {
      return $('glimeHandoffBanner');
    }

    const banner =
      document.createElement('div');

    banner.id =
      'glimeHandoffBanner';

    banner.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 999999;
      max-width: 360px;
      padding: 12px 16px;
      border-radius: 12px;
      background: #101b28;
      border: 1px solid rgba(255,255,255,.12);
      color: #fff;
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 12px 35px rgba(0,0,0,.35);
      font-family: system-ui, -apple-system, BlinkMacSystemFont,
        "Segoe UI", sans-serif;
    `;

    document.body.appendChild(
      banner
    );

    return banner;
  }


  function updateBanner(
    message,
    type = 'info'
  ) {
    const banner =
      createBanner();

    banner.textContent =
      message;

    if (type === 'success') {
      banner.style.background =
        '#14532d';
    }

    if (type === 'error') {
      banner.style.background =
        '#7f1d1d';
    }

    if (type === 'info') {
      banner.style.background =
        '#101b28';
    }
  }


  function removeBanner(delay = 2500) {
    setTimeout(() => {
      const banner =
        $('glimeHandoffBanner');

      if (banner) {
        banner.remove();
      }
    }, delay);
  }


  /* =========================================================
     DATA ATTRIBUTE HELPERS
     ========================================================= */

  function getItemLeadId(item) {
    if (!item) return '';

    return String(
      item.dataset.leadId ||
      item.dataset.leadID ||
      item.getAttribute('data-lead-id') ||
      item.getAttribute('data-lead') ||
      ''
    ).trim();
  }


  function getItemPhone(item) {
    if (!item) return '';

    return normalizePhone(
      item.dataset.phone ||
      item.getAttribute('data-phone') ||
      item.dataset.customerPhone ||
      item.getAttribute('data-customer-phone') ||
      ''
    );
  }


  function getItemConversationId(item) {
    if (!item) return '';

    return String(
      item.dataset.id ||
      item.dataset.conversationId ||
      item.getAttribute('data-id') ||
      ''
    ).trim();
  }


  /* =========================================================
     FIND CONVERSATION BY LEAD ID
     ========================================================= */

  function findByLeadId(
    leadId
  ) {
    if (!leadId) {
      return null;
    }

    const items =
      document.querySelectorAll(
        '.conversation-item'
      );

    for (
      const item of items
    ) {
      const itemLeadId =
        getItemLeadId(item);

      if (
        itemLeadId &&
        itemLeadId === leadId
      ) {
        return item;
      }
    }

    return null;
  }


  /* =========================================================
     FIND CONVERSATION BY PHONE
     ========================================================= */

  function findByPhone(
    phone
  ) {
    if (!phone) {
      return null;
    }

    const items =
      document.querySelectorAll(
        '.conversation-item'
      );

    for (
      const item of items
    ) {
      /*
        First try direct data attributes.
      */

      const dataPhone =
        getItemPhone(item);

      if (
        dataPhone &&
        dataPhone === phone
      ) {
        return item;
      }


      /*
        Fallback:
        search visible conversation text.
      */

      const text =
        String(
          item.textContent || ''
        );

      const normalizedText =
        normalizePhone(text);

      if (
        normalizedText &&
        normalizedText.includes(phone)
      ) {
        return item;
      }
    }

    return null;
  }


  /* =========================================================
     FIND CONVERSATION
     ========================================================= */

  function findConversation() {
    const {
      leadId,
      phone
    } = getHandoffParams();


    /*
      Priority 1:
      Lead ID
    */

    if (leadId) {
      const byLead =
        findByLeadId(
          leadId
        );

      if (byLead) {
        return byLead;
      }
    }


    /*
      Priority 2:
      Phone
    */

    if (phone) {
      const byPhone =
        findByPhone(
          phone
        );

      if (byPhone) {
        return byPhone;
      }
    }


    return null;
  }


  /* =========================================================
     SELECT CONVERSATION
     ========================================================= */

  function selectConversation(
    item
  ) {
    if (!item) {
      return false;
    }

    try {
      item.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    } catch (_) {}


    /*
      Use normal click so the existing
      WhatsApp specialist handles selection.
    */

    item.click();

    return true;
  }


  /* =========================================================
     CLEAN URL
     ========================================================= */

  function cleanHandoffUrl() {
    try {
      const url =
        new URL(
          window.location.href
        );

      url.searchParams.delete(
        'lead'
      );

      url.searchParams.delete(
        'phone'
      );

      const query =
        url.searchParams.toString();

      const cleanUrl =
        url.pathname +
        (
          query
            ? '?' + query
            : ''
        ) +
        url.hash;

      window.history.replaceState(
        {},
        document.title,
        cleanUrl
      );
    } catch (error) {
      console.warn(
        '[GLIME HANDOFF] URL cleanup failed',
        error
      );
    }
  }


  /* =========================================================
     SUCCESS
     ========================================================= */

  function completeHandoff(
    item
  ) {
    if (handoffCompleted) {
      return;
    }

    handoffCompleted = true;

    if (handoffTimer) {
      clearInterval(
        handoffTimer
      );

      handoffTimer = null;
    }

    const conversationId =
      getItemConversationId(
        item
      );

    selectConversation(
      item
    );

    updateBanner(
      conversationId
        ? 'WhatsApp conversation opened.'
        : 'WhatsApp customer conversation opened.',
      'success'
    );

    cleanHandoffUrl();

    removeBanner(
      3000
    );

    console.log(
      '[GLIME HANDOFF] Conversation selected:',
      conversationId || '(unknown)'
    );
  }


  /* =========================================================
     FAILED HANDOFF
     ========================================================= */

  function failHandoff() {
    if (handoffCompleted) {
      return;
    }

    if (handoffTimer) {
      clearInterval(
        handoffTimer
      );

      handoffTimer = null;
    }

    updateBanner(
      'WhatsApp conversation नहीं मिली। कृपया conversation manually select करें।',
      'error'
    );

    removeBanner(
      5000
    );

    console.warn(
      '[GLIME HANDOFF] Conversation not found.'
    );
  }


  /* =========================================================
     TRY HANDOFF
     ========================================================= */

  function tryHandoff() {
    if (handoffCompleted) {
      return true;
    }

    if (!hasHandoffParams()) {
      return true;
    }

    const item =
      findConversation();

    if (item) {
      completeHandoff(
        item
      );

      return true;
    }

    return false;
  }


  /* =========================================================
     START HANDOFF
     ========================================================= */

  function startHandoff() {
    if (!hasHandoffParams()) {
      return;
    }

    const {
      leadId,
      phone
    } = getHandoffParams();

    document.body.dataset.glimeHandoff =
      'instagram-whatsapp';

    updateBanner(
      leadId
        ? 'Instagram → WhatsApp: customer conversation खोज रहे हैं…'
        : 'Instagram → WhatsApp: phone number से customer खोज रहे हैं…',
      'info'
    );

    const startTime =
      Date.now();

    handoffTimer =
      setInterval(() => {
        const success =
          tryHandoff();

        if (success) {
          return;
        }

        if (
          Date.now() -
            startTime >=
          HANDOFF_TIMEOUT
        ) {
          failHandoff();
        }
      }, RETRY_INTERVAL);
  }


  /* =========================================================
     WAIT FOR DOM
     ========================================================= */

  function boot() {
    if (
      document.readyState ===
      'loading'
    ) {
      document.addEventListener(
        'DOMContentLoaded',
        startHandoff,
        {
          once: true
        }
      );

      return;
    }

    startHandoff();
  }


  /* =========================================================
     PUBLIC DEBUG HELPER
     ========================================================= */

  window.GLIME_WHATSAPP_HANDOFF = {
    getParams:
      getHandoffParams,

    findConversation:
      findConversation,

    retry:
      tryHandoff
  };


  /* =========================================================
     INIT
     ========================================================= */

  boot();


  console.log(
    '[GLIME HANDOFF] WhatsApp handoff addon loaded.'
  );

})();
