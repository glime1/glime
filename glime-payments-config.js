/* =========================================================
   GLIME PAYMENTS — SHARED CONFIG
   ---------------------------------------------------------
   One place for the numbers and the version used by:
   - settings-payments-addon.js   (Settings > GLIME Payments)
   - glime-payments-terms.html    (Terms & Conditions)
   - glime-payments-docs.html     (Payments Guide)

   The fee the client actually pays is decided by the backend
   (payment_accounts.fee_bps) and is shown live in Settings > GLIME Payments.
   The values below are only the DEFAULTS shown on the public pages.

   termsVersion  : change it whenever the Terms change. Every client has to
                   accept the new version again before using GLIME Payments.
   serviceBps    : GLIME's own service fee, in basis points (50 = 0.5%).
   processingBps : payment processing charges incl. GST, in basis points
                   (261 = 2.61%). Check it against your payment partner agreement.

   Public pages never name the payment partner. Keep it that way.
   ========================================================= */
window.GLIME_PAYMENTS_CONFIG=Object.freeze({
  termsVersion:'2026-10-31',
  effectiveDate:'31 October 2026',
  serviceBps:50,
  processingBps:261,
  termsUrl:'glime-payments-terms.html',
  docsUrl:'glime-payments-docs.html',
  supportEmail:'connect@glime.online'
});
