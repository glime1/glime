/* =========================================================
   GLIME — SERVICES & OFFERS
   Client Approval Workflow Addon — P4

   Purpose:
   - Prevent client-side direct publishing.
   - Convert "Save & Publish" into "Submit for Review".
   - Submit the current draft version for Admin review.
   - Keep services.js untouched.
   - Never approve or publish from the client browser.

   Backend:
   - Supabase RLS protects draft/review/published states.
   - Admin approval/publishing is handled separately.
========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  const STYLE_ID =
    "glime-services-approval-addon-style";

  const PANEL_ID =
    "glime-services-approval-status";

  let db = null;
  let initialized = false;
  let submitting = false;

  function getDb() {
    if (db) return db;

    if (!window.supabase?.createClient) {
      throw new Error("Supabase library is not loaded.");
    }

    db = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    return db;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setStatus(message, type = "info") {
    let panel = document.getElementById(PANEL_ID);

    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;

      const form =
        document.getElementById("offerForm") ||
        document.querySelector("form");

      if (form?.parentNode) {
        form.parentNode.insertBefore(panel, form);
      } else {
        document.body.prepend(panel);
      }
    }

    panel.className =
      `glime-services-approval-status ${type}`;

    panel.textContent = message;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");

    style.id = STYLE_ID;

    style.textContent = `
      #${PANEL_ID} {
        margin: 0 0 14px;
        padding: 11px 13px;
        border-radius: 10px;
        border: 1px solid rgba(184,222,234,.13);
        background: rgba(16,27,41,.72);
        color: #9cabb9;
        font: 11px "DM Mono", monospace;
        line-height: 1.5;
      }

      #${PANEL_ID}.success {
        color: #50f5a8;
        border-color: rgba(80,245,168,.25);
        background: rgba(80,245,168,.045);
      }

      #${PANEL_ID}.warning {
        color: #f4fbfd;
        border-color: rgba(82,232,255,.25);
        background: rgba(82,232,255,.045);
      }

      #${PANEL_ID}.error {
        color: #ff9ba7;
        border-color: rgba(255,100,117,.3);
        background: rgba(255,100,117,.045);
      }

      .glime-submit-review-btn {
        position: relative;
      }

      .glime-submit-review-btn::after {
        content: "REVIEW";
        display: inline-block;
        margin-left: 7px;
        padding: 2px 5px;
        border-radius: 5px;
        font: 600 8px "DM Mono", monospace;
        letter-spacing: .05em;
        opacity: .75;
      }
    `;

    document.head.appendChild(style);
  }

  async function getClientId() {
    const client = getDb();

    const {
      data: {
        user
      },
      error: userError
    } = await client.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user?.id) {
      throw new Error("Active client session not found.");
    }

    const {
      data,
      error
    } = await client
      .from("client_data")
      .select("client_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data?.client_id) {
      throw new Error("Client account could not be resolved.");
    }

    return data.client_id;
  }

  /*
    Find the currently selected offer.

    The final services.js renders offer cards with data-offer-id.
    We deliberately support multiple possible selected states so
    this addon remains resilient to small UI changes.
  */
  function getSelectedOfferId() {
    const selectors = [
      ".offer-card.selected[data-offer-id]",
      "[data-offer-id].selected",
      ".offer-card.active[data-offer-id]",
      "[data-offer-id].active"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);

      if (element?.dataset?.offerId) {
        return element.dataset.offerId;
      }
    }

    /*
      Fallback:
      Look for a visible offer card around the editor.

      This does not guess an offer ID.
      It only accepts a real data-offer-id attribute.
    */
    const candidates = Array.from(
      document.querySelectorAll("[data-offer-id]")
    );

    const visible = candidates.find((element) => {
      const style = window.getComputedStyle(element);

      return (
        style.display !== "none" &&
        style.visibility !== "hidden"
      );
    });

    return visible?.dataset?.offerId || null;
  }

  async function getLatestDraftVersion(offerId, clientId) {
    const client = getDb();

    const {
      data,
      error
    } = await client
      .from("offer_versions")
      .select(
        "id,offer_id,version_number,status,title,created_at,updated_at"
      )
      .eq("offer_id", offerId)
      .order("version_number", {
        ascending: false
      })
      .limit(20);

    if (error) {
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];

    if (!rows.length) {
      throw new Error(
        "No version exists for this offer yet."
      );
    }

    /*
      Only drafts can be submitted by the client.
      We also verify the parent offer belongs to the current client.
    */
    const {
      data: offer,
      error: offerError
    } = await client
      .from("offers")
      .select("id,client_id,status,current_version_id")
      .eq("id", offerId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (offerError) {
      throw offerError;
    }

    if (!offer) {
      throw new Error(
        "Offer not found for the current client."
      );
    }

    const draft = rows.find(
      (row) => row.status === "draft"
    );

    if (!draft) {
      throw new Error(
        "There is no editable draft version to submit."
      );
    }

    return {
      offer,
      version: draft
    };
  }

  async function submitForReview() {
    if (submitting) {
      return;
    }

    submitting = true;

    const button =
      document.getElementById("savePublishBtn");

    const originalText =
      button?.textContent || "Submit for Review";

    if (button) {
      button.disabled = true;
      button.textContent = "Submitting...";
    }

    try {
      const clientId = await getClientId();

      const offerId = getSelectedOfferId();

      if (!offerId) {
        throw new Error(
          "Please select a Service or Offer first."
        );
      }

      const {
        offer,
        version
      } = await getLatestDraftVersion(
        offerId,
        clientId
      );

      if (version.status !== "draft") {
        throw new Error(
          "Only a draft version can be submitted for review."
        );
      }

      /*
        Client RLS allows:
        draft -> review

        It does NOT allow:
        review -> approved
        review -> published
      */
      const client = getDb();

      const {
        data,
        error
      } = await client
        .from("offer_versions")
        .update({
          status: "review"
        })
        .eq("id", version.id)
        .eq("offer_id", offer.id)
        .eq("status", "draft")
        .select(
          "id,offer_id,version_number,status,title"
        )
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error(
          "The draft could not be submitted. It may have changed already."
        );
      }

      setStatus(
        `Version ${data.version_number} submitted for Admin review.`,
        "success"
      );

      /*
        Refresh the main Services UI.
      */
      if (
        typeof window.GLIMEServices?.refresh ===
        "function"
      ) {
        await window.GLIMEServices.refresh();
      }

      /*
        Refresh the AI context card.
        Published catalog should remain unchanged because
        review versions are excluded by the resolver.
      */
      if (
        typeof window.GLIMEServicesAIContext?.refresh ===
        "function"
      ) {
        await window.GLIMEServicesAIContext.refresh();
      }

    } catch (error) {
      console.error(
        "GLIME Services review submission failed:",
        error
      );

      setStatus(
        error?.message ||
          "Unable to submit the version for review.",
        "error"
      );

    } finally {
      submitting = false;

      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  }

  function convertPublishButton() {
    const button =
      document.getElementById("savePublishBtn");

    if (!button) {
      return false;
    }

    /*
      Do not allow the old services.js publish handler
      to run.

      Capture phase is intentional.
    */
    if (!button.dataset.glimeApprovalBound) {
      button.dataset.glimeApprovalBound = "true";

      button.addEventListener(
        "click",
        async (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();

          await submitForReview();
        },
        true
      );
    }

    button.classList.add(
      "glime-submit-review-btn"
    );

    button.textContent = "Submit for Review";

    button.title =
      "Submit the current draft version for Admin approval.";

    return true;
  }

  function monitorButton() {
    convertPublishButton();

    const observer =
      new MutationObserver(() => {
        convertPublishButton();
      });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function init() {
    if (initialized) {
      return;
    }

    initialized = true;

    addStyles();

    setStatus(
      "Catalog publishing is Admin-controlled. Draft versions must be submitted for review.",
      "warning"
    );

    monitorButton();
  }

  window.GLIMEServicesOfferApproval = {
    submitForReview
  };

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init,
      {
        once: true
      }
    );
  } else {
    init();
  }
})();
