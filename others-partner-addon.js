/* =========================================================
   GLIME OTHERS > PARTNER PROGRAM
   ---------------------------------------------------------
   Adds a "Partner Program" section to others.html so a client can
   open the partner dashboard in one tap.

   Deep link: others.html#partner

   Navigation only. It does not read or write any data; sign-in and
   partner status are handled by partner-dashboard.html itself.
   Pages used (all already in the repository):
     partner-dashboard.html   the partner dashboard
     partner.html             program overview / join
     partner-docs.html        Partner Guide
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var LINK_STYLE = 'display:inline-block;text-decoration:none;text-align:center';

  window.GLIME_OTHERS.register({
    id: 'partner',
    label: 'Partner Program',
    order: 10,
    render: async function (ctx) {
      ctx.container.innerHTML =
        '<div class="section-head">' +
          '<h2>Partner Program</h2>' +
          '<p>Refer businesses to GLIME and earn commission when they subscribe.</p>' +
        '</div>' +
        '<div class="card">' +
          '<h2 style="font-size:1.02rem;margin-bottom:6px">Your partner dashboard</h2>' +
          '<p style="color:var(--mu);font-size:.8rem;margin-bottom:16px">' +
            'See your referral link, referrals, earnings and payouts in one place.' +
          '</p>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            '<a class="btn primary" style="' + LINK_STYLE + '" href="partner-dashboard.html">Open partner dashboard</a>' +
            '<a class="btn" style="' + LINK_STYLE + '" href="partner-docs.html">Partner Guide</a>' +
          '</div>' +
        '</div>' +
        '<div class="card">' +
          '<h2 style="font-size:1.02rem;margin-bottom:6px">New to the Partner Program?</h2>' +
          '<p style="color:var(--mu);font-size:.8rem;margin-bottom:16px">' +
            'See how it works and join with Google.' +
          '</p>' +
          '<a class="btn" style="' + LINK_STYLE + '" href="partner.html">About the Partner Program</a>' +
        '</div>';
    }
  });
})();
