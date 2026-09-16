/*
 * GLIME — Payment Addon Client Bridge
 *
 * Existing admin.html Supabase client को touch नहीं करता।
 * Payment addon के लिए dedicated client बनाता है।
 */

(() => {
  "use strict";

  const SUPABASE_URL =
    "https://ufoulgbiqgjriwapuopc.supabase.co";

  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA";

  function initPaymentClient() {
    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      console.warn(
        "GLIME Payment Bridge: Supabase SDK not ready."
      );
      return false;
    }

    if (
      !window.supabaseClient ||
      typeof window.supabaseClient.rpc !== "function"
    ) {
      window.supabaseClient =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              detectSessionInUrl: true
            }
          }
        );
    }

    return true;
  }

  function refreshPaymentPanel() {
    const button =
      document.getElementById(
        "glime-payment-refresh"
      );

    if (button) {
      button.click();
    }
  }

  function boot() {
    if (!initPaymentClient()) {
      setTimeout(boot, 500);
      return;
    }

    setTimeout(
      refreshPaymentPanel,
      150
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      boot
    );
  } else {
    boot();
  }

})();
