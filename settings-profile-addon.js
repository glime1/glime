/* =========================================================
   GLIME Settings > Profile (owner photo + business logo)
   Uses the shared photo system (glime-avatar.js). This file only
   draws the two cards; storage / backend calls live in GlimePhoto.
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_SETTINGS || !window.GLIME_SETTINGS.register) return;

  var CSS =
    '.pf-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:15px}' +
    '.pf-card{background:var(--surf);border:1px solid var(--bd);border-radius:18px;padding:20px;text-align:center}' +
    '.pf-card h3{font-size:1rem;margin-bottom:3px}' +
    '.pf-card p{color:var(--mu);font-size:.74rem;line-height:1.5}' +
    '.pf-photo{width:132px;height:132px;border-radius:50%;margin:16px auto 14px;display:flex;align-items:center;justify-content:center;' +
    'font-size:2.6rem;font-weight:800;color:#fff;border:3px solid rgba(80,245,168,.45);background:linear-gradient(135deg,#1f9d6e,#0b141d)}' +
    '.pf-photo.sq{border-radius:30px}' +
    '.pf-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}';

  function esc(v) { return window.GLIME_SETTINGS.ui.escapeHtml(v); }

  function letter(v) { return String(v || 'G').trim().charAt(0).toUpperCase() || 'G'; }

  /* GLIME-themed confirm box; falls back to the native one if the dialog file is missing. */
  function gdConfirm(msg, o) {
    return window.GLIME_DIALOG ? window.GLIME_DIALOG.confirm(msg, o) : Promise.resolve(window.confirm(msg));
  }

  function card(type, id, title, hint, seed, square) {
    return '<section class="pf-card">' +
      '<h3>' + esc(title) + '</h3><p>' + esc(hint) + '</p>' +
      '<div class="pf-photo' + (square ? ' sq' : '') + '" data-gp-type="' + type + '" data-gp-id="' + esc(id) + '">' + esc(letter(seed)) + '</div>' +
      '<div class="pf-actions">' +
      '<button type="button" class="btn primary" data-pf-pick="' + type + '">Upload / change</button>' +
      '<button type="button" class="btn danger" data-pf-remove="' + type + '" hidden>Remove</button>' +
      '</div></section>';
  }

  window.GLIME_SETTINGS.register({
    id: 'profile',
    label: 'Profile',
    order: 15,
    render: async function (ctx) {
      var client = ctx.state.client || {};
      var id = client.client_id;
      var biz = client.business_name || client.name || 'Business';

      if (!document.getElementById('pf-style')) {
        var st = document.createElement('style'); st.id = 'pf-style'; st.textContent = CSS;
        document.head.appendChild(st);
      }

      ctx.container.innerHTML =
        '<div class="section-head"><h2>Profile</h2>' +
        '<p>Your photo and business logo are used across GLIME: sidebar, customer, lead and chat screens.</p></div>' +
        '<div class="pf-grid">' +
        card('owner', id, 'Owner photo', 'Shown next to your name in the sidebar and top bar on every page.', client.name || biz, false) +
        card('business', id, 'Business logo', 'Your brand mark. Square images work best.', biz, true) +
        '</div>' +
        '<p class="note">Photos are stored privately in your GLIME workspace. Only you and your team can see them.</p>';

      var P = window.GlimePhoto;
      if (!P) {
        ctx.container.insertAdjacentHTML('beforeend', '<div class="error" style="margin-top:12px">The photo system could not be loaded. Please refresh the page.</div>');
        return;
      }

      function syncButtons() {
        ['owner', 'business'].forEach(function (t) {
          var rm = ctx.container.querySelector('[data-pf-remove="' + t + '"]');
          if (rm) rm.hidden = !P.has(t, id);
        });
        P.apply();
      }

      ctx.container.addEventListener('click', async function (e) {
        var pk = e.target.closest('[data-pf-pick]');
        if (pk) { var t = pk.getAttribute('data-pf-pick'); P.pick(t, id, t === 'owner' ? (client.name || biz) : biz); return; }
        var rm = e.target.closest('[data-pf-remove]');
        if (rm) {
          var type = rm.getAttribute('data-pf-remove');
          if (!(await gdConfirm('Remove this photo?', { title: 'Remove photo', confirmText: 'Remove', danger: true }))) return;
          P.remove(type, id).then(function () { window.GLIME_SETTINGS.ui.toast('Photo removed'); syncButtons(); })
            .catch(function (err) { window.GLIME_SETTINGS.ui.toast(err.message || 'Could not remove photo', true); });
        }
      });

      P.on(function () { if (ctx.container.isConnected) syncButtons(); });
      await P.ready();
      syncButtons();
    }
  });
})();
