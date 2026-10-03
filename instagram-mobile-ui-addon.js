/*
 * GLIME — Instagram Mobile UI Add-on
 * SAFE / SELF-CONTAINED VERSION
 *
 * UI ONLY.
 * - No Supabase/API/AI/auth calls
 * - Does not replace Instagram sales logic
 * - Uses existing conversation selection, message list and send controls
 * - Mobile navigation is an off-canvas menu
 * - Mobile chat is styled as a native DM-like conversation surface
 */
(function () {
  "use strict";

  var BREAKPOINT = 720;
  var started = false;

  function mobile() {
    return window.matchMedia
      ? window.matchMedia("(max-width:" + BREAKPOINT + "px)").matches
      : window.innerWidth <= BREAKPOINT;
  }

  function shell() {
    return document.querySelector(".workspace");
  }

  function activeConversation() {
    return document.querySelector(".conversation-item.active");
  }

  function setChat(open) {
    var s = shell();

    if (!s) {
      return;
    }

    if (!mobile()) {
      s.classList.remove("ig-mobile-chat-open");
      return;
    }

    s.classList.toggle("ig-mobile-chat-open", !!open);
  }

  function injectCss() {
    if (document.getElementById("glimeInstagramMobileCss")) {
      return;
    }

    var link = document.createElement("link");

    link.id = "glimeInstagramMobileCss";
    link.rel = "stylesheet";
    link.href = "instagram-mobile-ui-addon.css";

    document.head.appendChild(link);
  }

  function addMenuButton() {
    var topbar = document.querySelector(".topbar");

    if (
      !topbar ||
      document.getElementById("glimeIgMobileMenu")
    ) {
      return;
    }

    var b = document.createElement("button");

    b.type = "button";
    b.id = "glimeIgMobileMenu";
    b.className = "ig-mobile-menu-button";
    b.setAttribute(
      "aria-label",
      "Open GLIME menu"
    );

    b.innerHTML = "☰";

    b.onclick = function () {
      document.body.classList.add(
        "ig-menu-open"
      );
    };

    topbar.insertBefore(
      b,
      topbar.firstElementChild
    );
  }

  function buildMenuDrawer() {
    if (
      document.getElementById(
        "glimeIgMobileDrawer"
      )
    ) {
      return;
    }

    var overlay =
      document.createElement("div");

    overlay.id =
      "glimeIgMobileOverlay";

    overlay.className =
      "ig-mobile-menu-overlay";

    var drawer =
      document.createElement("aside");

    drawer.id =
      "glimeIgMobileDrawer";

    drawer.className =
      "ig-mobile-drawer";

    drawer.setAttribute(
      "aria-label",
      "GLIME navigation"
    );

    var sidebar =
      document.querySelector(
        ".sidebar"
      );

    var nav =
      sidebar
        ? sidebar.querySelector("nav")
        : null;

    drawer.innerHTML =
      '<div class="ig-mobile-drawer-head">' +
        '<img src="glime_logo_clean.svg" alt="GLIME">' +
        '<button type="button" id="glimeIgMobileMenuClose" aria-label="Close menu">×</button>' +
      '</div>' +

      '<div class="ig-mobile-drawer-caption">' +
        'AI BUSINESS WORKSPACE' +
      '</div>' +

      '<nav class="ig-mobile-drawer-nav"></nav>' +

      '<div class="ig-mobile-drawer-bottom">' +
        '<div class="ig-mobile-workspace">' +
          '<span></span>' +
          '<div>' +
            '<b id="igMobileBusiness">Business</b>' +
            '<small id="igMobileClient">Workspace</small>' +
          '</div>' +
        '</div>' +

        '<button type="button" id="igMobileLogout">' +
          'Secure Logout' +
        '</button>' +
      '</div>';

    var targetNav =
      drawer.querySelector(
        ".ig-mobile-drawer-nav"
      );

    if (nav) {
      Array.prototype.forEach.call(
        nav.querySelectorAll("a"),
        function (a) {

          var item =
            document.createElement("a");

          item.href =
            a.getAttribute("href") || "#";

          item.innerHTML =
            a.innerHTML;

          if (
            a.classList.contains("active")
          ) {
            item.classList.add("active");
          }

          item.addEventListener(
            "click",
            function () {
              document.body.classList.remove(
                "ig-menu-open"
              );
            }
          );

          targetNav.appendChild(item);
        }
      );
    }

    document.body.appendChild(
      overlay
    );

    document.body.appendChild(
      drawer
    );

    overlay.addEventListener(
      "click",
      function () {
        document.body.classList.remove(
          "ig-menu-open"
        );
      }
    );

    document.getElementById(
      "glimeIgMobileMenuClose"
    ).onclick = function () {
      document.body.classList.remove(
        "ig-menu-open"
      );
    };

    var logout =
      document.getElementById(
        "logout"
      );

    document.getElementById(
      "igMobileLogout"
    ).onclick = function () {

      if (logout) {
        logout.click();
      }

    };
  }

  function syncWorkspaceIdentity() {
    var business =
      document.getElementById(
        "businessName"
      );

    var client =
      document.getElementById(
        "clientId"
      );

    var b =
      document.getElementById(
        "igMobileBusiness"
      );

    var c =
      document.getElementById(
        "igMobileClient"
      );

    if (business && b) {
      b.textContent =
        business.textContent;
    }

    if (client && c) {
      c.textContent =
        client.textContent;
    }
  }

  function addBackButton() {
    var header =
      document.querySelector(
        ".chat-header"
      );

    if (
      !header ||
      document.getElementById(
        "glimeIgMobileBack"
      )
    ) {
      return;
    }

    var b =
      document.createElement(
        "button"
      );

    b.type = "button";

    b.id =
      "glimeIgMobileBack";

    b.className =
      "ig-mobile-back";

    b.setAttribute(
      "aria-label",
      "Back to Instagram conversations"
    );

    b.innerHTML = "‹";

    b.onclick =
      function (e) {

        e.preventDefault();

        e.stopPropagation();

        setChat(false);
      };

    header.insertBefore(
      b,
      header.firstElementChild
    );
  }

  function addChatHeaderActions() {
    var actions =
      document.querySelector(
        ".chat-actions"
      );

    if (
      !actions ||
      document.getElementById(
        "glimeIgHeaderCall"
      )
    ) {
      return;
    }

    [
      [
        "glimeIgHeaderCall",
        "☎",
        "Call"
      ],
      [
        "glimeIgHeaderVideo",
        "▣",
        "Video call"
      ],
      [
        "glimeIgHeaderTag",
        "◇",
        "Customer tag"
      ]
    ].forEach(
      function (item) {

        var b =
          document.createElement(
            "button"
          );

        b.type = "button";

        b.id = item[0];

        b.className =
          "ig-chat-icon";

        b.setAttribute(
          "aria-label",
          item[2]
        );

        b.textContent =
          item[1];

        /*
         * UI-only controls.
         * No action is executed.
         */

        actions.insertBefore(
          b,
          actions.firstChild
        );
      }
    );
  }

  function addComposerChrome() {
    var composer =
      document.querySelector(
        ".composer"
      );

    var textarea =
      document.getElementById(
        "input"
      );

    if (
      !composer ||
      !textarea ||
      document.getElementById(
        "glimeIgComposerRow"
      )
    ) {
      return;
    }

    var row =
      document.createElement(
        "div"
      );

    row.id =
      "glimeIgComposerRow";

    row.className =
      "ig-composer-row";

    var camera =
      document.createElement(
        "button"
      );

    camera.type = "button";

    camera.className =
      "ig-composer-icon";

    camera.setAttribute(
      "aria-label",
      "Camera"
    );

    camera.textContent =
      "◉";

    var gallery =
      document.createElement(
        "button"
      );

    gallery.type = "button";

    gallery.className =
      "ig-composer-icon";

    gallery.setAttribute(
      "aria-label",
      "Gallery"
    );

    gallery.textContent =
      "▧";

    var plus =
      document.createElement(
        "button"
      );

    plus.type = "button";

    plus.className =
      "ig-composer-icon ig-plus";

    plus.setAttribute(
      "aria-label",
      "More"
    );

    plus.textContent =
      "+";

    textarea.parentNode.insertBefore(
      row,
      textarea
    );

    row.appendChild(
      camera
    );

    row.appendChild(
      gallery
    );

    row.appendChild(
      textarea
    );

    row.appendChild(
      plus
    );

    var bottom =
      composer.querySelector(
        ".composer-bottom"
      );

    var send =
      document.getElementById(
        "send"
      );

    var suggest =
      document.getElementById(
        "suggest"
      );

    if (bottom) {
      bottom.classList.add(
        "ig-mobile-composer-bottom"
      );
    }

    if (suggest) {
      suggest.classList.add(
        "ig-mobile-suggest"
      );
    }

    if (send) {
      send.classList.add(
        "ig-mobile-send"
      );
    }

    [
      camera,
      gallery,
      plus
    ].forEach(
      function (b) {

        b.addEventListener(
          "click",
          function () {
            textarea.focus();
          }
        );

      }
    );
  }

  function bindConversationClicks() {
    var list =
      document.getElementById(
        "list"
      );

    if (
      !list ||
      list.getAttribute(
        "data-ig-mobile-bound"
      ) === "1"
    ) {
      return;
    }

    list.setAttribute(
      "data-ig-mobile-bound",
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

        window.setTimeout(
          function () {

            if (
              mobile() &&
              activeConversation()
            ) {

              addBackButton();

              addChatHeaderActions();

              addComposerChrome();

              setChat(true);
            }

          },
          0
        );
      }
    );
  }

  function syncState() {
    if (!mobile()) {

      document.body.classList.remove(
        "ig-menu-open"
      );

      setChat(false);

      return;
    }

    if (
      activeConversation()
    ) {

      addBackButton();

      addChatHeaderActions();

      addComposerChrome();

      setChat(true);
    }
  }

  function bindEscape() {
    if (
      window.__glimeIgMobileEscape
    ) {
      return;
    }

    window.__glimeIgMobileEscape =
      true;

    document.addEventListener(
      "keydown",
      function (e) {

        if (
          e.key !== "Escape"
        ) {
          return;
        }

        document.body.classList.remove(
          "ig-menu-open"
        );

        if (mobile()) {
          setChat(false);
        }
      }
    );
  }

  function start() {
    if (started) {
      return;
    }

    started = true;

    injectCss();

    addMenuButton();

    buildMenuDrawer();

    syncWorkspaceIdentity();

    addBackButton();

    addChatHeaderActions();

    addComposerChrome();

    bindConversationClicks();

    bindEscape();

    syncState();

    window.addEventListener(
      "resize",
      syncState,
      {
        passive: true
      }
    );

    console.log(
      "[GLIME IG Mobile] Safe mobile UI addon loaded."
    );
  }

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
