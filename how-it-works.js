/* GLIME How It Works - small interactions: reveal on scroll, journey rail, loop highlight */
(function () {
  'use strict';

  /* ---------- scroll reveal ---------- */
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------- journey rail: highlight the stage being read ---------- */
  var rail = document.getElementById('journey-rail');
  if (rail) {
    var buttons = Array.prototype.slice.call(rail.querySelectorAll('button[data-target]'));
    var stages = buttons.map(function (b) { return document.getElementById(b.getAttribute('data-target')); });

    function setActive(id) {
      buttons.forEach(function (b) {
        var on = b.getAttribute('data-target') === id;
        b.classList.toggle('active', on);
        if (on) { b.setAttribute('aria-current', 'step'); } else { b.removeAttribute('aria-current'); }
      });
      var cur = rail.querySelector('button.active');
      if (cur && rail.scrollWidth > rail.clientWidth) {
        var left = cur.offsetLeft - (rail.clientWidth - cur.offsetWidth) / 2;
        rail.scrollTo({ left: left, behavior: 'smooth' });
      }
    }

    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var el = document.getElementById(b.getAttribute('data-target'));
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    });

    if ('IntersectionObserver' in window) {
      var visible = {};
      var so = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting ? e.intersectionRatio : 0; });
        var best = null, bestVal = 0;
        Object.keys(visible).forEach(function (k) {
          if (visible[k] > bestVal) { best = k; bestVal = visible[k]; }
        });
        if (best) { setActive(best); }
      }, { rootMargin: '-25% 0px -45% 0px', threshold: [0, 0.1, 0.3, 0.6, 1] });
      stages.forEach(function (s) { if (s) { so.observe(s); } });
    }
  }

  /* ---------- show the rail only while the journey section is on screen ---------- */
  var journey = document.getElementById('journey');
  if (rail && journey && 'IntersectionObserver' in window) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { rail.classList.toggle('show', e.isIntersecting); });
    }, { threshold: 0.02 });
    ro.observe(journey);
  } else if (rail) {
    rail.classList.add('show');
  }
})();
