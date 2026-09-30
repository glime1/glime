/* =========================================================
   GLIME — ACCOUNT REVIEW DECISION ADD-ON
   =========================================================

   IMPORTANT:
   Admin Approve/Reject buttons are intentionally NOT created
   here.

   The complete Admin decision workflow lives in:
       account-review-flow.js

   This file only makes sure that a saved Admin response
   is visible to the suspended client.

   Example:
       Admin rejects request
             ↓
       account_review_requests.admin_note
             ↓
       Client dashboard
             ↓
       ADMIN RESPONSE
   ========================================================= */

(function () {
  'use strict';

  const SUPABASE_URL =
    'https://ufoulgbiqgjriwapuopc.supabase.co';

  const SUPABASE_KEY =
    'sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA';

  const path =
    (location.pathname || '/')
      .toLowerCase()
      .replace(/\/+$/, '') || '/';

  const isAdmin =
    path === '/admin' ||
    path.endsWith('/admin') ||
    path === '/admin.html' ||
    path.endsWith('/admin.html');

  /* Admin page is handled completely by
     account-review-flow.js */
  if (isAdmin) {
    return;
  }

  if (!window.supabase) {
    return;
  }

  const sb =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

  function esc(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      function (m) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[m];
      }
    );
  }

  function showAdminResponse(
    gate,
    review
  ) {

    if (!gate || !review) {
      return;
    }

    const note =
      String(
        review.admin_note || ''
      ).trim();

    if (!note) {
      return;
    }

    const existing =
      document.getElementById(
        'glimeAdminResponseAddon'
      );

    if (existing) {
      existing.remove();
    }

    const box =
      document.createElement(
        'div'
      );

    box.id =
      'glimeAdminResponseAddon';

    box.style.cssText = `
      margin:16px 0;
      padding:15px;
      border:1px solid rgba(255,83,102,.42);
      border-radius:12px;
      background:rgba(255,83,102,.07);
      color:#e8edf3;
      line-height:1.65;
    `;

    box.innerHTML = `
      <div
        style="
          color:#ff7180;
          font-weight:900;
          letter-spacing:.04em;
          margin-bottom:8px;
        "
      >
        ADMIN RESPONSE
      </div>

      <div>
        ${esc(note)}
      </div>
    `;

    const alert =
      gate.querySelector(
        '.glime-review-alert'
      );

    if (!alert) {
      return;
    }

    const copy =
      alert.querySelector(
        '.glime-review-copy'
      );

    /*
     * account-review-flow.js already renders the
     * response in the normal path.
     *
     * This addon is only a fallback.
     */
    if (
      !document.getElementById(
        'glimeAdminResponseInFlow'
      )
    ) {

      if (copy) {
        copy.insertAdjacentElement(
          'afterend',
          box
        );
      } else {
        alert.prepend(box);
      }

    }
  }

  async function checkClientReview() {

    const gate =
      document.getElementById(
        'glimeAccountReviewGate'
      );

    if (!gate) {
      return;
    }

    const session =
      await sb.auth.getSession();

    if (
      !session?.data?.session?.user
    ) {
      return;
    }

    const result =
      await sb
        .from('account_review_requests')
        .select(
          [
            'id',
            'status',
            'created_at',
            'client_message',
            'admin_note',
            'reviewed_at'
          ].join(',')
        )
        .order(
          'created_at',
          {
            ascending:false
          }
        )
        .limit(1);

    if (
      result.error ||
      !result.data?.length
    ) {
      return;
    }

    const review =
      result.data[0];

    /*
     * Only display an actual Admin decision response.
     */
    const status =
      String(
        review.status || ''
      ).toLowerCase();

    if (
      (status === 'rejected' ||
       status === 'approved') &&
      review.admin_note
    ) {

      showAdminResponse(
        gate,
        review
      );

    }
  }

  /*
   * The main flow creates the suspension screen.
   * Wait for it, then check the saved Admin response.
   */
  let attempts = 0;

  const timer =
    setInterval(
      async function () {

        attempts++;

        try {
          await checkClientReview();
        } catch (error) {
          console.warn(
            '[GLIME Account Review Response]',
            error
          );
        }

        if (
          attempts >= 60
        ) {

          clearInterval(
            timer
          );

        }

      },
      1000
    );

})();
