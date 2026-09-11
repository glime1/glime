/* GLIME Lookbook Engine
 * Reusable customer-site integration.
 */

(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var targetId = script.dataset.target || "glime-lookbook";
  var slug = script.dataset.slug || "";
  var target = document.getElementById(targetId);

  if (!target) {
    console.error(
      "GLIME Lookbook Engine: target element not found:",
      targetId
    );
    return;
  }

  if (!slug) {
    var params = new URLSearchParams(window.location.search);
    slug =
      params.get("lookbook") ||
      params.get("slug") ||
      "";
  }

  if (!slug) {
    target.innerHTML =
      '<div style="padding:20px;text-align:center;font-family:Arial,sans-serif;color:#777">' +
      "Lookbook is not configured." +
      "</div>";
    return;
  }

  var base =
    script.dataset.base ||
    "https://glime.online/public-lookbook.html";

  var url = new URL(base);
  url.searchParams.set("slug", slug);

  var frame = document.createElement("iframe");

  frame.src = url.toString();
  frame.title = "Lookbook";
  frame.loading = "lazy";

  frame.style.width = "100%";
  frame.style.minHeight =
    script.dataset.minHeight || "900px";
  frame.style.border = "0";
  frame.style.display = "block";
  frame.style.background = "transparent";

  frame.setAttribute(
    "allow",
    "clipboard-write; web-share"
  );

  target.innerHTML = "";
  target.appendChild(frame);
})();
