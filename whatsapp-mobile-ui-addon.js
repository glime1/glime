/*
 * GLIME — WhatsApp Mobile UI Add-on
 * ----------------------------------
 * Purpose:
 *   Mobile-first navigation/presentation only.
 *
 * Does NOT:
 *   - change Supabase queries
 *   - change WhatsApp API calls
 *   - change AI generation/send logic
 *   - change handoff logic
 *   - change conversation/message data
 *
 * Expected placement:
 *   Load this file AFTER:
 *     whatsapp-sales-specialist.js
 *     whatsapp-sales-context-addon.js
 *     whatsapp-handoff-addon.js
 *
 * The addon automatically loads:
 *   whatsapp-mobile-ui-addon.css
 */

(function () {
  "use strict";

  const MOBILE_BREAKPOINT = 720;
  const CSS_FILE = "whatsapp-mobile-ui-addon.css";

  function loadCssOnce() {
    const existing = document.querySelector(
      'link[data-glime-mobile-wa-css="1"]'
    );

    if (existing) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CSS_FILE;
    link.dataset.glimeMobileWaCss = "1";
    document.head.appendChild(link);
  }

  function isMobile() {
    return window.matchMedia(
      `(max-width:${MOBILE_BREAKPOINT}px)`
    ).matches;
  }

  function getShell() {
    return document.querySelector(".specialist-shell");
  }

  function getConversationPanel() {
    return document.querySelector(".conversation-panel");
  }

  function getChatPanel() {
    return document.querySelector(".chat-panel");
  }

  function getChatView() {
    return document.getElementById("chatView");
  }

  function getChatEmpty() {
    return document.getElementById("chatEmpty");
  }

  function getActiveConversation() {
    return document.querySelector(
      ".conversation-item.active"
    );
  }

  function setMobileChatOpen(open) {
    const shell = getShell();
    if (!shell) return;

    if (!isMobile()) {
      shell.classList.remove("mobile-chat-open");
      return;
    }

    shell.classList.toggle(
      "mobile-chat-open",
      Boolean(open)
    );
  }

  function showInbox() {
    setMobileChatOpen(false);

    /*
     * Keep the underlying selected conversation intact.
     * This is navigation only; we do not alter application state.
     */
    window.setTimeout(function () {
      const search = document.getElementById(
        "conversationSearch"
      );

      if (
        isMobile() &&
        search &&
        !document.activeElement?.matches?.(
          "input,textarea"
        )
      ) {
        /* Intentionally no focus: avoids opening the mobile keyboard. */
      }
    }, 0);
  }

  function showChat() {
    if (!isMobile()) return;

    const active = getActiveConversation();

    /*
     * Only enter the chat screen when the existing specialist
     * has actually selected a conversation.
     */
    if (!active) return;

    setMobileChatOpen(true);
  }

  function ensureBackButton() {
    const header = document.querySelector(".chat-header");
    if (!header) return null;

    let button = document.getElementById(
      "glimeMobileWaBack"
    );

    if (button) return button;

    button = document.createElement("button");
    button.type = "button";
    button.id = "glimeMobileWaBack";
    button.className = "glime-wa-mobile-back";
    button.setAttribute(
      "aria-label",
      "Back to conversations"
    );
    button.title = "Back to conversations";
    button.textContent = "‹";

    header.insertBefore(button, header.firstChild);

    button.addEventListener("click", function () {
      showInbox();
    });

    return button;
  }

  function getOrCreateContextButton() {
    const header = document.querySelector(".chat-header");
    if (!header) return null;

    /*
     * Prefer the existing context addon button if it already exists.
     * This preserves its existing data-loading behavior.
     */
    const existing = document.getElementById(
      "glimeWaContextTrigger"
    );

    if (existing) {
      existing.classList.add(
        "glime-wa-mobile-context-button"
      );
      existing.textContent = "Context";
      return existing;
    }

    /*
     * Fallback: create a small trigger that opens the existing
     * context modal created by whatsapp-sales-context-addon.js.
     */
    let button = document.getElementById(
      "glimeMobileWaContext"
    );

    if (button) return button;

    button = document.createElement("button");
    button.type = "button";
    button.id = "glimeMobileWaContext";
    button.className =
      "ghost-btn glime-wa-mobile-context-button";
    button.textContent = "Context";
    button.setAttribute(
      "aria-label",
      "Open customer context"
    );

    button.addEventListener("click", function () {
      const existingTrigger =
        document.getElementById(
          "glimeWaContextTrigger"
        );

      if (existingTrigger) {
        existingTrigger.click();
        return;
      }

      const modal = document.getElementById(
        "glimeWaContextModal"
      );

      if (modal) {
        modal.classList.remove("hidden");
      }
    });

    header.appendChild(button);

    return button;
  }

  function improveExistingContextTrigger() {
    const button = getOrCreateContextButton();

    if (!button) return;

    /*
     * The existing context addon may be loaded slightly later.
     * We keep this purely presentational.
     */
    button.classList.add(
      "glime-wa-mobile-context-button"
    );

    if (
      button.id === "glimeWaContextTrigger" ||
      button.id === "glimeMobileWaContext"
    ) {
      button.textContent = "Context";
    }
  }

  function closeContextModal() {
    const modal = document.getElementById(
      "glimeWaContextModal"
    );

    if (modal) {
      modal.classList.add("hidden");
    }
  }

  function bindModalEscape() {
    if (window.__glimeWaMobileEscapeBound) {
      return;
    }

    window.__glimeWaMobileEscapeBound = true;

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;

      const modal = document.getElementById(
        "glimeWaContextModal"
      );

      if (modal && !modal.classList.contains("hidden")) {
        closeContextModal();
      }
    });
  }

  function bindConversationClicks() {
    const list = document.getElementById(
      "conversationList"
    );

    if (!list) return;

    /*
     * Event delegation means this continues working when the
     * existing specialist rerenders conversation rows.
     */
    if (list.dataset.glimeMobileBound === "1") {
      return;
    }

    list.dataset.glimeMobileBound = "1";

    list.addEventListener("click", function (event) {
      const item = event.target.closest(
        ".conversation-item"
      );

      if (!item) return;

      /*
       * Let the original click handler finish first.
       * It owns selection, message loading and data state.
       */
      window.setTimeout(function () {
        showChat();
        improveExistingContextTrigger();
      }, 0);
    });
  }

  function syncFromExistingSelection() {
    if (!isMobile()) {
      setMobileChatOpen(false);
      return;
    }

    const active = getActiveConversation();

    /*
     * The main specialist owns selection. We only mirror its
     * rendered active row into mobile navigation state.
     */
    if (active) {
      showChat();
    }
  }

  function syncUi() {
    loadCssOnce();
    ensureBackButton();
    improveExistingContextTrigger();
    bindConversationClicks();
    bindModalEscape();
    syncFromExistingSelection();
  }

  function startObserver() {
    if (window.__glimeWaMobileObserverStarted) {
      return;
    }

    window.__glimeWaMobileObserverStarted = true;

    /*
     * The specialist dynamically renders:
     *   - conversation rows
     *   - chat header
     *   - context trigger
     *
     * We observe only DOM structure. No application data is changed.
     */
    const observer = new MutationObserver(function () {
      syncUi();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.__glimeWaMobileObserver = observer;
  }

  function bindResize() {
    if (window.__glimeWaMobileResizeBound) {
      return;
    }

    window.__glimeWaMobileResizeBound = true;

    window.addEventListener(
      "resize",
      function () {
        if (!isMobile()) {
          setMobileChatOpen(false);
          closeContextModal();
          return;
        }

        syncUi();
      },
      { passive: true }
    );
  }

  function boot() {
    loadCssOnce();
    syncUi();
    startObserver();
    bindResize();

    /*
     * A few delayed syncs cover script-order timing without
     * touching the original specialist implementation.
     */
    window.setTimeout(syncUi, 150);
    window.setTimeout(syncUi, 500);
    window.setTimeout(syncUi, 1000);

    console.log(
      "[GLIME WA Mobile] UI addon loaded."
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      boot,
      { once: true }
    );
  } else {
    boot();
  }
})();
