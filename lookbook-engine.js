
/* GLIME Lookbook Engine
 * Reusable customer-site integration.
 * Resolves the current website domain to its published GLIME Lookbook.
 */

(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var targetId = script.dataset.target || "glime-lookbook";
  var target = document.getElementById(targetId);

  var SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  var SUPABASE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  if (!target) {
    console.error(
      "GLIME Lookbook Engine: target element not found:",
      targetId
    );
    return;
  }

  function show(message) {
    target.innerHTML =
      '<div style="padding:20px;text-align:center;font-family:Arial,sans-serif;color:#777">' +
      message +
      "</div>";
  }

  function getDomain() {
    return window.location.hostname
      .toLowerCase()
      .replace(/^www\./, "");
  }

  async function resolveLookbook() {
    var response = await fetch(
      SUPABASE_URL +
        "/rest/v1/rpc/get_public_lookbook_by_domain",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: "Bearer " + SUPABASE_KEY
        },

        body: JSON.stringify({
          p_domain: getDomain()
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        "Unable to resolve Lookbook domain"
      );
    }

    var data = await response.json();

    if (!Array.isArray(data) || !data.length) {
      return null;
    }

    return data[0];
  }

  async function init() {
    try {
      var resolved = await resolveLookbook();

      /*
       * Backward-compatible manual slug option.
       * This is useful for testing before domain mapping
       * is configured for a particular boutique.
       */

      if (!resolved) {
        var params =
          new URLSearchParams(window.location.search);

        var manualSlug =
          script.dataset.slug ||
          params.get("lookbook") ||
          params.get("slug") ||
          "";

        if (!manualSlug) {
          show(
            "Lookbook is not configured for this website."
          );
          return;
        }

        resolved = {
          slug: manualSlug
        };
      }

      var base =
        script.dataset.base ||
        "https://glime.online/public-lookbook.html";

      var url = new URL(base);

      /*
       * Current public-lookbook.html works with slug.
       * Therefore, when the domain mapping returns only
       * client/lookbook IDs, we resolve the public page
       * through the configured slug when available.
       */

      if (resolved.slug) {
        url.searchParams.set(
          "slug",
          resolved.slug
        );
      } else {
        /*
         * Reserved for the next public-lookbook engine
         * version which will accept lookbook_id directly.
         */
        url.searchParams.set(
          "lookbook_id",
          resolved.lookbook_id
        );
      }

      var frame =
        document.createElement("iframe");

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

    } catch (error) {

      console.error(
        "GLIME Lookbook Engine:",
        error
      );

      show("Unable to load Lookbook.");
    }
  }

  init();

})();
