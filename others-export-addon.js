/* =========================================================
   GLIME OTHERS > UAE EXPORT NETWORK  (locked)
   ---------------------------------------------------------
   Deep link: others.html#uae-export

   This section is LOCKED for every client. It opens only after a
   GLIME admin approves that client.

   Approval check (backend, to be built):
     RPC  export_network_my_access()  ->  true | { approved: true }
   The lock fails closed: if the RPC does not exist, errors out, or
   returns anything other than approved, the client sees the locked
   screen.

   Scope: UAE only for now. No other country.
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  var esc = function (v) { return window.GLIME_OTHERS.ui.escapeHtml(v); };

  async function isApproved(api) {
    try {
      var res = await api.supabase.rpc('export_network_my_access');
      if (res.error) return false;
      var d = res.data;
      if (Array.isArray(d)) d = d[0];
      if (d === true) return true;
      return !!(d && typeof d === 'object' && d.approved === true);
    } catch (e) {
      return false;
    }
  }

  function head() {
    return '<div class="section-head">' +
      '<h2>UAE Export Network</h2>' +
      '<p>Sell your products to distributors in the UAE.</p>' +
    '</div>';
  }

  function lockedView() {
    return head() +
      '<div class="card" style="text-align:center;padding:38px 20px">' +
        '<div style="font-size:2.4rem;line-height:1" aria-hidden="true">\uD83D\uDD12</div>' +
        '<h2 style="font-size:1.1rem;margin:12px 0 6px">This section is locked</h2>' +
        '<p style="color:var(--mu);font-size:.82rem;max-width:460px;margin:0 auto">' +
          'UAE Export Network opens only after GLIME approves your account. ' +
          'It is available for the UAE only at the moment.' +
        '</p>' +
      '</div>';
  }

  function approvedView() {
    return head() +
      '<div class="card">' +
        '<h2 style="font-size:1.02rem;margin-bottom:4px">Access approved</h2>' +
        '<p style="color:var(--mu);font-size:.8rem">' +
          'Your account is approved for the UAE Export Network. Tools will appear here as they are released.' +
        '</p>' +
      '</div>';
  }

  window.GLIME_OTHERS.register({
    id: 'uae-export',
    label: 'UAE Export Network',
    order: 40,
    render: async function (ctx) {
      ctx.container.innerHTML = '<div class="loading">Checking access\u2026</div>';
      var ok = await isApproved(ctx.api);
      ctx.container.innerHTML = ok ? approvedView() : lockedView();
    }
  });
})();
