(function () {

  /* Cookie consent banner (loads once on every page that uses the global nav) */
  if (!window.GLIME_COOKIE_CONSENT && !document.getElementById("glime-cookie-consent-js")) {
    const cc = document.createElement("script");
    cc.id = "glime-cookie-consent-js";
    cc.src = "cookie-consent.js?v=1";
    cc.async = true;
    document.head.appendChild(cc);
  }

  /* GLIME AI floating button (3D orb). Not shown on the GLIME AI screen itself. */
  if (
    !document.getElementById("glime-ai-float") &&
    !document.body.classList.contains("ai-app-page")
  ) {
    const style = document.createElement("style");

    style.textContent = `
      .glime-ai-float {
        position: fixed;
        right: 14px;
        bottom: 88px;
        z-index: 901;

        height: 46px;
        padding: 0 16px 0 7px;

        display: inline-flex;
        align-items: center;
        gap: 9px;

        color: #eafcff;
        text-decoration: none;
        font-family: Manrope, Arial, sans-serif;

        background: linear-gradient(150deg, rgba(26,50,66,0.95), rgba(7,16,22,0.97));
        border: 1px solid rgba(82,232,255,0.45);
        border-radius: 999px;

        box-shadow:
          0 12px 28px rgba(0,0,0,0.55),
          0 0 26px rgba(82,232,255,0.22),
          inset 0 1px 0 rgba(255,255,255,0.2),
          inset 0 -6px 12px rgba(0,0,0,0.35);

        perspective: 500px;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }

      .glime-ai-float:hover {
        transform: translateY(-3px);
        box-shadow:
          0 16px 34px rgba(0,0,0,0.6),
          0 0 34px rgba(82,232,255,0.38),
          inset 0 1px 0 rgba(255,255,255,0.25),
          inset 0 -6px 12px rgba(0,0,0,0.35);
      }

      .glime-ai-float:active {
        transform: scale(0.97);
      }

      .glime-ai-orb {
        position: relative;
        width: 34px;
        height: 34px;
        flex: 0 0 34px;
        transform-style: preserve-3d;
        animation: glime-ai-bob 4.2s ease-in-out infinite;
      }

      .glime-ai-sphere {
        position: absolute;
        inset: 6px;

        display: grid;
        place-items: center;

        color: #05202a;
        font-size: 11px;
        font-weight: 900;
        line-height: 1;

        background: radial-gradient(circle at 32% 26%, #ffffff 0, #c9fdff 12%, #52e8ff 36%, #1b8aa3 68%, #07242e 100%);
        border-radius: 50%;
        box-shadow:
          0 0 14px rgba(82,232,255,0.75),
          inset -3px -4px 7px rgba(0,0,0,0.45);
      }

      .glime-ai-ring {
        position: absolute;
        inset: 0;
        border: 1.5px solid transparent;
        border-top-color: #50f5a8;
        border-bottom-color: rgba(82,232,255,0.55);
        border-radius: 50%;
        animation: glime-ai-orbit-a 3.4s linear infinite;
      }

      .glime-ai-ring.r2 {
        inset: 2px;
        border-top-color: #a68cff;
        border-bottom-color: rgba(166,140,255,0.5);
        animation: glime-ai-orbit-b 5s linear infinite;
      }

      .glime-ai-label {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      .glime-ai-label b {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.03em;
        line-height: 1;
      }

      .glime-ai-label small {
        display: flex;
        align-items: center;
        gap: 4px;
        color: #9cabb9;
        font-size: 8.5px;
        font-weight: 700;
        line-height: 1;
      }

      .glime-ai-label small::before {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: #50f5a8;
        box-shadow: 0 0 8px #50f5a8;
      }

      @keyframes glime-ai-orbit-a {
        from { transform: rotateX(68deg) rotateZ(0deg); }
        to   { transform: rotateX(68deg) rotateZ(360deg); }
      }

      @keyframes glime-ai-orbit-b {
        from { transform: rotateY(68deg) rotateZ(360deg); }
        to   { transform: rotateY(68deg) rotateZ(0deg); }
      }

      @keyframes glime-ai-bob {
        0%, 100% { transform: translateY(0) rotateY(-12deg); }
        50%      { transform: translateY(-2px) rotateY(12deg); }
      }

      @media (max-width: 480px) {
        .glime-ai-float {
          right: 12px;
          bottom: 80px;
          height: 42px;
          padding: 0 14px 0 6px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .glime-ai-orb,
        .glime-ai-ring { animation: none; }
        .glime-ai-float { transition: none; }
      }
    `;

    document.head.appendChild(style);

    const link = document.createElement("a");

    link.id = "glime-ai-float";
    link.className = "glime-ai-float";
    link.href = "glime-ai.html";
    link.setAttribute("aria-label", "Open GLIME AI");

    link.innerHTML =
      '<span class="glime-ai-orb" aria-hidden="true">' +
        '<span class="glime-ai-ring"></span>' +
        '<span class="glime-ai-ring r2"></span>' +
        '<span class="glime-ai-sphere">✦</span>' +
      '</span>' +
      '<span class="glime-ai-label"><b>GLIME AI</b><small>Ask anything</small></span>';

    document.body.appendChild(link);
  }


  /* Partner Program link in the public navigation */
  (function () {
    function addPartnerLink(nav) {
      if (!nav || nav.querySelector('a[href="partner.html"]')) return;
      const a = document.createElement("a");
      a.href = "partner.html";
      a.textContent = "Partner Program";
      nav.insertBefore(a, nav.querySelector('a[href="contact.html"]'));
    }
    addPartnerLink(document.querySelector(".glime-desktop-nav"));
    addPartnerLink(document.getElementById("glime-mobile-nav"));
  })();


  /* Sign Up link next to Login in the public navigation */
  (function () {
    function addSignupLink(nav) {
      if (!nav || nav.querySelector("a[data-nav-signup]")) return;
      const login = nav.querySelector('a[href="login.html"]');
      if (!login) return;
      const a = document.createElement("a");
      a.href = "signup.html";
      a.textContent = "Sign Up";
      a.setAttribute("data-nav-signup", "1");
      login.insertAdjacentElement("afterend", a);
    }
    addSignupLink(document.querySelector(".glime-desktop-nav"));
    addSignupLink(document.getElementById("glime-mobile-nav"));
  })();


  /* Existing GLIME mobile navigation */
  const button = document.getElementById("glime-menu-button");
  const menu = document.getElementById("glime-mobile-nav");
  if (!button || !menu) return;

  function setOpen(open) {
    menu.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute(
      "aria-label",
      open ? "Close navigation menu" : "Open navigation menu"
    );
  }

  button.addEventListener("click", function () {
    setOpen(!menu.classList.contains("open"));
  });

  menu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") setOpen(false);
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 860) setOpen(false);
  });

  document.addEventListener("click", function (event) {
    if (!menu.classList.contains("open")) return;

    if (
      !menu.contains(event.target) &&
      !button.contains(event.target)
    ) {
      setOpen(false);
    }
  });
})();
