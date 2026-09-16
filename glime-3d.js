/* =========================================================
   GLIME 3D HERO ADD-ON
   Auto-mounts inside .ai-preview
   No external library required.
========================================================= */

(function () {
  "use strict";

  function initGlime3D() {
    const preview = document.querySelector(".ai-preview");

    if (!preview || preview.querySelector(".glime-3d-addon")) {
      return;
    }

    const label = preview.querySelector(".preview-label");
    const workflow = preview.querySelector(".workflow");

    const addon = document.createElement("div");
    addon.className = "glime-3d-addon";
    addon.setAttribute(
      "aria-label",
      "GLIME AI business system visualization"
    );

    addon.innerHTML = `
      <div class="glime-3d-stage">
        <div class="glime-3d-ring"></div>
        <div class="glime-3d-ring ring-two"></div>

        <div class="glime-3d-core" aria-label="GLIME AI">
          GLIME
          <span>AI SYSTEM</span>
        </div>

        <div class="glime-3d-line" style="--length: 105px; --line-angle: 0deg;"></div>
        <div class="glime-3d-line" style="--length: 105px; --line-angle: 60deg;"></div>
        <div class="glime-3d-line" style="--length: 105px; --line-angle: 120deg;"></div>
        <div class="glime-3d-line" style="--length: 105px; --line-angle: 180deg;"></div>
        <div class="glime-3d-line" style="--length: 105px; --line-angle: 240deg;"></div>
        <div class="glime-3d-line" style="--length: 105px; --line-angle: 300deg;"></div>

        <div class="glime-3d-node"
          style="--angle: 0deg; --distance: 145px; --depth: 20px; --delay: 0s;">
          PROBLEM
          <small>IDENTIFY</small>
        </div>

        <div class="glime-3d-node"
          style="--angle: 60deg; --distance: 145px; --depth: 55px; --delay: .5s;">
          BUSINESS
          <small>UNDERSTAND</small>
        </div>

        <div class="glime-3d-node"
          style="--angle: 120deg; --distance: 145px; --depth: 25px; --delay: 1s;">
          AI
          <small>DIAGNOSE</small>
        </div>

        <div class="glime-3d-node"
          style="--angle: 180deg; --distance: 145px; --depth: 50px; --delay: 1.5s;">
          SYSTEM
          <small>DESIGN</small>
        </div>

        <div class="glime-3d-node"
          style="--angle: 240deg; --distance: 145px; --depth: 25px; --delay: 2s;">
          ACTION
          <small>AUTOMATE</small>
        </div>

        <div class="glime-3d-node"
          style="--angle: 300deg; --distance: 145px; --depth: 55px; --delay: 2.5s;">
          RESULT
          <small>OUTCOME</small>
        </div>

        <div class="glime-3d-status">
          <i aria-hidden="true"></i>
          BUSINESS → AI SYSTEM → ACTION
        </div>
      </div>
    `;

    if (workflow) {
      workflow.parentNode.insertBefore(addon, workflow);
    } else if (label) {
      label.insertAdjacentElement("afterend", addon);
    } else {
      preview.prepend(addon);
    }

    const stage = addon.querySelector(".glime-3d-stage");

    const canHover =
      window.matchMedia("(hover: hover) and (pointer: fine)").matches;

    if (stage && canHover) {
      preview.addEventListener("pointermove", function (event) {
        const rect = preview.getBoundingClientRect();

        const x =
          (event.clientX - rect.left) / rect.width - 0.5;

        const y =
          (event.clientY - rect.top) / rect.height - 0.5;

        const rotateY = Math.max(-5, Math.min(5, x * 10));
        const rotateX = Math.max(-4, Math.min(4, y * -8));

        stage.style.transform =
          "rotateX(" +
          rotateX +
          "deg) rotateY(" +
          rotateY +
          "deg)";
      });

      preview.addEventListener("pointerleave", function () {
        stage.style.transform =
          "rotateX(0deg) rotateY(0deg)";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initGlime3D,
      { once: true }
    );
  } else {
    initGlime3D();
  }
})();
