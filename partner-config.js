/* =========================================================
   GLIME PARTNER PROGRAM — shared configuration
   Single source of truth for the partner landing page,
   partner dashboard and partner documentation.
   Change a number here and all three pages update.
========================================================= */
window.GLIME_PARTNER = {
  supabaseUrl: "https://ufoulgbiqgjriwapuopc.supabase.co",
  supabaseKey: "sb_publishable_BRqfs9ElsX5mPJgrIxdFrQ_884V2SwA",

  referralBase: "https://glime.online/",

  pages: {
    landing: "partner.html",
    dashboard: "partner-dashboard.html",
    docs: "partner-docs.html"
  },

  program: {
    name: "GLIME Partner Program",
    /* Commission is lifetime: it continues for as long as the referred
       customer stays on a paid plan. estimateMonths is only the period
       used for the illustrative earnings estimate and worked example. */
    lifetime: true,
    estimateMonths: 12,
    cookieDays: 60,
    holdDays: 30,
    minPayout: 1000,
    payoutDay: 10,
    tiers: [
      { name: "Starter", minCustomers: 0,  rate: 20 },
      { name: "Growth",  minCustomers: 10, rate: 25 },
      { name: "Elite",   minCustomers: 30, rate: 30 }
    ],
    plans: [
      { key: "growth", name: "GLIME Growth", monthly: 299 },
      { key: "omni",   name: "GLIME Omni",   monthly: 1499 }
    ]
  }
};

/* Small helpers shared by the partner pages */
window.GLIME_PARTNER.util = {
  inr: function (n) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency", currency: "INR", maximumFractionDigits: 0
    }).format(Number(n) || 0);
  },
  num: function (n) {
    return new Intl.NumberFormat("en-IN").format(Number(n) || 0);
  },
  date: function (v) {
    if (!v) return "—";
    var d = new Date(v);
    if (isNaN(d)) return "—";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  },
  esc: function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  tierFor: function (customers) {
    var tiers = window.GLIME_PARTNER.program.tiers, cur = tiers[0];
    for (var i = 0; i < tiers.length; i++) {
      if (customers >= tiers[i].minCustomers) cur = tiers[i];
    }
    return cur;
  },
  nextTier: function (customers) {
    var tiers = window.GLIME_PARTNER.program.tiers;
    for (var i = 0; i < tiers.length; i++) {
      if (customers < tiers[i].minCustomers) return tiers[i];
    }
    return null;
  }
};
