(function () {

  /* GLIME AI floating button */
  if (!document.getElementById("glime-ai-float")) {
    const style = document.createElement("style");

    style.textContent = `
      .glime-ai-float {
        position: fixed;
        right: 18px;
        bottom: 88px;
        z-index: 901;

        height: 36px;
        padding: 0 10px;

        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;

        color: #031014;
        background: linear-gradient(105deg, #50f5a8, #52e8ff);

        border: 2px solid rgba(7,16,22,0.85);
        border-radius: 999px;

        font-size: 10px;
        font-weight: 900;
        text-decoration: none;

        box-shadow: 0 6px 20px rgba(82,232,255,0.18);
        transition: transform 0.2s ease;
      }

      .glime-ai-float:hover {
        transform: translateY(-2px);
      }

      @media (max-width: 480px) {
        .glime-ai-float {
          right: 14px;
          bottom: 80px;
          height: 34px;
          padding: 0 9px;
          font-size: 9px;
        }
      }
    `;

    document.head.appendChild(style);

    const link = document.createElement("a");

    link.id = "glime-ai-float";
    link.className = "glime-ai-float";
    link.href = "glime-ai.html";
    link.setAttribute("aria-label", "Open GLIME AI");

    link.innerHTML =
      '<span aria-hidden="true">✦</span><span>GLIME AI</span>';

    document.body.appendChild(link);
  }


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
