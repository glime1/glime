(() => {
  "use strict";

  const CENTER_URL = "glime-intelligence-center.html";
  const CARD_ID = "glime-intelligence-center-addon";

  function injectStyles() {
    if (
      document.getElementById(
        "glime-intelligence-center-addon-style"
      )
    ) {
      return;
    }

    const style = document.createElement("style");

    style.id =
      "glime-intelligence-center-addon-style";

    style.textContent = `
      #${CARD_ID} {
        margin: 30px 0;
        border: 1px solid rgba(0,240,255,.14);
        border-radius: 18px;
        overflow: hidden;
        background: #05080c;
        box-shadow: 0 12px 40px rgba(0,0,0,.18);
      }

      #${CARD_ID} .gic-addon-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        padding: 16px 18px;
        border-bottom: 1px solid rgba(255,255,255,.07);
        background: linear-gradient(
          135deg,
          rgba(0,255,136,.06),
          rgba(0,240,255,.04)
        );
      }

      #${CARD_ID} .gic-addon-title {
        font-weight: 700;
        color: #fff;
      }

      #${CARD_ID} .gic-addon-sub {
        margin-top: 3px;
        color: #9ca3af;
        font-size: 12px;
      }

      #${CARD_ID} .gic-addon-open {
        display: inline-block;
        padding: 8px 11px;
        border-radius: 9px;
        text-decoration: none;
        font-size: 12px;
        font-weight: 700;
        color: #061018;
        background: linear-gradient(
          135deg,
          #00ff88,
          #00f0ff
        );
        white-space: nowrap;
      }

      #${CARD_ID} iframe {
        display: block;
        width: 100%;
        min-height: 900px;
        border: 0;
        background: #05080c;
      }

      @media(max-width:700px) {
        #${CARD_ID} .gic-addon-head {
          align-items: flex-start;
          flex-direction: column;
        }

        #${CARD_ID} .gic-addon-open {
          width: 100%;
          text-align: center;
        }

        #${CARD_ID} iframe {
          min-height: 1200px;
        }
      }
    `;

    document.head.appendChild(style);
  }


  function mount() {

    if (
      document.getElementById(
        CARD_ID
      )
    ) {
      return;
    }

    const main =
      document.querySelector(
        ".main-content"
      ) ||
      document.querySelector("main") ||
      document.body;

    if (!main) {
      return;
    }

    injectStyles();

    const card =
      document.createElement(
        "section"
      );

    card.id = CARD_ID;

    card.innerHTML = `
      <div class="gic-addon-head">

        <div>
          <div class="gic-addon-title">
            🧠 GLIME Intelligence Center
          </div>

          <div class="gic-addon-sub">
            Impact · Insights · Evidence ·
            Decision & Action
          </div>
        </div>

        <a
          class="gic-addon-open"
          href="${CENTER_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Center →
        </a>

      </div>

      <iframe
        src="${CENTER_URL}"
        title="GLIME Intelligence Center"
        loading="lazy"
        referrerpolicy="same-origin"
      ></iframe>
    `;

    main.appendChild(card);
  }


  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      mount,
      { once: true }
    );

  } else {

    mount();

  }

})();
