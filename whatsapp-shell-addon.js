/* GLIME — WhatsApp Sales: connects the page to the shared app shell.
   1. moves the shell's menu button into the page's own top bar (mobile),
   2. shows the business name / client id in the shell's account card.
   Display only; no data is read or written here. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clean = v => String(v == null ? '' : v).trim();

  let tries = 0;
  const t = setInterval(() => {
    tries++;
    const burger = $('gasBurger');
    const bar = document.querySelector('.topbar');
    if (burger && bar) {
      if (!bar.contains(burger)) bar.insertBefore(burger, bar.firstChild);
      clearInterval(t);
    } else if (tries > 60) clearInterval(t);
  }, 100);

  function push() {
    const name = clean($('businessName') && $('businessName').textContent);
    const cid = clean($('clientId') && $('clientId').textContent);
    if (!cid || /^loading/i.test(cid)) return;
    if (window.GlimeAppShell && typeof window.GlimeAppShell.setIdentity === 'function') {
      window.GlimeAppShell.setIdentity({ name: name === 'Business' ? '' : name, clientId: cid });
    }
  }
  ['businessName', 'clientId'].forEach(id => {
    const el = $(id);
    if (el && window.MutationObserver) {
      new MutationObserver(push).observe(el, { childList: true, characterData: true, subtree: true });
    }
  });
  let n = 0;
  const poll = setInterval(() => { push(); if (++n > 40) clearInterval(poll); }, 500);
})();
