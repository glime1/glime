/*
 * GLIME — WhatsApp Mobile UI Add-on
 * SAFE / SELF-CONTAINED VERSION
 *
 * UI ONLY.
 *
 * यह file:
 * - Supabase को call नहीं करती
 * - WhatsApp API को call नहीं करती
 * - AI को call नहीं करती
 * - Authentication को touch नहीं करती
 * - boot() को touch नहीं करती
 * - existing message/send/handoff logic को replace नहीं करती
 * - MutationObserver इस्तेमाल नहीं करती
 * - setInterval इस्तेमाल नहीं करती
 *
 * इसे HTML में सबसे LAST में load करें:
 *
 * whatsapp-sales-specialist.js
 * whatsapp-sales-context-addon.js
 * whatsapp-handoff-addon.js
 * whatsapp-mobile-ui-addon.js
 */

(function () {
  "use strict";

  var BREAKPOINT = 720;
  var started = false;

  function isMobile() {
    if (window.matchMedia) {
      return window.matchMedia(
        "(max-width: " + BREAKPOINT + "px)"
      ).matches;
    }

    return window.innerWidth <= BREAKPOINT;
  }

  function getShell() {
    return document.querySelector(
      ".specialist-shell"
    );
  }

  function getActiveConversation() {
    return document.querySelector(
      ".conversation-item.active"
    );
  }

  function setMobileChat(open) {
    var specialist = getShell();

    if (!specialist) {
      return;
    }

    if (!isMobile()) {
      specialist.classList.remove(
        "mobile-chat-open"
      );

      return;
    }

    if (open) {
      specialist.classList.add(
        "mobile-chat-open"
      );
    } else {
      specialist.classList.remove(
        "mobile-chat-open"
      );
    }
  }

  /*
   * Mobile CSS is injected directly.
   * इसलिए अलग CSS file की जरूरत नहीं है।
   */
  function injectStyles() {
    if (
      document.getElementById(
        "glimeWaMobileStyles"
      )
    ) {
      return;
    }

    var style =
      document.createElement("style");

    style.id =
      "glimeWaMobileStyles";

    style.textContent = `
      @media (max-width: 720px) {

        html,
        body {
          width: 100%;
          min-height: 100%;
          overflow-x: hidden;
        }

        body {
          -webkit-tap-highlight-color: transparent;
        }

        .main {
          width: 100%;
          min-width: 0;
          padding: 0 !important;
        }

        .topbar {
          min-height: 64px;
          padding: 10px 10px !important;
          gap: 8px !important;
        }

        .topbar h1 {
          font-size: 1.05rem !important;
          line-height: 1.2;
          margin: 2px 0 !important;
        }

        .topbar p,
        .topbar .eyebrow {
          display: none !important;
        }

        .top-actions {
          gap: 6px !important;
          margin-left: auto;
        }

        .connection-badge {
          display: none !important;
        }

        #connectBtn {
          min-height: 36px;
          padding: 7px 9px !important;
          font-size: .60rem !important;
          white-space: nowrap;
        }

        /*
         * Main specialist container
         */
        .specialist-shell {
          display: block !important;
          width: 100%;
          height: calc(100dvh - 64px) !important;
          min-height: 0 !important;
          margin-top: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          overflow: hidden !important;
          position: relative;
        }

        .conversation-panel,
        .chat-panel {
          width: 100% !important;
          height: 100% !important;
          min-height: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
        }

        /*
         * Mobile default:
         * Inbox दिखाई देगी
         */
        .specialist-shell:not(.mobile-chat-open)
          .conversation-panel {
          display: flex !important;
        }

        .specialist-shell:not(.mobile-chat-open)
          .chat-panel {
          display: none !important;
        }

        /*
         * Conversation खोलने के बाद:
         * केवल Chat दिखाई देगा
         */
        .specialist-shell.mobile-chat-open
          .conversation-panel {
          display: none !important;
        }

        .specialist-shell.mobile-chat-open
          .chat-panel {
          display: flex !important;
        }

        /*
         * Desktop context sidebar mobile पर hidden.
         * Existing context addon अपना modal इस्तेमाल करेगा।
         */
        .context-panel {
          display: none !important;
        }

        /*
         * INBOX
         */
        .conversation-panel {
          padding: 9px !important;
          overflow: hidden !important;
        }

        .panel-head {
          min-height: 42px;
        }

        .panel-head h2 {
          font-size: .95rem !important;
        }

        .search-box {
          min-height: 44px;
          margin: 8px 0 !important;
          padding: 9px 10px !important;
          border-radius: 12px !important;
        }

        .search-box input {
          font-size: .75rem !important;
        }

        .filter-row {
          gap: 6px !important;
          margin-bottom: 8px !important;
        }

        .filter {
          min-height: 37px;
          padding: 7px !important;
          font-size: .64rem !important;
        }

        .conversation-list {
          min-height: 0;
          overflow: auto !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 7px;
        }

        .conversation-item {
          min-height: 64px;
          padding: 10px 9px !important;
          margin-bottom: 4px !important;
          border-radius: 12px !important;
          align-items: center;
        }

        .conversation-item .avatar {
          width: 40px !important;
          height: 40px !important;
        }

        .conv-top strong {
          font-size: .72rem !important;
        }

        .conv-preview {
          font-size: .60rem !important;
        }

        /*
         * CHAT
         */
        .chat-panel {
          position: relative;
          background: #071019;
        }

        .chat-view {
          width: 100%;
          height: 100% !important;
          min-height: 0 !important;
        }

        .chat-header {
          flex: 0 0 58px;
          min-height: 58px !important;
          padding: 8px 8px !important;
          gap: 7px !important;
          background: rgba(7,16,25,.98);
          position: relative;
          z-index: 5;
        }

        .chat-header .avatar {
          width: 36px !important;
          height: 36px !important;
        }

        .chat-title {
          min-width: 0;
        }

        .chat-title strong {
          font-size: .73rem !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-title span {
          font-size: .55rem !important;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-actions {
          display: flex !important;
          align-items: center;
          gap: 5px !important;
          margin-left: auto;
        }

        /*
         * Mobile back button
         */
        .glime-wa-mobile-back {
          width: 37px;
          height: 37px;
          min-width: 37px;
          min-height: 37px;
          flex: 0 0 37px;
          display: grid !important;
          place-items: center;
          padding: 0 0 3px !important;
          border-radius: 10px !important;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(255,255,255,.045);
          color: #fff;
          font-size: 1.55rem !important;
          line-height: 1;
        }

        .glime-wa-mobile-back:active {
          transform: scale(.96);
        }

        /*
         * Existing Context button
         */
        #glimeWaContextTrigger {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          min-width: 64px;
          padding: 6px 9px !important;
          border-radius: 9px !important;
          font-size: 0 !important;
          white-space: nowrap;
        }

        #glimeWaContextTrigger::after {
          content: "Context";
          font-size: .56rem;
          font-weight: 700;
        }

        /*
         * MESSAGE LIST
         */
        .message-list {
          min-height: 0 !important;
          padding: 12px 9px 16px !important;
          overflow: auto !important;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .message-row {
          margin: 5px 0 !important;
        }

        .bubble {
          max-width: 84% !important;
          padding: 9px 10px !important;
          border-radius: 13px !important;
          font-size: .69rem !important;
          line-height: 1.52 !important;
        }

        /*
         * COMPOSER
         */
        .composer {
          flex: 0 0 auto;
          padding: 8px 8px
            calc(
              8px +
              env(
                safe-area-inset-bottom,
                0px
              )
            ) !important;
          background: rgba(7,16,25,.98);
          position: relative;
          z-index: 6;
        }

        .composer textarea {
          min-height: 43px;
          max-height: 112px;
          padding: 9px 10px !important;
          font-size: .69rem !important;
          border-radius: 11px !important;
        }

        .composer-bottom {
          gap: 6px !important;
          margin-top: 6px !important;
        }

        .composer-bottom .ghost-btn,
        .composer-bottom .primary-btn {
          min-height: 36px;
        }

        .composer-bottom .ghost-btn {
          padding: 7px 8px !important;
          font-size: .55rem !important;
          white-space: nowrap;
        }

        .composer-bottom .primary-btn {
          padding: 7px 11px !important;
          font-size: .59rem !important;
          white-space: nowrap;
        }

        #sendHint {
          display: none !important;
        }

        .ai-suggestion {
          max-height: 130px;
          overflow: auto;
          margin-bottom: 7px;
          padding: 8px !important;
        }

        /*
         * Context modal = bottom sheet
         */
        #glimeWaContextModal {
          align-items: flex-end !important;
          justify-content: center !important;
          padding: 0 !important;
          background: rgba(0,0,0,.62) !important;
        }

        #glimeWaContextModal .modal-card {
          width: 100% !important;
          max-width: none !important;
          max-height: 82dvh !important;
          margin: 0 !important;
          padding: 16px 14px
            calc(
              16px +
              env(
                safe-area-inset-bottom,
                0px
              )
            ) !important;
          border-radius: 20px 20px 0 0 !important;
          overflow: auto !important;
          border-bottom: 0 !important;
        }

        #glimeWaContextModal h2 {
          font-size: 1rem !important;
          margin: 4px 0 12px !important;
        }

        #glimeWaContextModal .modal-close {
          width: 35px;
          height: 35px;
          border-radius: 10px;
        }

        #glimeWaContextModal
          .glime-wa-context-modal-body {
          max-height: none !important;
          overflow: visible !important;
        }

        /*
         * Existing empty state must not overlay
         * the mobile chat.
         */
        .specialist-shell.mobile-chat-open
          #chatEmpty {
          display: none !important;
        }

        .specialist-shell button {
          touch-action: manipulation;
        }
      }

      @media (max-width: 380px) {

        #connectBtn {
          padding-left: 7px !important;
          padding-right: 7px !important;
          font-size: .56rem !important;
        }

        .chat-actions .ghost-btn {
          padding-left: 7px !important;
          padding-right: 7px !important;
        }

        .bubble {
          max-width: 88% !important;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  /*
   * Back button is purely UI.
   */
  function addBackButton() {
    var header =
      document.querySelector(
        ".chat-header"
      );

    if (!header) {
      return;
    }

    if (
      document.getElementById(
        "glimeMobileWaBack"
      )
    ) {
      return;
    }

    var button =
      document.createElement(
        "button"
      );

    button.type =
      "button";

    button.id =
      "glimeMobileWaBack";

    button.className =
      "glime-wa-mobile-back";

    button.setAttribute(
      "aria-label",
      "Back to conversations"
    );

    button.setAttribute(
      "title",
      "Back to conversations"
    );

    button.textContent =
      "‹";

    header.insertBefore(
      button,
      header.firstChild
    );

    button.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();

        setMobileChat(false);
      }
    );
  }

  /*
   * Existing conversation list को ही use करता है।
   * नया conversation selection system नहीं बनाता।
   */
  function bindConversationClicks() {
    var list =
      document.getElementById(
        "conversationList"
      );

    if (!list) {
      return;
    }

    if (
      list.getAttribute(
        "data-glime-wa-mobile-bound"
      ) === "1"
    ) {
      return;
    }

    list.setAttribute(
      "data-glime-wa-mobile-bound",
      "1"
    );

    list.addEventListener(
      "click",
      function (event) {
        var item =
          event.target.closest(
            ".conversation-item"
          );

        if (!item) {
          return;
        }

        /*
         * Existing onclick पहले चलता है:
         *
         * selectConversation(...)
         *
         * उसके बाद हमारा UI switch होता है।
         */
        window.setTimeout(
          function () {

            if (
              isMobile() &&
              getActiveConversation()
            ) {
              setMobileChat(true);

              addBackButton();
            }

          },
          0
        );
      }
    );
  }

  function syncMobileState() {
    if (!isMobile()) {
      setMobileChat(false);
      return;
    }

    /*
     * अगर conversation पहले से selected है,
     * तो mobile पर chat दिखेगा।
     */
    if (
      getActiveConversation()
    ) {
      setMobileChat(true);
      addBackButton();
    }
  }

  function bindEscape() {
    if (
      window.__glimeWaMobileEscapeBound
    ) {
      return;
    }

    window.__glimeWaMobileEscapeBound =
      true;

    document.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key !==
          "Escape"
        ) {
          return;
        }

        var modal =
          document.getElementById(
            "glimeWaContextModal"
          );

        if (
          modal &&
          !modal.classList.contains(
            "hidden"
          )
        ) {
          modal.classList.add(
            "hidden"
          );
        }
      }
    );
  }

  function start() {
    if (started) {
      return;
    }

    started = true;

    /*
     * केवल UI initialization.
     */
    injectStyles();

    addBackButton();

    bindConversationClicks();

    bindEscape();

    syncMobileState();

    window.addEventListener(
      "resize",
      syncMobileState,
      {
        passive: true
      }
    );

    console.log(
      "[GLIME WA Mobile] Safe UI addon loaded."
    );
  }

  /*
   * यह main GLIME boot/auth को wait या modify नहीं करता।
   */
  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      {
        once: true
      }
    );
  } else {
    start();
  }

})();
