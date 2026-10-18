/* =========================================================
   GLIME PARTNER GUIDE
   - fills program numbers from partner-config.js
   - table of contents highlight while scrolling
   - search across sections
========================================================= */
(function () {
  "use strict";

  var C = window.GLIME_PARTNER;
  if (!C) return;
  var P = C.program, U = C.util;

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- program numbers ---------- */
  var values = {
    estimateMonths: P.estimateMonths,
    cookieDays: P.cookieDays,
    holdDays: P.holdDays,
    minPayout: U.inr(P.minPayout),
    payoutDayOrd: ordinal(P.payoutDay),
    maxRate: P.tiers[P.tiers.length - 1].rate
  };
  document.querySelectorAll("[data-cfg]").forEach(function (el) {
    var k = el.getAttribute("data-cfg");
    if (values[k] != null) el.textContent = values[k];
  });

  /* ---------- tier table and example ---------- */
  var rows = document.getElementById("tierRows");
  if (rows) {
    rows.innerHTML = P.tiers.map(function (t) {
      var req = t.minCustomers === 0 ? "0 or more" : t.minCustomers + " or more";
      return "<tr><td>" + U.esc(t.name) + "</td><td>" + req + "</td><td>" + t.rate + "%</td></tr>";
    }).join("");
  }
  var ex = document.getElementById("exampleText");
  if (ex) {
    var plan = P.plans[0], n = 10, tier = U.tierFor(n);
    var monthly = n * plan.monthly * tier.rate / 100;
    ex.textContent = "Say " + n + " customers you referred are paying for " + plan.name + " at " + U.inr(plan.monthly) +
      " per month. That puts you on the " + tier.name + " tier at " + tier.rate + "%, so your commission is about " +
      U.inr(Math.round(monthly)) + " per month, or about " + U.inr(Math.round(monthly * P.estimateMonths)) +
      " over " + P.estimateMonths + " months, before taxes, refunds and fees. Because commission is lifetime, it continues for as long as those customers stay subscribed.";
  }

  /* ---------- scroll spy ---------- */
  var sections = Array.prototype.slice.call(document.querySelectorAll(".doc"));
  var links = Array.prototype.slice.call(document.querySelectorAll("#toc a"));

  function setActive(id) {
    links.forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("href") === "#" + id);
    });
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }
  setActive((window.location.hash || "#overview").slice(1));

  /* ---------- search ---------- */
  var input = document.getElementById("docSearch");
  var none = document.getElementById("noResults");
  if (input) {
    input.addEventListener("input", function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      sections.forEach(function (s) {
        var hit = !q || s.textContent.toLowerCase().indexOf(q) > -1;
        s.hidden = !hit;
        if (hit) shown++;
        var a = document.querySelector('#toc a[href="#' + s.id + '"]');
        if (a) a.classList.toggle("hide", !hit);
      });
      if (none) none.hidden = shown !== 0;
      if (q) {
        document.querySelectorAll(".faq details").forEach(function (d) {
          d.open = d.textContent.toLowerCase().indexOf(q) > -1;
        });
      }
    });
  }
})();
