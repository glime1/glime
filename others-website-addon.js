/* =========================================================
   GLIME OTHERS > WEBSITE GENERATOR
   ---------------------------------------------------------
   Adds a "Website Generator" section to others.html.

   Deep link: others.html#website

   Navigation only. It does not read or write any data. The website
   builder itself is website-generator.html (the same page that the
   Settings > Profile card opens).
========================================================= */
(function () {
  'use strict';
  if (!window.GLIME_OTHERS) return;

  window.GLIME_OTHERS.register({
    id: 'website',
    label: 'Website Generator',
    order: 30,
    render: async function (ctx) {
      ctx.container.innerHTML =
        '<div class="section-head">' +
          '<h2>Website Generator</h2>' +
          '<p>Create your own business website in a few taps.</p>' +
        '</div>' +
        '<div class="card" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">' +
          '<div style="font-size:2rem;line-height:1" aria-hidden="true">\uD83C\uDF10</div>' +
          '<div style="flex:1;min-width:200px">' +
            '<h2 style="font-size:1.02rem;margin-bottom:4px">Build and publish your website</h2>' +
            '<p style="color:var(--mu);font-size:.8rem">Your services, photos and contact details fill in automatically. Then publish and share the link.</p>' +
          '</div>' +
          '<a class="btn primary" style="display:inline-block;text-decoration:none;text-align:center" href="website-generator.html">Create / edit website</a>' +
        '</div>';
    }
  });
})();
