/* GLIME — injects the fixed bottom navigation bar used by the Android-app style shell (phones only; CSS hides it on desktop). */
(function () {
  'use strict';
  if (document.getElementById('glimeBottomNav')) return;

  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var items = [
    ['dashboard.html', 'Home', '<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'],
    ['instagram-sales-specialist.html', 'Instagram', '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor"/>'],
    ['customer.html', 'Customers', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7"/>'],
    ['orders.html', 'Orders', '<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>']
  ];

  var nav = document.createElement('nav');
  nav.id = 'glimeBottomNav';
  nav.className = 'gnav';
  nav.setAttribute('aria-label', 'Main');

  items.forEach(function (it) {
    var a = document.createElement('a');
    a.href = it[0];
    if (it[0] === page) a.className = 'on';
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + it[2] + '</svg><span>' + it[1] + '</span>';
    nav.appendChild(a);
  });

  var more = document.createElement('button');
  more.type = 'button';
  more.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>More</span>';
  more.addEventListener('click', function () {
    var b = document.getElementById('glimeInstagramMobileMenuButton') || document.getElementById('menuBtn');
    if (b) b.click();
  });
  nav.appendChild(more);

  document.body.appendChild(nav);
})();
