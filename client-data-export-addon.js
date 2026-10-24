/* =========================================================
   GLIME - sidebar link to the Download Data page
   ---------------------------------------------------------
   Adds a "Download Data" button above "Secure Logout" in the
   shared app-shell sidebar. It only links to data-download.html;
   all export logic lives on that page.
========================================================= */
(function () {
  'use strict';
  if (window.GlimeDataExport) return;

  var ICON =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4 19h16"/></svg>';

  var CSS =
    '.gas-download{display:flex;align-items:center;gap:12px;width:100%;min-height:42px;padding:9px 12px;margin-bottom:8px;' +
    'color:#00ff88;background:rgba(0,255,136,.08);border:1px solid rgba(0,255,136,.25);border-radius:10px;' +
    'font:inherit;font-size:.84rem;font-weight:700;text-decoration:none;white-space:nowrap;box-sizing:border-box}' +
    '.gas-download:hover,.gas-download[aria-current="page"]{background:rgba(0,255,136,.16)}' +
    '.gas-download:focus-visible{outline:2px solid #00ff88;outline-offset:2px}' +
    'body.gas-collapsed .gas-download{justify-content:center;padding-inline:0}';

  function addLink() {
    if (document.getElementById('gasDownload')) return true;
    var logout = document.getElementById('gasLogout');
    if (!logout || !logout.parentNode) return false;
    if (!document.getElementById('gasDownloadStyle')) {
      var s = document.createElement('style');
      s.id = 'gasDownloadStyle';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    var a = document.createElement('a');
    a.id = 'gasDownload';
    a.className = 'gas-download';
    a.href = 'data-download.html';
    a.title = 'Download your data';
    if (/data-download(\.html)?$/i.test(location.pathname)) a.setAttribute('aria-current', 'page');
    a.innerHTML = ICON + '<span class="gas-label">Download Data</span>';
    logout.parentNode.insertBefore(a, logout);
    return true;
  }

  window.GlimeDataExport = {};

  function boot() {
    if (addLink()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (addLink() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
