/* GI section 7 — Customer Health.
 * get_growth_customer_health() -> { meta:{as_of,total_customers}, segments:{champions,loyal,new,one_time,at_risk,lost},
 *   definitions:{segment:text}, top_customers:[{customer_id,name,orders,total_spent,days_since}],
 *   at_risk:[{customer_id,name,orders,total_spent,days_since,usual_gap_days}] }
 * Who is loyal, who is slipping away, who is lost. Segments are rule-based on the server, never guessed here. */
(() => {
  "use strict";
  const { esc, isNum, num, cnt, IC } = GI;
  const SEG = [["champions", "Champions", "#19e68c"], ["loyal", "Loyal", "#3aa0ff"], ["new", "New", "#a06bff"], ["one_time", "One-time", "#8b97a6"], ["at_risk", "At risk", "#ff9a2e"], ["lost", "Lost", "#ff4d5e"]];
  const ago = d => (!isNum(d) ? "—" : d === 0 ? "today" : d === 1 ? "1 day ago" : d + " days ago");

  function render(b, st) {
    const d = st.data || {}, s = d.segments || {}, total = SEG.reduce((a, [k]) => a + (num(s[k]) || 0), 0), def = d.definitions || {};
    if (!total) { b.innerHTML = `<div class="gi-state">No customers yet. Customer health appears after your first orders.</div>`; return; }
    const risk = num(s.at_risk) || 0, lost = num(s.lost) || 0;
    const row = c => `<li><div><b>${esc(c.name || "Customer")}</b><span>${cnt(num(c.orders) || 0)} order${num(c.orders) === 1 ? "" : "s"} · ${GI.money(num(c.total_spent) || 0)}</span></div><em>${isNum(num(c.usual_gap_days)) ? `usually every ${Math.round(num(c.usual_gap_days))} days · ` : ""}last order ${ago(num(c.days_since))}</em></li>`;
    b.innerHTML = `<div class="gi-minis four"><div class="gi-mini"><small>Customers</small><b>${cnt(total)}</b></div><div class="gi-mini green"><small>Champions + loyal</small><b>${cnt((num(s.champions) || 0) + (num(s.loyal) || 0))}</b></div><div class="gi-mini amber"><small>At risk</small><b>${cnt(risk)}</b></div><div class="gi-mini red"><small>Lost</small><b>${cnt(lost)}</b></div></div>
      <div class="gi-segbar" role="img" aria-label="Customer segments">${SEG.map(([k, , c]) => (num(s[k]) ? `<i style="width:${num(s[k]) / total * 100}%;background:${c}" title="${k}: ${s[k]}"></i>` : "")).join("")}</div>
      <div class="gi-legend2">${SEG.map(([k, l, c]) => `<div title="${esc(def[k] || "")}"><i style="background:${c}"></i>${l}<b>${cnt(num(s[k]) || 0)}</b></div>`).join("")}</div>
      <div class="gi-two"><div class="gi-box"><h3>Your best customers</h3>${(d.top_customers || []).length ? `<ul class="gi-people">${d.top_customers.slice(0, 5).map(row).join("")}</ul>` : `<div class="gi-state">No repeat buyers yet.</div>`}</div>
      <div class="gi-box"><h3>Needs attention <em class="gi-sm">${cnt(risk)} at risk</em></h3>${(d.at_risk || []).length ? `<ul class="gi-people">${d.at_risk.slice(0, 5).map(row).join("")}</ul>` : `<div class="gi-state">Nobody is slipping away right now.</div>`}
        ${risk > 0 ? `<button class="gi-ask wide" type="button" id="giWin"><img class="gi-av" src="${GI.ANAYA_IMG}" alt="" width="20" height="20"><span>Ask Anaya for a win-back plan</span></button>` : ""}</div></div>
      <p class="gi-hint">${esc(def.note || "Segments follow each customer's own buying rhythm. 'At risk' means they are overdue compared with how often they usually buy.")}</p>`;
    const w = b.querySelector("#giWin"); if (w) w.onclick = () => GI.askAnaya("health", { question: "Make a short win-back plan for my at-risk customers: who to contact first, what to say, and on which channel.", lines: (d.at_risk || []).slice(0, 5).map(c => `${c.name || "Customer"}: ${num(c.orders) || 0} orders, ${GI.money(num(c.total_spent) || 0)}, last order ${ago(num(c.days_since))}`) });
  }

  GI.register({
    id: "health", order: 7, short: "Customers", icon: IC.heart, title: "Customer Health", sub: "Who is loyal, who is slipping away", rpc: "get_growth_customer_health", lazy: true,
    load: () => GI.rpc("get_growth_customer_health"), render,
    context: st => { const s = (st.data && st.data.segments) || {}; return SEG.map(([k, l]) => `${l}: ${num(s[k]) || 0}`).concat(((st.data && st.data.at_risk) || []).slice(0, 3).map(c => `At risk: ${c.name || "Customer"}, last order ${ago(num(c.days_since))}`)); }
  });
})();
