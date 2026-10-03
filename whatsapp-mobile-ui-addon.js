/*
 * GLIME — WhatsApp Mobile UI Add-on (SAFE VERSION)
 * -------------------------------------------------
 * UI/navigation only.
 *
 * Does NOT modify:
 * - Supabase/database logic
 * - WhatsApp API logic
 * - AI generation/send logic
 * - approval logic
 * - handoff logic
 * - conversation/message data
 *
 * Load AFTER:
 *   whatsapp-sales-specialist.js
 *   whatsapp-sales-context-addon.js
 *   whatsapp-handoff-addon.js
 *
 * CSS file expected beside this file:
 *   whatsapp-mobile-ui-addon.css
 */
(function () {
  "use strict";

  var BREAKPOINT = 720;
  var CSS_FILE = "whatsapp-mobile-ui-addon.css";
  var selectedId = null;
  var started = false;

  function isMobile() {
    return window.matchMedia(
      "(max-width: " + BREAKPOINT + "px)"
    ).matches;
  }

  function shell() {
    return document.querySelector(
      ".specialist-shell"
    );
  }

  function activeConversation() {
    return document.querySelector(
      ".conversation-item.active"
    );
  }

  function addCss() {
    if (
      document.querySelector(
        'link[data-glime-wa-mobile="1"]'
      )
    ) {
      return;
    }

    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_FILE;
    link.setAttribute(
      "data-glime-wa-mobile",
      "1"
    );

    document.head.appendChild(link);
  }

  function setChat(open) {
    var el = shell();

    if (!el) return;

    if (!isMobile()) {
      el.classList.remove(
        "mobile-chat-open"
      );
      return;
    }

    if (open) {
      el.classList.add(
        "mobile-chat-open"
      );
    } else {
      el.classList.remove(
        "mobile-chat-open"
      );
    }
  }

  function goToChat() {
    if (!isMobile()) return;

    if (!activeConversation()) return;

    setChat(true);
  }

  function goToInbox() {
    setChat(false);
  }

  function addBackButton() {
    var header =
      document.querySelector(
        ".chat-header"
      );

    if (!header) return;

    var button =
      document.getElementById(
        "glimeMobileWaBack"
      );

    if (button) return;

    button =
      document.createElement(
        "button"
      );

    button.type = "button";

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

    button.textContent = "‹";

    header.insertBefore(
      button,
      header.firstChild
    );

    button.addEventListener(
      "click",
      function (event) {
        event.preventDefault();
        event.stopPropagation();

        goToInbox();
      }
    );
  }

  function prepareContextButton() {
    /*
     * whatsapp-sales-context-addon.js owns
     * the actual context action.
     *
     * We only make its existing button
     * mobile-friendly.
     */

    var button =
      document.getElementById(
        "glimeWaContextTrigger"
      );

    if (!button) return;

    button.classList.add(
      "glime-wa-mobile-context-button"
    );

    button.textContent =
      "Context";

    button.setAttribute(
      "aria-label",
      "Open customer context"
    );
  }

  function bindConversationList() {
    var list =
      document.getElementById(
        "conversationList"
      );

    if (!list) return;

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

    /*
     * Event delegation works even when
     * the main specialist replaces rows.
     */

    list.addEventListener(
      "click",
      function (event) {
        var item =
          event.target.closest(
            ".conversation-item"
          );

        if (!item) return;

        /*
         * Original specialist handler
         * gets time to finish first.
         */

        window.setTimeout(
          function () {
            goToChat();

            addBackButton();

            prepareContextButton();
          },
          0
        );
      }
    );
  }

  function syncSelection() {
    if (!isMobile()) {
      setChat(false);

      selectedId = null;

      return;
    }

    var item =
      activeConversation();

    if (!item) return;

    var id =
      item.getAttribute(
        "data-id"
      ) || "active";

    if (id !== selectedId) {
      selectedId = id;

      setChat(true);

      addBackButton();

      prepareContextButton();
    }
  }

  function closeContextOnEscape() {
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
          event.key !== "Escape"
        ) {
          return;
        }

        var modal =
          document.getElementById(
            "glimeWaContextModal"
          );

        if (!modal) return;

        if (
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

  function handleResize() {
    if (!isMobile()) {
      setChat(false);
      return;
    }

    syncSelection();

    addBackButton();

    prepareContextButton();
  }

  function start() {
    if (started) return;

    started = true;

    addCss();

    bindConversationList();

    closeContextOnEscape();

    syncSelection();

    window.addEventListener(
      "resize",
      handleResize,
      { passive: true }
    );

    /*
     * Small, low-frequency state check only.
     *
     * No MutationObserver.
     * No DOM rewriting loop.
     */

    window.setInterval(
      function () {
        if (!isMobile()) return;

        bindConversationList();

        syncSelection();

        addBackButton();

        prepareContextButton();
      },
      1000
    );

    console.log(
      "[GLIME WA Mobile] Safe UI addon loaded."
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }
})();
