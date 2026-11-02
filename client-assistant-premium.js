/* Anaya premium layer for the Client Assistant.
 * Purely presentational: it never touches the chat, approval or backend logic in client-assistant.js.
 * Uses the public GlimeAssistant.extend() hook plus DOM observers. */
(() => {
  'use strict';
  if (window.__glimeAnayaSkin) return;
  window.__glimeAnayaSkin = true;

  const AVATAR = 'glime-library/anaya-avatar-primary.webp';
  const NS = 'http://www.w3.org/2000/svg';
  const $ = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const ic = (name) => {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#i-' + name); s.appendChild(u); return s;
  };
  const hhmm = (ts) => { const d = new Date(ts); return isNaN(d) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); };
  let sayTimer = null;
  const say = (t) => { const s = $('status'); if (!s) return; s.textContent = t; clearTimeout(sayTimer); sayTimer = setTimeout(() => { s.textContent = ''; }, 3000); };

  /* ---------- Per-message decoration (avatar, name, time, ticks, actions) ---------- */
  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { const t = mk('textarea'); t.value = text; t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      say('Copied');
    } catch { say('Could not copy'); }
  }
  function iconBtn(name, label) {
    const b = mk('button'); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.appendChild(ic(name)); return b;
  }
  function decorate(row, msg) {
    if (!row || !msg) return;
    if (msg.role === 'user') {
      const b = row.querySelector('.bubble');
      if (b) b.appendChild(mk('div', 'bubble-meta', hhmm(msg.at) + ' \u2713\u2713'));
      return;
    }
    const av = mk('img', 'msg-avatar'); av.src = AVATAR; av.alt = ''; av.width = 34; av.height = 34;
    const head = mk('div', 'msg-head'); head.append(mk('b', null, 'Anaya'), mk('time', null, hhmm(msg.at)));
    row.prepend(av); av.after(head);
    if (!msg.text) return;
    const bar = mk('div', 'msg-actions');
    const up = iconBtn('up', 'Helpful'), down = iconBtn('down', 'Not helpful'), cp = iconBtn('copy', 'Copy answer');
    up.setAttribute('aria-pressed', 'false'); down.setAttribute('aria-pressed', 'false');
    up.addEventListener('click', () => { const on = up.getAttribute('aria-pressed') !== 'true'; up.setAttribute('aria-pressed', String(on)); down.setAttribute('aria-pressed', 'false'); say(on ? 'Thanks for the feedback' : ''); });
    down.addEventListener('click', () => { const on = down.getAttribute('aria-pressed') !== 'true'; down.setAttribute('aria-pressed', String(on)); up.setAttribute('aria-pressed', 'false'); say(on ? 'Thanks for the feedback' : ''); });
    cp.addEventListener('click', () => copyText(msg.text));
    bar.append(up, down, cp); row.appendChild(bar);
  }
  if (window.GlimeAssistant && typeof window.GlimeAssistant.extend === 'function') window.GlimeAssistant.extend({ onMessage: decorate });

  /* ---------- Report card -> stat cards + checklist (restyles what the backend already sends) ---------- */
  const kindIcon = (label) => {
    const s = String(label || '').toLowerCase();
    if (/sale|revenue|amount|earn|income/.test(s)) return 'cart';
    if (/lead|customer|client|user|contact/.test(s)) return 'users';
    if (/order|product|item|stock/.test(s)) return 'box';
    if (/appoint|booking|meeting|schedule/.test(s)) return 'cal';
    if (/conver|growth|rate|%|trend/.test(s)) return 'trend';
    return 'chart';
  };
  function upgradeReport(card) {
    const stats = Array.from(card.querySelectorAll('.change-box'));
    const list = card.querySelector(':scope > ul');
    if (!stats.length && !list) return;
    card.classList.add('rep-card');
    stats.forEach((b) => {
      const label = (b.querySelector('.label') || {}).textContent || '';
      const wrap = mk('span', 'rep-ic'); wrap.appendChild(ic(kindIcon(label)));
      b.classList.add('rep-stat'); b.prepend(wrap);
    });
    if (list) { const h = mk('div', 'rep-h'); h.append(ic('spark'), mk('span', null, 'Key insights')); card.insertBefore(h, list); }
  }
  const msgs = $('messages');
  if (msgs) {
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => {
      if (n.nodeType === 1 && n.matches('.message.assistant > section.card:not(.proposal):not(.credits):not(.rep-card)')) upgradeReport(n);
    }))).observe(msgs, { childList: true, subtree: true });
  }

  /* ---------- "Working on it" step progress (visual only, advances while waiting) ---------- */
  const ind = $('thinkingIndicator');
  if (ind) {
    const steps = Array.from(ind.querySelectorAll('.think-steps li'));
    let timer = null;
    const setStep = (i) => steps.forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('active', k === i); });
    const stop = () => { clearInterval(timer); timer = null; steps.forEach((li) => li.classList.remove('done', 'active')); };
    const run = () => { if (timer) return; let i = 0; setStep(0); timer = setInterval(() => { if (i < steps.length - 1) setStep(++i); }, 1600); };
    new MutationObserver(() => { ind.hidden ? stop() : run(); }).observe(ind, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* ---------- Mic (voice typing) <-> Send swap ---------- */
  const input = $('messageInput'), mic = $('micBtn'), send = $('sendBtn');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  function sync() {
    if (!input || !mic || !send) return;
    const showMic = !!SR && (!!rec || input.value.trim().length === 0);
    mic.hidden = !showMic; send.hidden = showMic;
  }
  if (SR && mic && input) {
    mic.addEventListener('click', () => {
      if (rec) { try { rec.stop(); } catch { /* already stopped */ } return; }
      const base = input.value.trim() ? input.value.trim() + ' ' : '';
      rec = new SR(); rec.lang = 'hi-IN'; rec.interimResults = true; rec.continuous = false;
      rec.onresult = (e) => {
        let t = ''; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        input.value = (base + t).slice(0, 2000); input.dispatchEvent(new Event('input'));
      };
      rec.onerror = (e) => say(e.error === 'not-allowed' ? 'Microphone permission is blocked.' : 'Voice input stopped.');
      rec.onend = () => { rec = null; mic.classList.remove('is-listening'); mic.setAttribute('aria-pressed', 'false'); sync(); input.focus(); };
      try { rec.start(); mic.classList.add('is-listening'); mic.setAttribute('aria-pressed', 'true'); say('Listening\u2026'); }
      catch { rec = null; }
      sync();
    });
  }
  if (input) input.addEventListener('input', sync);
  sync(); setInterval(sync, 300); // catches programmatic value changes (suggestion chips, after send)

  /* ---------- Scroll to latest ---------- */
  const box = $('conversationContainer'), dn = $('scrollDownBtn');
  if (box && dn) {
    const chk = () => { dn.hidden = box.scrollHeight - box.scrollTop - box.clientHeight < 160; };
    box.addEventListener('scroll', chk, { passive: true });
    dn.addEventListener('click', () => box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }));
    if (msgs) new MutationObserver(() => setTimeout(chk, 120)).observe(msgs, { childList: true });
    chk();
  }
})();
