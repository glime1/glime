/* GI top card — Weekly AI Briefing (English / Hindi).
 * get_growth_weekly_briefing() -> null | { id, week_start, week_end, generated_at, headline:{en,hi}, summary:{en,hi},
 *   wins:[{en,hi}], risks:[{en,hi}], actions:[{en,hi}], numbers:[{label,value,change_pct}] }
 * edge growth-weekly-briefing { force:true } -> writes a new briefing (server limits this to once a day). Also created weekly by schedule. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, stamp, IC } = GI;
  const L = { lang: "en", busy: false };
  try { const s = localStorage.getItem("gi.lang"); if (s === "hi" || s === "en") L.lang = s; } catch { /* storage unavailable */ }
  const tx = v => (v && typeof v === "object" ? (v[L.lang] || v.en || "") : String(v || ""));

  const ctrl = () => `<div class="gi-tabs" role="group" aria-label="Language"><button type="button" data-l="en" class="${L.lang === "en" ? "on" : ""}">EN</button><button type="button" data-l="hi" class="${L.lang === "hi" ? "on" : ""}">हिन्दी</button></div>`;
  function wire(el) {
    $$("[data-l]", el).forEach(b => { b.onclick = () => { L.lang = b.dataset.l; try { localStorage.setItem("gi.lang", L.lang); } catch { /* ignore */ } GI.paint("briefing"); }; });
  }
  async function generate() {
    if (L.busy) return; L.busy = true; GI.toast(L.lang === "hi" ? "Anaya आपकी ब्रीफ़िंग तैयार कर रही है…" : "Anaya is preparing your briefing…");
    try { await GI.edge("growth-weekly-briefing", { force: true }, 120000); L.busy = false; await GI.load("briefing"); }
    catch (e) { L.busy = false; GI.toast(e.code === "FN_MISSING" ? "Weekly briefing is not set up yet." : e.code === "RATE" ? "Today's briefing is already prepared." : GI.errText(e)); }
  }
  const col = (title, arr, cls) => (Array.isArray(arr) && arr.length ? `<div class="gi-rep ${cls}"><h4>${title}</h4><ul>${arr.slice(0, 4).map(x => `<li>${esc(tx(x))}</li>`).join("")}</ul></div>` : "");

  function render(b, st) {
    const d = st.data, hi = L.lang === "hi";
    if (!d) { b.innerHTML = `<div class="gi-state">${hi ? "अभी कोई साप्ताहिक ब्रीफ़िंग नहीं है।" : "No weekly briefing yet."}<br><button class="gi-btn2 ok" type="button" id="giBrGen">${hi ? "अभी बनाएँ" : "Generate now"}</button></div>`; $("#giBrGen", b).onclick = generate; return; }
    b.innerHTML = `<div class="gi-brief"><h3>${esc(tx(d.headline))}</h3><p>${esc(tx(d.summary))}</p>
      ${(d.numbers || []).length ? `<div class="gi-chips nums">${d.numbers.slice(0, 5).map(n => `<span class="gi-num-chip"><small>${esc(n.label)}</small><b>${esc(n.value)}</b>${isNum(num(n.change_pct)) ? `<em class="${num(n.change_pct) >= 0 ? "up" : "down"}">${num(n.change_pct) >= 0 ? "↑" : "↓"} ${Math.abs(num(n.change_pct))}%</em>` : ""}</span>`).join("")}</div>` : ""}
      <div class="gi-reps">${col(hi ? "इस हफ़्ते की जीत" : "Wins", d.wins, "opp")}${col(hi ? "ध्यान देने वाली बातें" : "Watch out", d.risks, "thr")}${col(hi ? "अगले कदम" : "Do next", d.actions, "gap")}</div>
      <p class="gi-hint">${hi ? "सप्ताह" : "Week"} ${esc(stamp(d.week_start))} – ${esc(stamp(d.week_end))} · ${hi ? "तैयार" : "Prepared"} ${esc(stamp(d.generated_at))}. ${hi ? "यह आपके अपने GLIME डेटा से बना है; जहाँ डेटा नहीं था वहाँ अनुमान नहीं लगाया गया।" : "Built from your own GLIME data. Where data was missing, nothing was guessed."}
      <button class="gi-link" type="button" id="giBrGen">${hi ? "दोबारा बनाएँ" : "Regenerate"}</button></p></div>`;
    $("#giBrGen", b).onclick = generate;
  }

  GI.register({
    id: "briefing", order: 0, num: "★", short: "Weekly Briefing", icon: IC.news, title: "Weekly AI Briefing", sub: "A short summary of your week: what changed and what to do", rpc: "get_growth_weekly_briefing", ctrl, ctrlAlways: true, wire,
    load: async () => { const d = await GI.rpc("get_growth_weekly_briefing"); return d && typeof d === "object" && d.headline ? d : null; }, render,
    context: st => { const d = st.data; return d ? [tx(d.headline), tx(d.summary)].filter(Boolean).concat((d.risks || []).slice(0, 2).map(x => "Risk: " + tx(x))) : []; }
  });
})();
