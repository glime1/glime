/* =========================================================
   GLIME PAYMENTS — SHARED CONFIG
   ---------------------------------------------------------
   One place for the numbers and the version used by:
   - settings-payments-addon.js   (Settings > Payments)
   - glime-payments-terms.html    (Terms & Conditions)
   - glime-payments-docs.html     (Documentation)

   The fee the client actually pays is decided by the backend
   (payment_accounts.fee_bps) and is shown live in Settings > Payments.
   The values below are only the DEFAULTS shown on the public pages.

   termsVersion  : change it whenever the Terms change. Every client has to
                   accept the new version again before using GLIME Payments.
   serviceBps    : GLIME's own fee, in basis points (50 = 0.5%).
   razorpayBps   : Razorpay gateway charges incl. GST (standard 2% + 18% GST = 236).
   routeBps      : Razorpay Route transfer fee (0.25% = 25).
   Check razorpayBps and routeBps against your own Razorpay agreement.
   ========================================================= */
window.GLIME_PAYMENTS_CONFIG=Object.freeze({
  termsVersion:'2026-10-31',
  effectiveDate:'31 October 2026',
  serviceBps:50,
  razorpayBps:236,
  routeBps:25,
  termsUrl:'glime-payments-terms.html',
  docsUrl:'glime-payments-docs.html',
  supportEmail:'connect@glime.online'
});
