/* GI — "Ask Anaya" hand-off.
 * Business Growth Intelligence is its own agent. Anaya (the AI Assistant) is a different agent. When the client taps
 * "Ask Anaya" on a card we show a short call screen (about 10 seconds, as if one agent is calling another), then open a
 * small chat window where Anaya has already been given that card's numbers and answers in that context.
 * Talks to the existing client-assistant endpoint: POST { message, history, request_id, thinking, attachments, conversation_id? }
 * -> { answer, conversation_id, proposal?, ui_actions? }. Approvals never happen here: if Anaya prepares an action,
 * the client is sent to the full AI Assistant to review it. */
(() => {
  "use strict";
  const { $, esc, IC } = GI;
  const CALL_MS = 10000, KEY = "glime.clientAssistant.conversationId";
  const A = { conv: null, history: [], busy: false, calling: null, title: "", first: true };
  const plain = s => String(s || "").replace(/&amp;/g, "&").replace(/<[^>]+>/g, "");
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 3 | 8)).toString(16); }));
  const av = (s = 40) => `<img class="gi-av" src="${GI.ANAYA_IMG}" alt="" width="${s}" height="${s}" decoding="async">`;

  function ctxText(id, lines) {
    const d = GI.def(id), L = (lines || GI.contextFor(id)).slice(0, 14);
    return ("[GROWTH INTELLIGENCE CONTEXT: a read-only snapshot from the client's Business Growth Intelligence page. Use only these numbers. If something is missing, say it is missing.]\n"
      + `Section: ${plain(d && d.title)}\nPeriod: ${GI.periodLabel()}\n` + (L.length ? "Data:\n" + L.map(x => "- " + x).join("\n") : "Data: (this section has no data loaded yet)")).slice(0, 1800);
  }

  /* ---------- call screen ---------- */
  function call(id, o) {
    const root = $("#giRoot"); closeChat();
    const steps = ["Connecting Business Growth Intelligence to Anaya…", `Sharing your ${plain(GI.def(id).title)} data…`, "Anaya is reading it…", "Anaya has joined"];
    const el = document.createElement("div"); el.className = "gi-call"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Calling Anaya");
    el.innerHTML = `<div class="gi-call-card"><div class="gi-call-from">Business Growth Intelligence <span>→</span> Anaya</div>
      <div class="gi-call-av"><i class="ring"></i><i class="ring r2"></i>${av(84)}</div><h3>Calling Anaya…</h3><p class="gi-call-step" aria-live="polite">${esc(steps[0])}</p>
      <div class="gi-call-bar"><i style="animation-duration:${CALL_MS}ms"></i></div><button class="gi-call-end" type="button" aria-label="Cancel call">${IC.phone}</button><small>Tap to cancel</small></div>`;
    root.appendChild(el);
    const timers = [], stepEl = el.querySelector(".gi-call-step"), end = () => { timers.forEach(clearTimeout); document.removeEventListener("keydown", onKey, true); el.remove(); A.calling = null; };
    const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); end(); } };
    document.addEventListener("keydown", onKey, true);
    [0.25, 0.5, 0.82].forEach((f, i) => timers.push(setTimeout(() => { stepEl.textContent = steps[i + 1]; }, CALL_MS * f)));
    timers.push(setTimeout(() => { end(); openChat(id, o); }, CALL_MS));
    el.querySelector(".gi-call-end").onclick = end; A.calling = { end };
    el.querySelector(".gi-call-end").focus();
  }

  /* ---------- chat window ---------- */
  const fmt = t => {
    const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n"); let out = "", ul = false;
    lines.forEach(l => { const m = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/); if (m) { if (!ul) { out += "<ul>"; ul = true; } out += `<li>${m[1]}</li>`; } else { if (ul) { out += "</ul>"; ul = false; } out += l.trim() ? `<p>${l}</p>` : ""; } });
    return out + (ul ? "</ul>" : "");
  };
  const msgs = () => $(".gi-an-msgs");
  function bubble(role, html, cls) { const m = msgs(); if (!m) return null; const b = document.createElement("div"); b.className = `gi-an-b ${role} ${cls || ""}`; b.innerHTML = html; m.appendChild(b); m.scrollTop = m.scrollHeight; return b; }
  function closeChat() { const c = $(".gi-an"); if (c) c.remove(); A.busy = false; }

  function openChat(id, o) {
    A.conv = null; A.history = []; A.first = true; A.title = plain(GI.def(id).title);
    const root = $("#giRoot"), el = document.createElement("div"); el.className = "gi-an"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Chat with Anaya");
    el.innerHTML = `<div class="gi-an-card"><header>${av(36)}<div><b>Anaya</b><small><i></i>Reading: ${esc(A.title)}</small></div><a class="gi-an-full" href="client-assistant.html" id="giAnFull">Open full chat</a><button class="gi-an-x" type="button" aria-label="Close chat">${IC.x}</button></header>
      <div class="gi-an-msgs" aria-live="polite"></div><div class="gi-an-chips" id="giAnChips"></div>
      <form class="gi-an-form" id="giAnForm"><textarea rows="1" maxlength="1000" placeholder="Ask Anaya a follow-up…" aria-label="Message to Anaya"></textarea><button type="submit" aria-label="Send">${IC.send}</button></form></div>`;
    root.appendChild(el);
    const ta = el.querySelector("textarea"), form = el.querySelector("#giAnForm");
    el.querySelector(".gi-an-x").onclick = closeChat;
    el.querySelector("#giAnFull").onclick = () => { try { if (A.conv) sessionStorage.setItem(KEY, A.conv); } catch { /* storage unavailable */ } };
    el.addEventListener("keydown", e => { if (e.key === "Escape") closeChat(); });
    form.onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t || A.busy) return; ta.value = ""; ta.style.height = ""; ask(id, t, null); };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } };
    ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(110, ta.scrollHeight) + "px"; };
    const q = (o && o.question) || "Explain what this section is telling me in simple words, what matters most, and the 2 or 3 best next steps.";
    bubble("me", fmt(q)); ask(id, q, o);
  }

  async function ask(id, text, o) {
    if (A.busy) return; A.busy = true; $("#giAnChips").innerHTML = "";
    if (!A.first) bubble("me", fmt(text));
    const typing = bubble("ai", `<span class="gi-dots"><i></i><i></i><i></i></span>`, "typing"), full = A.first ? ctxText(id, o && o.lines) + "\n\nQuestion: " + text : text;
    const body = { message: full, history: A.history.slice(-12), request_id: uuid(), thinking: false, attachments: [] }; if (A.conv) body.conversation_id = A.conv;
    try {
      const data = await GI.edge("client-assistant", body, 60000);
      if (typing) typing.remove();
      if (data.conversation_id) A.conv = data.conversation_id;
      const answer = typeof data.answer === "string" && data.answer.trim() ? data.answer.trim() : "I could not find an answer for that. Please try asking in a different way.";
      A.history.push({ role: "user", content: full.slice(0, 2000) }, { role: "assistant", content: answer.slice(0, 2000) }); A.first = false;
      bubble("ai", fmt(answer));
      if (data.proposal || (Array.isArray(data.ui_actions) && data.ui_actions.length)) bubble("ai", `<p>I prepared an action for you. Please open the full chat to review and approve it. Nothing is sent without your approval.</p>`, "note");
      const chips = $("#giAnChips"); if (chips) { chips.innerHTML = ["Why did this change?", "What should I do first?", "Make a 7-day plan"].map(c => `<button type="button">${c}</button>`).join(""); chips.querySelectorAll("button").forEach(b => { b.onclick = () => { if (!A.busy) ask(id, b.textContent, null); }; }); }
    } catch (e) {
      if (typing) typing.remove();
      const msg = e.code === "AUTH_REQUIRED" ? "Your session has expired. Please sign in again." : e.code === "CREDITS" ? "Your AI credits are finished. Add credits in Billing to continue chatting with Anaya." : e.code === "TIMEOUT" || e.code === "NETWORK" ? "I could not reach Anaya. Please check your connection." : "Anaya could not answer right now. Please try again.";
      const b = bubble("ai", `<p>${esc(msg)}</p>${e.code === "CREDITS" || e.code === "AUTH_REQUIRED" ? "" : `<button type="button" class="gi-link">Try again</button>`}`, "note err");
      const r = b && b.querySelector("button"); if (r) r.onclick = () => { b.remove(); A.busy = false; ask(id, text, o); };
    } finally { A.busy = false; const t = $(".gi-an textarea"); if (t && matchMedia("(pointer:fine)").matches) t.focus(); }
  }

  GI.askAnaya = (id, o) => { if (!GI.def(id) || A.calling) return; call(id, o || {}); };
})();
