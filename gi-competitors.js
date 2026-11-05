/* GI section 10 — Competitor Analysis. Three sources, all labelled:
 *   1. "You added"  — competitors the client types in (name, Instagram, website, followers, price, offers)
 *   2. "AI found"   — competitors Anaya's research suggests for the client's business type and city (client must accept)
 *   3. AI comparison — you vs competitors, gaps, opportunities, threats, with sources and a confidence level
 * list_growth_competitors / upsert_growth_competitor(p_payload) / delete_growth_competitor(p_id) / set_growth_competitor_status(p_id,p_status)
 * get_growth_competitor_report() / get_growth_own_profile()   edge: growth-competitor-research { mode:'discover'|'analyze' }
 * AI results are estimates from public information and say so. Unknown values show "—", never a guess. */
(() => {
  "use strict";
  const { $, $$, esc, isNum, num, cnt, stamp, human, IC } = GI;
  const B = { busy: "" };
  const safeUrl = u => { try { const x = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
  const handle = h => String(h || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  const offersOf = c => (Array.isArray(c.offers) ? c.offers : String(c.offers || "").split(",")).map(s => String(s).trim()).filter(Boolean);
  const cmp = () => (GI.st.competitors.data || {});

  const ctrl = () => `<button class="gi-btn2" type="button" id="giCmpFind" ${B.busy ? "disabled" : ""}>${IC.spark} ${B.busy === "discover" ? "Searching…" : "Find with AI"}</button><button class="gi-btn2 ok" type="button" id="giCmpAdd">${IC.plus} Add competitor</button>`;
  function wire(el) {
    $("#giCmpAdd", el).onclick = () => form();
    $("#giCmpFind", el).onclick = () => research("discover");
  }

  async function research(mode) {
    if (B.busy) return; B.busy = mode; GI.paint("competitors");
    GI.toast(mode === "discover" ? "Anaya is looking for competitors in your category and city…" : "Anaya is comparing you with your competitors…");
    try { await GI.edge("growth-competitor-research", { mode }, 150000); B.busy = ""; GI.toast(mode === "discover" ? "New suggestions are ready." : "Comparison is ready."); await GI.load("competitors"); }
    catch (e) { B.busy = ""; GI.paint("competitors"); GI.toast(e.code === "FN_MISSING" ? "Competitor research is not set up yet." : GI.errText(e)); }
  }
  const setStatus = async (id, s) => { try { await GI.rpc("set_growth_competitor_status", { p_id: id, p_status: s }); await GI.load("competitors", true); } catch (e) { GI.toast("Could not update: " + (e.message || e)); } };

  function form(c) {
    c = c || {};
    const md = GI.modal(`<h3>${c.id ? "Edit competitor" : "Add a competitor"}</h3>
      <form class="gi-form" id="giCmpForm" novalidate>
        <label>Name *<input name="name" maxlength="80" required value="${esc(c.name || "")}" placeholder="e.g. Glow Studio"></label>
        <div class="gi-f2"><label>Instagram<input name="instagram_handle" maxlength="60" value="${esc(c.instagram_handle || "")}" placeholder="@handle"></label>
        <label>Followers<input name="followers" inputmode="numeric" value="${isNum(num(c.followers)) ? num(c.followers) : ""}" placeholder="e.g. 12000"></label></div>
        <label>Website<input name="website" maxlength="160" value="${esc(c.website || "")}" placeholder="example.com"></label>
        <div class="gi-f2"><label>City<input name="city" maxlength="60" value="${esc(c.city || "")}"></label>
        <label>Price level<input name="price_note" maxlength="80" value="${esc(c.price_note || "")}" placeholder="e.g. ₹500–₹900 per service"></label></div>
        <label>Their offers <small>(separate with commas)</small><input name="offers" maxlength="240" value="${esc(offersOf(c).join(", "))}" placeholder="Free delivery, 10% first order"></label>
        <label>Notes<textarea name="notes" rows="2" maxlength="300">${esc(c.notes || "")}</textarea></label>
        <div class="gi-form-err" id="giCmpErr" role="alert"></div>
        <div class="gi-form-a"><button type="button" class="gi-btn2" data-close>Cancel</button><button type="submit" class="gi-btn2 ok">${c.id ? "Save changes" : "Add competitor"}</button></div></form>`);
    $("#giCmpForm", md).onsubmit = async e => {
      e.preventDefault(); const f = e.target, v = n => f.elements[n].value.trim(), err = $("#giCmpErr", md);
      if (!v("name")) { err.textContent = "Please enter the competitor's name."; return; }
      const fo = v("followers").replace(/[,\s]/g, ""); if (fo && !/^\d{1,10}$/.test(fo)) { err.textContent = "Followers must be a whole number."; return; }
      const web = v("website"); if (web && !safeUrl(web)) { err.textContent = "That website address does not look right."; return; }
      const payload = { id: c.id || null, name: v("name"), instagram_handle: handle(v("instagram_handle")) || null, followers: fo ? Number(fo) : null, website: web ? safeUrl(web) : null, city: v("city") || null, price_note: v("price_note") || null, offers: v("offers").split(",").map(s => s.trim()).filter(Boolean), notes: v("notes") || null };
      const btn = f.querySelector("[type=submit]"); btn.disabled = true;
      try { await GI.rpc("upsert_growth_competitor", { p_payload: payload }); GI.closeModal(); GI.toast("Competitor saved."); await GI.load("competitors", true); }
      catch (x) { btn.disabled = false; err.textContent = "Could not save: " + (x.message || x); }
    };
  }

  const tag = c => (c.source === "client" ? `<span class="gi-tag ok">You added</span>` : `<span class="gi-tag ai">${IC.spark} AI found</span>`);
  function card(c) {
    const h = handle(c.instagram_handle), u = c.website && safeUrl(c.website), offers = offersOf(c);
    return `<article class="gi-cp" data-id="${esc(c.id)}"><div class="gi-cp-h"><b>${esc(c.name)}</b>${tag(c)}</div>
      <div class="gi-cp-l">${h ? `<a href="https://instagram.com/${encodeURIComponent(h)}" target="_blank" rel="noopener noreferrer">@${esc(h)}</a>` : ""}${u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">Website</a>` : ""}${c.city ? `<span>${esc(c.city)}</span>` : ""}</div>
      <div class="gi-kv"><span>Followers</span><b>${isNum(num(c.followers)) ? cnt(num(c.followers)) : "—"}</b></div><div class="gi-kv"><span>Price level</span><b>${esc(c.price_note || "—")}</b></div>
      ${offers.length ? `<div class="gi-tags">${offers.slice(0, 5).map(o => `<span class="gi-tag">${esc(o)}</span>`).join("")}</div>` : ""}
      ${c.source !== "client" ? `<div class="gi-hint">Found from public information. Please verify the details.</div>` : ""}
      <div class="gi-cp-a">${c.status === "suggested" ? `<button class="gi-btn2 ok" data-a="accept">Track this</button><button class="gi-btn2" data-a="ignore">Ignore</button>` : `<button class="gi-btn2" data-a="edit">Edit</button><button class="gi-btn2 bad" data-a="delete">Remove</button>`}</div></article>`;
  }

  function report(r, own, n) {
    if (!r) return `<div class="gi-box"><h3>How you compare</h3><div class="gi-state">${n ? "Tap <b>Compare with AI</b> to see your gaps and opportunities." : "Add or accept at least one competitor to compare."}</div>${cmpBtn(n)}</div>`;
    const rows = r.comparison || [], names = rows[0] && rows[0].competitors ? rows[0].competitors.map(x => x.name).slice(0, 4) : [];
    const list = (t, a, cls) => (Array.isArray(a) && a.length ? `<div class="gi-rep ${cls}"><h4>${t}</h4><ul>${a.slice(0, 5).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : "");
    return `<div class="gi-box"><h3>How you compare <em class="gi-sm">${r.confidence ? esc(human(r.confidence)) + " confidence" : ""}${r.generated_at ? " · " + esc(stamp(r.generated_at)) : ""}</em></h3>
      ${r.summary ? `<p class="gi-sum">${esc(r.summary)}</p>` : ""}
      ${rows.length ? `<div class="gi-tw"><table class="gi-tb"><thead><tr><th>Measure</th><th>You</th>${names.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>${rows.slice(0, 8).map(x => `<tr><td>${esc(x.metric)}</td><td><b>${esc(x.you ?? "—")}</b></td>${names.map(nm => { const f = (x.competitors || []).find(z => z.name === nm); return `<td>${esc(f && f.value != null ? f.value : "—")}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      <div class="gi-reps">${list("Your gaps", r.gaps, "gap")}${list("Opportunities", r.opportunities, "opp")}${list("Threats", r.threats, "thr")}</div>
      ${(r.sources || []).length ? `<p class="gi-hint">Sources: ${r.sources.slice(0, 5).map(s => { const u = safeUrl(s.url || ""); return u ? `<a class="gi-src" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(s.title || u)}</a>` : esc(s.title || ""); }).join(" · ")}</p>` : ""}
      <p class="gi-hint">AI-assisted comparison from public information${own && own.followers != null ? "" : " and the details you entered"}. Verify before acting.</p>${cmpBtn(n)}</div>`;
  }
  const cmpBtn = n => `<button class="gi-btn2 ok" type="button" id="giCmpRun" ${n && !B.busy ? "" : "disabled"}>${B.busy === "analyze" ? "Comparing…" : "Compare with AI"}</button>`;

  function render(b, st) {
    const d = st.data || {}, all = d.list || [], active = all.filter(c => c.status !== "suggested" && c.status !== "ignored"), sug = all.filter(c => c.status === "suggested");
    b.innerHTML = `<div class="gi-minis three"><div class="gi-mini"><small>Competitors tracked</small><b>${active.length}</b></div><div class="gi-mini"><small>AI suggestions waiting</small><b>${sug.length}</b></div><div class="gi-mini"><small>Last comparison</small><b>${d.report && d.report.generated_at ? esc(stamp(d.report.generated_at)) : "—"}</b></div></div>
      ${sug.length ? `<h3 class="gi-h3">Suggested by AI for your category and city</h3><div class="gi-cpgrid">${sug.map(card).join("")}</div>` : ""}
      ${active.length ? `<h3 class="gi-h3">Your competitors</h3><div class="gi-cpgrid">${active.map(card).join("")}</div>` : `<div class="gi-state">No competitors yet. Add the ones you know, or let Anaya find them near you.</div>`}
      ${report(d.report, d.own, active.length)}`;
    const run = $("#giCmpRun", b); if (run) run.onclick = () => research("analyze");
    $$(".gi-cp [data-a]", b).forEach(x => { x.onclick = async () => {
      const id = x.closest(".gi-cp").dataset.id, c = all.find(z => String(z.id) === id), a = x.dataset.a;
      if (a === "edit") form(c); else if (a === "accept") setStatus(id, "active"); else if (a === "ignore") setStatus(id, "ignored");
      else if (a === "delete" && await GI.confirm(`Remove ${c.name} from your competitor list?`, { title: "Remove competitor", confirmText: "Remove", danger: true })) { try { await GI.rpc("delete_growth_competitor", { p_id: id }); GI.toast("Competitor removed."); await GI.load("competitors", true); } catch (e) { GI.toast("Could not remove: " + (e.message || e)); } }
    }; });
  }

  GI.register({
    id: "competitors", order: 10, short: "Competitors", icon: IC.flag, title: "Competitor Analysis", sub: "You vs the businesses your customers also consider", rpc: "list_growth_competitors", lazy: true, ctrl, wire,
    load: async () => {
      const list = await GI.rpc("list_growth_competitors");
      const [r, o] = await Promise.allSettled([GI.rpc("get_growth_competitor_report"), GI.rpc("get_growth_own_profile")]);
      return { list: Array.isArray(list) ? list : [], report: r.status === "fulfilled" ? r.value : null, own: o.status === "fulfilled" ? o.value : null };
    },
    render,
    context: st => { const d = st.data || {}, out = (d.list || []).filter(c => c.status !== "ignored").slice(0, 5).map(c => `${c.name} (${c.source === "client" ? "added by client" : "AI found"}): followers ${isNum(num(c.followers)) ? num(c.followers) : "unknown"}, price ${c.price_note || "unknown"}, offers ${offersOf(c).join("/") || "none noted"}`); const r = d.report; if (r) { if (r.summary) out.push("AI summary: " + r.summary); (r.gaps || []).slice(0, 3).forEach(x => out.push("Gap: " + x)); (r.opportunities || []).slice(0, 3).forEach(x => out.push("Opportunity: " + x)); } return out; }
  });
})();
