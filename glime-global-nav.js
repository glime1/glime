(function () {

  /* Cookie consent banner (loads once on every page that uses the global nav) */
  if (!window.GLIME_COOKIE_CONSENT && !document.getElementById("glime-cookie-consent-js")) {
    const cc = document.createElement("script");
    cc.id = "glime-cookie-consent-js";
    cc.src = "cookie-consent.js?v=1";
    cc.async = true;
    document.head.appendChild(cc);
  }

  /* App install (PWA): manifest + service worker, so the site can be installed as an app */
  if (!window.GLIME_PWA && !document.getElementById("glime-pwa-js")) {
    const pw = document.createElement("script");
    pw.id = "glime-pwa-js";
    pw.src = "glime-pwa.js?v=1";
    pw.async = true;
    document.head.appendChild(pw);
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


  /* Agency Program link in the public navigation (right after Partner Program) */
  (function () {
    function addAgencyLink(nav) {
      if (!nav || nav.querySelector('a[href="agency.html"]')) return;
      const a = document.createElement("a");
      a.href = "agency.html";
      a.textContent = "Agency Program";
      nav.insertBefore(a, nav.querySelector('a[href="contact.html"]'));
    }
    addAgencyLink(document.querySelector(".glime-desktop-nav"));
    addAgencyLink(document.getElementById("glime-mobile-nav"));
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


  /* =========================================================
     GLIME "SIGNAL LINE" MOBILE MENU
     A small panel where a pulse of light travels down a line and
     lights up each page in turn, like a message moving through
     the GLIME journey. It is built from the links already in the
     legacy mobile nav and is fully self-contained, so page-level
     styles cannot break it.
  ========================================================= */
  const button = document.getElementById("glime-menu-button");
  const legacy = document.getElementById("glime-mobile-nav");
  if (!button || !legacy) return;

  /* split the existing links into: pages, account, trial button */
  const pages = [];
  const account = [];
  let trial = null;

  Array.prototype.slice.call(legacy.querySelectorAll("a")).forEach(function (a) {
    if (a.classList.contains("glime-mobile-cta")) { trial = a; return; }
    const href = a.getAttribute("href") || "";
    if (href === "login.html" || href === "signup.html") { account.push(a); } else { pages.push(a); }
  });

  const here = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  function isActive(a) {
    if (a.hash) return false;
    const file = (a.pathname.split("/").pop() || "index.html").toLowerCase();
    return file === here;
  }

  /* styles */
  const css = document.createElement("style");
  css.id = "glx-menu-css";
  css.textContent = `
    #glime-mobile-nav { display: none !important; }

    #glx-scrim {
      position: fixed; inset: 0; z-index: 9997;
      background: rgba(2,7,11,.62);
      -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
      opacity: 0; visibility: hidden;
      transition: opacity .25s ease, visibility 0s linear .25s;
    }
    #glx-scrim.open { opacity: 1; visibility: visible; transition: opacity .25s ease; }

    #glx-menu {
      position: fixed; z-index: 9998; right: 12px; top: 80px;
      width: min(272px, calc(100vw - 24px));
      max-height: calc(100vh - 96px); max-height: calc(100dvh - 96px);
      overflow-y: auto; overscroll-behavior: contain;
      padding: 14px 12px 12px;
      border-radius: 22px;
      background: linear-gradient(165deg, #10212c, #060d13);
      border: 1px solid rgba(120,220,235,.18);
      box-shadow: 0 30px 70px rgba(0,0,0,.7), 0 0 50px rgba(82,232,255,.07), inset 0 1px 0 rgba(255,255,255,.06);
      font-family: Manrope, Arial, sans-serif;
      opacity: 0; visibility: hidden;
      transform: translateY(-12px) scale(.95); transform-origin: top right;
      transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.25,1), visibility 0s linear .3s;
    }
    #glx-menu.open {
      opacity: 1; visibility: visible; transform: none;
      transition: opacity .2s ease, transform .3s cubic-bezier(.2,.9,.25,1), visibility 0s;
    }

    #glx-menu .glx-label {
      display: flex; align-items: center; gap: 7px; margin: 0 4px 10px;
      color: #6f8493; font: 500 .6rem/1 "DM Mono", monospace; letter-spacing: .16em;
    }
    #glx-menu .glx-label i {
      width: 6px; height: 6px; border-radius: 50%;
      background: #50f5a8; box-shadow: 0 0 8px #50f5a8;
    }

    /* the line and the travelling pulse */
    #glx-menu .glx-list { position: relative; display: grid; gap: 2px; }
    #glx-menu .glx-list::before {
      content: ""; position: absolute; left: 13px; top: 14px; bottom: 14px; width: 2px; border-radius: 2px;
      background: linear-gradient(#50f5a8, #52e8ff 62%, rgba(82,232,255,.12));
      transform: scaleY(0); transform-origin: top;
    }
    #glx-menu .glx-list::after {
      content: ""; position: absolute; left: 10px; top: 10px; width: 8px; height: 8px; border-radius: 50%;
      background: #fff; box-shadow: 0 0 14px 4px rgba(80,245,168,.85); opacity: 0;
    }
    #glx-menu.open .glx-list::before { animation: glx-line var(--dur) cubic-bezier(.4,0,.2,1) .05s forwards; }
    #glx-menu.open .glx-list::after  { animation: glx-pulse var(--dur) cubic-bezier(.4,0,.2,1) .05s forwards; }

    #glx-menu .glx-item {
      position: relative; display: flex; align-items: center;
      min-height: 36px; padding: 7px 10px 7px 36px; border-radius: 11px;
      color: #b2c2cd; text-decoration: none;
      font: 700 .82rem/1.2 Manrope, Arial, sans-serif;
      -webkit-tap-highlight-color: transparent;
      opacity: 0; transform: translateX(10px);
      transition: background .18s ease, color .18s ease;
    }
    #glx-menu .glx-item::before {
      content: ""; position: absolute; left: 10px; top: 50%; width: 8px; height: 8px; margin-top: -4px;
      border-radius: 50%; background: #1e303c; border: 1px solid #33505f;
    }
    #glx-menu .glx-item:active { background: rgba(255,255,255,.07); color: #fff; }
    #glx-menu .glx-item.glx-active { color: #fff; background: rgba(80,245,168,.07); }

    #glx-menu.open .glx-item {
      animation: glx-in .38s cubic-bezier(.2,.9,.25,1) forwards;
      animation-delay: calc(var(--i) * 55ms + 60ms);
    }
    #glx-menu.open .glx-item::before {
      animation: glx-node .5s ease forwards;
      animation-delay: calc(var(--i) * 55ms + 60ms);
    }
    #glx-menu.open .glx-item.glx-active::before { animation-name: glx-node-active; }

    /* account + trial */
    #glx-menu .glx-account {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
      margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(184,222,234,.1);
    }
    #glx-menu .glx-account a {
      display: flex; align-items: center; justify-content: center; min-height: 38px;
      border-radius: 11px; color: #dff5fa; text-decoration: none;
      font: 700 .8rem/1 Manrope, Arial, sans-serif;
      background: rgba(255,255,255,.05); border: 1px solid rgba(184,222,234,.14);
      -webkit-tap-highlight-color: transparent; opacity: 0;
    }
    #glx-menu .glx-account a:last-child:not(:only-child) {
      color: #50f5a8; background: rgba(80,245,168,.07); border-color: rgba(80,245,168,.4);
    }
    #glx-menu .glx-account a:only-child { grid-column: 1 / -1; }
    #glx-menu .glx-cta {
      position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 8px;
      min-height: 44px; margin-top: 8px; border-radius: 12px;
      color: #031014; text-decoration: none; font: 800 .84rem/1 Manrope, Arial, sans-serif;
      background: linear-gradient(105deg, #50f5a8, #52e8ff);
      box-shadow: 0 8px 22px rgba(80,245,168,.22);
      -webkit-tap-highlight-color: transparent; opacity: 0;
    }
    #glx-menu .glx-cta::after {
      content: ""; position: absolute; inset: 0;
      background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,.6) 50%, transparent 70%);
      transform: translateX(-120%); animation: glx-shine 3s ease-in-out 1.2s infinite;
    }
    #glx-menu.open .glx-account a,
    #glx-menu.open .glx-cta {
      animation: glx-in .38s cubic-bezier(.2,.9,.25,1) forwards;
      animation-delay: calc(var(--i) * 55ms + 60ms);
    }
    #glx-menu .glx-account a:active, #glx-menu .glx-cta:active { transform: scale(.97); }

    #glx-menu a:focus-visible { outline: 2px solid #52e8ff; outline-offset: 2px; }

    @keyframes glx-in    { from { opacity: 0; transform: translateX(10px); } to { opacity: 1; transform: none; } }
    @keyframes glx-line  { to { transform: scaleY(1); } }
    @keyframes glx-pulse { 0% { top: 10px; opacity: 1; } 88% { opacity: 1; } 100% { top: calc(100% - 18px); opacity: 0; } }
    @keyframes glx-node  {
      0%   { transform: scale(.5); background: #1e303c; }
      55%  { transform: scale(1.7); background: #50f5a8; box-shadow: 0 0 12px #50f5a8; }
      100% { transform: scale(1); background: #52e8ff; border-color: transparent; box-shadow: 0 0 6px rgba(82,232,255,.6); }
    }
    @keyframes glx-node-active {
      0%   { transform: scale(.5); background: #1e303c; }
      55%  { transform: scale(1.9); background: #50f5a8; box-shadow: 0 0 14px #50f5a8; }
      100% { transform: scale(1.2); background: #50f5a8; border-color: transparent; box-shadow: 0 0 0 4px rgba(80,245,168,.2), 0 0 12px #50f5a8; }
    }
    @keyframes glx-shine { 0%, 55% { transform: translateX(-120%); } 100% { transform: translateX(120%); } }

    @media (min-width: 861px) { #glx-menu, #glx-scrim { display: none !important; } }

    @media (prefers-reduced-motion: reduce) {
      #glx-menu, #glx-menu.open, #glx-scrim, #glx-scrim.open { transition: none; }
      #glx-menu .glx-item, #glx-menu .glx-account a, #glx-menu .glx-cta { opacity: 1; transform: none; animation: none !important; }
      #glx-menu .glx-item::before { animation: none !important; background: #52e8ff; border-color: transparent; }
      #glx-menu .glx-item.glx-active::before { background: #50f5a8; }
      #glx-menu .glx-list::before { transform: none; animation: none !important; }
      #glx-menu .glx-list::after, #glx-menu .glx-cta::after { display: none; }
    }
  `;
  document.head.appendChild(css);

  /* build the panel */
  const scrim = document.createElement("div");
  scrim.id = "glx-scrim";
  scrim.setAttribute("aria-hidden", "true");

  const panel = document.createElement("nav");
  panel.id = "glx-menu";
  panel.setAttribute("aria-label", "Site menu");

  const label = document.createElement("div");
  label.className = "glx-label";
  label.innerHTML = "<i></i>NAVIGATE";
  panel.appendChild(label);

  const list = document.createElement("div");
  list.className = "glx-list";
  panel.appendChild(list);

  let step = 0;

  function clone(a, cls) {
    const c = document.createElement("a");
    c.href = a.getAttribute("href");
    c.textContent = a.textContent.replace(/\s*[→>]\s*$/, "").trim();
    c.className = cls;
    c.style.setProperty("--i", String(step++));
    return c;
  }

  pages.forEach(function (a) {
    const c = clone(a, "glx-item");
    if (isActive(a)) c.classList.add("glx-active");
    list.appendChild(c);
  });

  list.style.setProperty("--dur", (pages.length * 55 + 250) + "ms");

  if (account.length) {
    const row = document.createElement("div");
    row.className = "glx-account";
    account.forEach(function (a) { row.appendChild(clone(a, "")); });
    panel.appendChild(row);
  }

  if (trial) {
    const t = clone(trial, "glx-cta");
    t.innerHTML = "";
    const txt = document.createElement("span");
    txt.textContent = trial.textContent.replace(/\s*[→>]\s*$/, "").trim();
    const arrow = document.createElement("span");
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "→";
    t.appendChild(txt);
    t.appendChild(arrow);
    panel.appendChild(t);
  }

  document.body.appendChild(scrim);
  document.body.appendChild(panel);

  /* open / close */
  function place() {
    const header = document.querySelector(".glime-global-header");
    const bottom = header ? header.getBoundingClientRect().bottom : 76;
    panel.style.top = Math.max(0, Math.round(bottom + 8)) + "px";
  }

  function isOpen() { return panel.classList.contains("open"); }

  function setOpen(open) {
    if (open) place();
    panel.classList.toggle("open", open);
    scrim.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
    button.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
  }

  button.setAttribute("aria-controls", "glx-menu");
  button.setAttribute("aria-expanded", "false");

  button.addEventListener("click", function (event) {
    event.stopPropagation();
    setOpen(!isOpen());
  });

  scrim.addEventListener("click", function () { setOpen(false); });

  panel.addEventListener("click", function (event) {
    if (event.target.closest("a")) setOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && isOpen()) {
      setOpen(false);
      button.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 860) { setOpen(false); } else if (isOpen()) { place(); }
  });
})();
