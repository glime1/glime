(function () {
  "use strict";

  /*
   * GLIME SERVICES — STEP 1
   *
   * Purpose:
   * Entry page for the new guided business-setup wizard.
   *
   * Important:
   * - No Industry logic here.
   * - No Business Model logic here.
   * - No Template logic here.
   * - No Entity logic here.
   * - No database writes here.
   *
   * The next page owns Industry selection.
   */

  const $ = (id) => document.getElementById(id);

  const nextBtn = $("nextBtn");
  const badge = $("clientBadge");
  const message = $("message");


  /* =========================================================
     MESSAGE
     ========================================================= */

  function showMessage(text) {
    if (!message) {
      return;
    }

    message.hidden = false;
    message.textContent = text;
  }


  /* =========================================================
     EXISTING GLIME CLIENT CONTEXT
     ========================================================= */

  function getClientContext() {
    const state =
      window.GLIME_SERVICES_STATE;

    if (
      !state ||
      !state.client
    ) {
      return null;
    }

    return state.client;
  }


  /* =========================================================
     CLIENT BADGE
     ========================================================= */

  function updateClientBadge() {
    if (!badge) {
      return;
    }

    const client =
      getClientContext();

    if (!client) {
      badge.textContent =
        "Business setup";

      return;
    }

    badge.textContent =
      client.project_name ||
      client.client_id ||
      "Business setup";
  }


  /* =========================================================
     STEP 1 → STEP 2
     ========================================================= */

  function goToIndustry() {

    if (!nextBtn) {
      return;
    }

    nextBtn.disabled = true;

    nextBtn.innerHTML =
      'Opening…';

    /*
     * Step 2 owns the Industry selection.
     *
     * No database configuration is performed here.
     * The next page will load the Industry catalog.
     */

    window.location.href =
      "services-industry.html";
  }


  /* =========================================================
     EVENTS
     ========================================================= */

  if (nextBtn) {
    nextBtn.addEventListener(
      "click",
      goToIndustry
    );
  }


  /* =========================================================
     INITIAL STATE
     ========================================================= */

  updateClientBadge();


  /*
   * The existing GLIME client context may load
   * asynchronously, so refresh the badge after startup.
   */

  window.setTimeout(
    updateClientBadge,
    500
  );

  window.setTimeout(
    updateClientBadge,
    1500
  );

})();
