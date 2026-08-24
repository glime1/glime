(function () {
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